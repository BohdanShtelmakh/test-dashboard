import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { datasetRows, datasets } from '../database/schema/index.js';
import type { ImportTransaction } from './import-transaction.js';
import type { InferredColumn } from './import.types.js';
import type { RawCellValue } from './parsing/parser.types.js';
import { ValueNormalizer } from './value-normalizer.js';

export const DEFAULT_IMPORT_BATCH_SIZE = 500;

@Injectable()
export class DatasetWriter {
  constructor(
    @Inject(ValueNormalizer) private readonly values: ValueNormalizer,
  ) {}

  async write(
    tx: ImportTransaction,
    datasetId: string,
    columns: readonly InferredColumn[],
    rows: AsyncIterable<RawCellValue[]>,
    batchSize = DEFAULT_IMPORT_BATCH_SIZE,
  ): Promise<number> {
    if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
      throw new RangeError('Batch size must be a positive safe integer');
    }
    let batch: (typeof datasetRows.$inferInsert)[] = [];
    let rowCount = 0;
    for await (const row of rows) {
      batch.push({
        datasetId,
        rowIndex: rowCount++,
        values: this.values.normalize(columns, row),
      });
      if (batch.length === batchSize) {
        await tx.insert(datasetRows).values(batch);
        batch = [];
      }
    }
    if (batch.length) await tx.insert(datasetRows).values(batch);
    const [updated] = await tx
      .update(datasets)
      .set({ rowCount })
      .where(eq(datasets.id, datasetId))
      .returning({ id: datasets.id });
    if (!updated) throw new Error('Dataset disappeared while writing rows');
    return rowCount;
  }
}
