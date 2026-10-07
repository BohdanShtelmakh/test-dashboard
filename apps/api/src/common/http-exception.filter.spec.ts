import {
  BadRequestException,
  HttpException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { createRequire } from 'node:module';
import { HttpExceptionFilter } from './http-exception.filter.js';

const httpError = createRequire(import.meta.url)('http-errors') as (
  status: number,
  message: string,
) => Error;

function setup(headersSent = false) {
  const response = {};
  const adapter = {
    reply: vi.fn(),
    end: vi.fn(),
    isHeadersSent: vi.fn(() => headersSent),
  };
  const adapterHost = { httpAdapter: adapter } as unknown as HttpAdapterHost;
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'GET',
        route: { path: '/api/widgets/:id' },
        originalUrl: '/api/widgets/id?token=private-token',
        body: { password: 'secret' },
      }),
    }),
    getArgByIndex: () => response,
  } as unknown as ArgumentsHost;
  const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  return {
    filter: new HttpExceptionFilter(adapterHost),
    host,
    response,
    adapter,
    log,
  };
}

describe('HttpExceptionFilter', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([400, 401, 403, 404, 409, 418, 422, 429])(
    'preserves HTTP %i bodies without error logging',
    (status) => {
      const { filter, host, response, adapter, log } = setup();
      const body = {
        statusCode: status,
        message: ['Expected error'],
        error: 'Request rejected',
      };
      filter.catch(new HttpException(body, status), host);
      expect(adapter.reply).toHaveBeenCalledWith(response, body, status);
      expect(log).not.toHaveBeenCalled();
    },
  );

  it('preserves validation message arrays', () => {
    const { filter, host, response, adapter, log } = setup();
    const error = new BadRequestException([
      'type must be one of the allowed values',
    ]);
    filter.catch(error, host);
    expect(adapter.reply).toHaveBeenCalledWith(
      response,
      error.getResponse(),
      400,
    );
    expect(log).not.toHaveBeenCalled();
  });

  it('preserves string HTTP responses and Nest error codes', () => {
    const { filter, host, response, adapter } = setup();
    filter.catch(
      new HttpException('Expected conflict', 409, {
        errorCode: 'WIDGET_CONFLICT',
      }),
      host,
    );
    expect(adapter.reply).toHaveBeenCalledWith(
      response,
      {
        statusCode: 409,
        message: 'Expected conflict',
        errorCode: 'WIDGET_CONFLICT',
      },
      409,
    );
  });

  it.each([400, 413])('preserves middleware HTTP %i errors', (status) => {
    const { filter, host, response, adapter, log } = setup();
    filter.catch(httpError(status, 'Invalid request'), host);
    expect(adapter.reply).toHaveBeenCalledWith(
      response,
      { statusCode: status, message: 'Invalid request' },
      status,
    );
    expect(log).not.toHaveBeenCalled();
  });

  it.each([500, 502, 503, 504])(
    'sanitizes HTTP %i failures and logs once',
    (status) => {
      const { filter, host, response, adapter, log } = setup();
      filter.catch(
        new HttpException(
          { message: 'private SQL', parameters: ['secret'] },
          status,
        ),
        host,
      );
      expect(adapter.reply).toHaveBeenCalledWith(
        response,
        { statusCode: status, message: 'Internal server error' },
        status,
      );
      expect(log).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(log.mock.calls)).not.toMatch(
        /private SQL|secret|private-token/,
      );
    },
  );

  it.each([
    new Error('private message'),
    new TypeError('private message'),
    new AggregateError([new Error('secret')], 'private message'),
    'private message',
    null,
    undefined,
    0,
    false,
    {},
    { message: 'private message' },
    { status: 404, message: 'private message' },
    Object.assign(new Error('private message'), { statusCode: 401 }),
  ])('handles unexpected thrown value %# as a safe 500', (error) => {
    const { filter, host, response, adapter, log } = setup();
    filter.catch(error, host);
    expect(adapter.reply).toHaveBeenCalledWith(
      response,
      { statusCode: 500, message: 'Internal server error' },
      500,
    );
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(
      /private message|secret|private-token/,
    );
  });

  it('preserves valid plain middleware status objects', () => {
    const { filter, host, response, adapter, log } = setup();
    filter.catch({ statusCode: 422, message: 'Invalid request' }, host);
    expect(adapter.reply).toHaveBeenCalledWith(
      response,
      { statusCode: 422, message: 'Invalid request' },
      422,
    );
    expect(log).not.toHaveBeenCalled();
  });

  it('sanitizes middleware server errors', () => {
    const { filter, host, response, adapter } = setup();
    filter.catch(httpError(503, 'private connection details'), host);
    expect(adapter.reply).toHaveBeenCalledWith(
      response,
      { statusCode: 503, message: 'Internal server error' },
      503,
    );
  });

  it('logs a nested database cause without leaking request or query details', () => {
    const { filter, host, log } = setup();
    const driver = Object.assign(new Error('private SQL'), { code: '23503' });
    const drizzle = new Error('secret parameters', { cause: driver });
    filter.catch(
      new InternalServerErrorException('Unable to create widget', {
        cause: drizzle,
      }),
      host,
    );
    expect(log).toHaveBeenCalledExactlyOnceWith({
      message: 'HTTP request failed',
      method: 'GET',
      route: '/api/widgets/:id',
      statusCode: 500,
      errorType: 'Error',
      code: '23503',
    });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(
      /private SQL|secret|private-token/,
    );
  });

  it('handles circular causes and rejects unsafe diagnostic codes', () => {
    const { filter, host, log } = setup();
    const error = Object.assign(new Error('secret'), {
      code: 'postgresql://private-password',
      cause: undefined as unknown,
    });
    error.cause = error;
    expect(() => filter.catch(error, host)).not.toThrow();
    expect(log.mock.calls[0][0]).toMatchObject({ code: undefined });
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-password');
  });

  it.each([0, 200, 700, NaN])(
    'normalizes invalid exception status %s to 500',
    (status) => {
      const { filter, host, response, adapter } = setup();
      filter.catch(new HttpException('secret', status), host);
      expect(adapter.reply).toHaveBeenCalledWith(
        response,
        { statusCode: 500, message: 'Internal server error' },
        500,
      );
    },
  );

  it('does not send a second response after headers are sent', () => {
    const { filter, host, response, adapter, log } = setup(true);
    filter.catch(new Error('private message'), host);
    expect(adapter.reply).not.toHaveBeenCalled();
    expect(adapter.end).toHaveBeenCalledWith(response);
    expect(log).toHaveBeenCalledTimes(1);
  });
});
