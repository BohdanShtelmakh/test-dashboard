import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

describe('Application routes (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('returns 404 for the removed starter endpoint', () => {
    return request(app.getHttpServer())
      .get('/api')
      .expect(404)
      .expect(({ body }) => {
        expect(body.statusCode).toBe(404);
        expect(body.error).toBe('Not Found');
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
