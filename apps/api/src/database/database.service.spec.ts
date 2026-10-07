import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import { DatabaseService } from './database.service.js';

describe('DatabaseService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('exposes Drizzle and closes its pool when Nest shuts down', async () => {
    const end = vi.spyOn(Pool.prototype, 'end');
    const module = await Test.createTestingModule({
      providers: [
        DatabaseService,
        {
          provide: ConfigService,
          useValue: new ConfigService({
            DATABASE_URL: 'postgresql://dashboard:dashboard@localhost:5432/dashboard',
          }),
        },
      ],
    }).compile();

    expect(module.get(DatabaseService).db).toBeDefined();
    await module.close();
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('rejects missing configuration', () => {
    vi.stubEnv('DATABASE_URL', undefined);
    expect(() => new DatabaseService(new ConfigService())).toThrow('DATABASE_URL');
  });

  it('rejects empty configuration instead of using pg defaults', () => {
    expect(() => new DatabaseService(new ConfigService({ DATABASE_URL: ' ' })))
      .toThrow('DATABASE_URL must not be empty');
  });
});
