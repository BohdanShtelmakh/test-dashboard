import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  integer,
  jsonb,
  pgTable,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { datasets } from './datasets.js';

export const datasetRows = pgTable(
  'dataset_rows',
  {
    id: bigint('id', { mode: 'bigint' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    datasetId: uuid('dataset_id')
      .notNull()
      .references(() => datasets.id, { onDelete: 'cascade' }),
    rowIndex: integer('row_index').notNull(),
    values: jsonb('values').$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    unique('dataset_rows_dataset_id_row_index_unique').on(
      table.datasetId,
      table.rowIndex,
    ),
    check('dataset_rows_row_index_nonnegative', sql`${table.rowIndex} >= 0`),
  ],
);
