import { vi } from 'vitest';
import { datasetRows } from '../database/schema/index.js';
import type {
  DatabaseTransaction,
  InferredColumn,
} from '../database/dataset.contract.js';
import { DatasetWriter } from './dataset-persistence.js';
import { ValueNormalizer } from './data-normalization.js';

describe('dataset-writer', () => {
  const columns: InferredColumn[] = [
    {
      position: 0,
      name: 'Value',
      key: 'value',
      type: 'INTEGER',
      nullable: false,
    },
  ];

  function transaction() {
    const batches: (typeof datasetRows.$inferInsert)[][] = [];
    const insertValues = vi.fn((batch: (typeof datasetRows.$inferInsert)[]) => {
      batches.push(batch);
      return Promise.resolve();
    });
    const returning = vi.fn().mockResolvedValue([{ id: 'dataset' }]);
    const set = vi
      .fn()
      .mockReturnValue({ where: vi.fn().mockReturnValue({ returning }) });
    const tx = {
      insert: vi.fn().mockReturnValue({ values: insertValues }),
      update: vi.fn().mockReturnValue({ set }),
    };
    return {
      tx: tx as unknown as DatabaseTransaction,
      batches,
      insertValues,
      returning,
      set,
    };
  }

  async function* rows(count: number) {
    for (let index = 0; index < count; index++) yield [String(index)];
  }

  describe('DatasetWriter', () => {
    const writer = new DatasetWriter(new ValueNormalizer());

    it('writes bounded batches with sequential indexes and final row_count', async () => {
      const { tx, batches, set } = transaction();
      expect(await writer.write(tx, 'dataset', columns, rows(1001))).toBe(1001);
      expect(batches.map((batch) => batch.length)).toEqual([500, 500, 1]);
      expect(batches.flat().map((row) => row.rowIndex)).toEqual(
        Array.from({ length: 1001 }, (_, index) => index),
      );
      expect(batches[2][0]).toMatchObject({
        datasetId: 'dataset',
        values: { value: 1000 },
      });
      expect(set).toHaveBeenCalledWith({ rowCount: 1001 });
    });

    it('supports a smaller batch size and empty datasets', async () => {
      const small = transaction();
      await writer.write(small.tx, 'dataset', columns, rows(5), 2);
      expect(small.batches.map((batch) => batch.length)).toEqual([2, 2, 1]);
      const empty = transaction();
      expect(await writer.write(empty.tx, 'dataset', columns, rows(0))).toBe(0);
      expect(empty.batches).toEqual([]);
      expect(empty.set).toHaveBeenCalledWith({ rowCount: 0 });
    });

    it('stops consumption and propagates a failed insert without updating counts', async () => {
      const { tx, insertValues, set } = transaction();
      const closed = vi.fn();
      async function* source() {
        try {
          yield* rows(10);
        } finally {
          closed();
        }
      }
      insertValues.mockRejectedValueOnce(new Error('insert failed'));
      await expect(
        writer.write(tx, 'dataset', columns, source(), 2),
      ).rejects.toThrow('insert failed');
      expect(closed).toHaveBeenCalledOnce();
      expect(set).not.toHaveBeenCalled();
    });

    it('fails rather than reporting success when its dataset is missing', async () => {
      const { tx, returning } = transaction();
      returning.mockResolvedValueOnce([]);
      await expect(
        writer.write(tx, 'dataset', columns, rows(0)),
      ).rejects.toThrow('disappeared');
    });

    it.each([0, -1, 1.5])('rejects invalid batch size %s', async (size) => {
      const { tx, insertValues } = transaction();
      await expect(
        writer.write(tx, 'dataset', columns, rows(1), size),
      ).rejects.toThrow(RangeError);
      expect(insertValues).not.toHaveBeenCalled();
    });
  });
});
