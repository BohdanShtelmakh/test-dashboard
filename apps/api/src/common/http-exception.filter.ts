import { Catch, HttpException, Inject, Logger } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import type { Request } from 'express';

@Catch()
export class HttpExceptionFilter extends BaseExceptionFilter<unknown> {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(
    @Inject(HttpAdapterHost)
    protected readonly httpAdapterHost: HttpAdapterHost,
  ) {
    super();
  }

  override catch(exception: unknown, host: ArgumentsHost): void {
    const httpException = exception instanceof HttpException;
    const middlewareError = !httpException && this.isHttpError(exception);
    const candidate = httpException
      ? exception.getStatus()
      : middlewareError
        ? exception.statusCode
        : 500;
    const status =
      Number.isInteger(candidate) && candidate >= 400 && candidate < 600
        ? candidate
        : 500;

    if (status < 500) {
      // Delegate to Nest to preserve validation arrays and custom HTTP bodies.
      super.catch(
        httpException
          ? exception
          : new HttpException(
              {
                statusCode: status,
                message: middlewareError ? exception.message : 'Request failed',
              },
              status,
            ),
        host,
      );
      return;
    }

    const request = host.switchToHttp().getRequest<Request>();
    let cause: unknown = exception;
    const seen = new Set<unknown>();
    let code: string | undefined;
    for (let depth = 0; depth < 10; depth++) {
      if (!cause || typeof cause !== 'object' || seen.has(cause)) break;
      seen.add(cause);
      if (
        'code' in cause &&
        typeof cause.code === 'string' &&
        /^[A-Z0-9_]{1,32}$/.test(cause.code)
      ) {
        code = cause.code;
      }
      if (
        !('cause' in cause) ||
        cause.cause === undefined ||
        seen.has(cause.cause)
      )
        break;
      cause = cause.cause;
    }
    this.logger.error({
      message: 'HTTP request failed',
      method: request.method,
      route:
        typeof request.route?.path === 'string'
          ? request.route.path
          : '(unmatched route)',
      statusCode: status,
      errorType:
        cause instanceof Error &&
        /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(cause.name)
          ? cause.name
          : 'UnknownError',
      code,
    });
    // Never serialize raw server exceptions, SQL, parameters, or error causes.
    // Nest also handles responses whose headers have already been sent.
    super.catch(
      new HttpException(
        { statusCode: status, message: 'Internal server error' },
        status,
      ),
      host,
    );
  }
}
