import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { datasetSchemas } from './dataset-schemas.js';
import { datasetOrigin } from './enums.js';
import { sourceFiles } from './source-files.js';

export const datasets = pgTable(
  'datasets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceFileId: uuid('source_file_id').references(() => sourceFiles.id, {
      onDelete: 'cascade',
    }),
    schemaId: uuid('schema_id')
      .notNull()
      .references(() => datasetSchemas.id, { onDelete: 'restrict' }),
    origin: datasetOrigin('origin').notNull(),
    name: text('name').notNull(),
    sheetName: text('sheet_name'),
    rowCount: integer('row_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('datasets_source_file_id_name_unique').on(
      table.sourceFileId,
      table.name,
    ),
    check('datasets_row_count_nonnegative', sql`${table.rowCount} >= 0`),
    check(
      'datasets_origin_source_file_check',
      sql`
    (${table.origin} = 'FILE' AND ${table.sourceFileId} IS NOT NULL)
    OR (${table.origin} = 'GENERATED' AND ${table.sourceFileId} IS NULL)
  `,
    ),
    index('datasets_schema_id_idx').on(table.schemaId),
  ],
);
