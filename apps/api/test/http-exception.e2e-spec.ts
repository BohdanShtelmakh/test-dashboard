import {
  Body,
  Controller,
  Get,
  HttpException,
  Logger,
  Param,
  Post,
  ValidationPipe,
} from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/http-exception.filter.js';
import { CreateWidgetDto } from '../src/widgets/widgets.dto.js';

@Controller('errors')
class ErrorController {
  @Get(':kind')
  fail(@Param('kind') kind: string): never {
    if (kind === 'conflict')
      throw new HttpException(
        { statusCode: 409, message: 'Expected conflict' },
        409,
      );
    if (kind === 'unavailable')
      throw new HttpException('secret infrastructure details', 503);
    if (kind === 'null') throw null;
    throw new Error('SQL with secret parameters');
  }

  @Post()
  validate(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        expectedType: CreateWidgetDto,
      }),
    )
    body: CreateWidgetDto,
  ) {
    return body;
  }
}

describe('global HTTP exception filter (e2e)', () => {
  let app: INestApplication;
  let log: ReturnType<typeof vi.spyOn>;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ErrorController],
      providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  beforeEach(() => {
    log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => app?.close());

  it.each([
    ['unexpected', 500],
    ['null', 500],
    ['unavailable', 503],
  ] as const)('sanitizes %s failures and logs once', async (kind, status) => {
    const response = await request(app.getHttpServer())
      .get(`/errors/${kind}?token=private-token`)
      .expect(status);
    expect(response.body).toEqual({
      statusCode: status,
      message: 'Internal server error',
    });
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret|private-token/);
  });
  it('preserves expected conflicts without server-error logs', async () => {
    const response = await request(app.getHttpServer())
      .get('/errors/conflict')
      .expect(409);
    expect(response.body).toEqual({
      statusCode: 409,
      message: 'Expected conflict',
    });
    expect(log).not.toHaveBeenCalled();
  });
  it('preserves validation errors', async () => {
    const response = await request(app.getHttpServer())
      .post('/errors')
      .send({ type: 'INVALID', extra: true })
      .expect(400);
    expect(response.body.message).toEqual(
      expect.arrayContaining([
        expect.stringContaining('type'),
        expect.stringContaining('extra'),
      ]),
    );
    expect(log).not.toHaveBeenCalled();
  });
  it('handles malformed JSON from the body parser as 400', async () => {
    const response = await request(app.getHttpServer())
      .post('/errors')
      .set('Content-Type', 'application/json')
      .send('{broken')
      .expect(400);
    expect(response.body.statusCode).toBe(400);
    expect(log).not.toHaveBeenCalled();
  });
  it('handles oversized JSON from the body parser as 413', async () => {
    await request(app.getHttpServer())
      .post('/errors')
      .send({ text: 'x'.repeat(110_000) })
      .expect(413);
    expect(log).not.toHaveBeenCalled();
  });
  it('preserves unknown-route 404 responses', async () => {
    const response = await request(app.getHttpServer())
      .get('/missing')
      .expect(404);
    expect(response.body.statusCode).toBe(404);
    expect(log).not.toHaveBeenCalled();
  });
});
