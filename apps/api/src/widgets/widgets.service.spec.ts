import { InternalServerErrorException } from '@nestjs/common';
import { vi } from 'vitest';
import type { DatabaseService } from '../database/database.service.js';
import { WidgetsService } from './widgets.service.js';
import { GeneratedDatasetFactory } from './generated-dataset.factory.js';
import { SchemaRegistry } from '../imports/schema-registry.js';

describe('WidgetsService errors', () => {
  it('maps database failures to safe 500 exceptions', async () => {
    const database = {
      db: {
        select: vi.fn(() => {
          throw new Error('SQL and private parameters');
        }),
      },
    } as unknown as DatabaseService;
    const service = new WidgetsService(
      database,
      new GeneratedDatasetFactory(),
      new SchemaRegistry(),
    );
    await expect(service.findAll()).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    await expect(service.findOne('id')).rejects.toMatchObject({
      message: 'Unable to load widget',
      status: 500,
    });
  });
});
