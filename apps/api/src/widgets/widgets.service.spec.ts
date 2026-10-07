import {
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { vi } from 'vitest';
import type { DatabaseService } from '../database/database.service.js';
import { WidgetsService } from './widgets.service.js';
import { GeneratedDatasetFactory } from './generated-dataset.factory.js';
import { SchemaRegistry } from '../imports/schema-registry.js';

describe('WidgetsService errors', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(['findAll', 'findOne', 'create', 'updateText', 'delete'] as const)(
    'retains the cause for centralized logging in %s',
    async (operation) => {
      const log = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});
      const driverError = Object.assign(
        new Error('SQL and private parameters'),
        { code: '23503' },
      );
      const failure = new Error('Query with secret parameters', {
        cause: driverError,
      });
      const fail = vi.fn(() => {
        throw failure;
      });
      const database = {
        db: { select: fail, transaction: fail },
      } as unknown as DatabaseService;
      const service = new WidgetsService(
        database,
        new GeneratedDatasetFactory(),
        new SchemaRegistry(),
      );
      const result =
        operation === 'findAll'
          ? service.findAll()
          : operation === 'findOne'
            ? service.findOne('id')
            : operation === 'create'
              ? service.create('TEXT')
              : operation === 'updateText'
                ? service.updateText('id', 'Draft')
                : service.delete('id');
      const exception = await result.catch((error: unknown) => error);
      expect(exception).toBeInstanceOf(InternalServerErrorException);
      expect(exception).toMatchObject({ cause: failure, status: 500 });
      expect(log).not.toHaveBeenCalled();
      expect(
        (exception as InternalServerErrorException).getResponse(),
      ).not.toHaveProperty('cause');
    },
  );

  it('preserves expected HTTP errors without logging them as server failures', async () => {
    const log = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const missing = new NotFoundException('Widget not found');
    const database = {
      db: { transaction: vi.fn().mockRejectedValue(missing) },
    } as unknown as DatabaseService;
    const service = new WidgetsService(
      database,
      new GeneratedDatasetFactory(),
      new SchemaRegistry(),
    );
    await expect(service.updateText('missing', 'Draft')).rejects.toBe(missing);
    await expect(service.delete('missing')).rejects.toBe(missing);
    expect(log).not.toHaveBeenCalled();
  });
});
