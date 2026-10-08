import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import { AppModule } from '../app.module.js';
import { DatabaseService } from './database.service.js';

describe('DatabaseService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('shares one pool across application modules and closes it when Nest shuts down', async () => {
    const on = vi.spyOn(Pool.prototype, 'on');
    const end = vi.spyOn(Pool.prototype, 'end');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          DATABASE_URL:
            'postgresql://dashboard:dashboard@localhost:5432/dashboard',
        }),
      )
      .compile();
    try {
      expect(module.get(DatabaseService).db).toBeDefined();
      const pools = new Set(
        on.mock.contexts.filter((context) => context instanceof Pool),
      );
      expect(pools.size).toBe(1);
    } finally {
      await module.close();
    }
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('handles idle pool errors without throwing or logging connection secrets', async () => {
    const log = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const on = vi.spyOn(Pool.prototype, 'on');
    const service = new DatabaseService(
      new ConfigService({
        DATABASE_URL:
          'postgresql://dashboard:dashboard@localhost:5432/dashboard',
      }),
    );
    const pool = on.mock.contexts.find(
      (context) => context instanceof Pool,
    ) as Pool;
    const error = Object.assign(new Error('private connection details'), {
      code: '57P01',
    });
    try {
      expect(() => pool.emit('error', error)).not.toThrow();
      expect(log).toHaveBeenCalledWith({
        message: 'Idle database connection failed',
        errorType: 'Error',
        code: '57P01',
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain(
        'private connection details',
      );
      expect(service.db).toBeDefined();
    } finally {
      await service.onApplicationShutdown();
    }
  });

  it('rejects missing configuration', () => {
    vi.stubEnv('DATABASE_URL', undefined);
    expect(() => new DatabaseService(new ConfigService())).toThrow(
      'DATABASE_URL',
    );
  });

  it('rejects empty configuration instead of using pg defaults', () => {
    expect(
      () => new DatabaseService(new ConfigService({ DATABASE_URL: ' ' })),
    ).toThrow('DATABASE_URL must not be empty');
  });
});
