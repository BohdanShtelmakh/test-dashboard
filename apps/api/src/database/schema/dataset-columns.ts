import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { datasetSchemas } from './dataset-schemas.js';
import { datasetColumnType } from './enums.js';

export const datasetColumns = pgTable(
  'dataset_columns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schemaId: uuid('schema_id')
      .notNull()
      .references(() => datasetSchemas.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    name: text('name').notNull(),
    key: text('key').notNull(),
    type: datasetColumnType('type').notNull(),
    nullable: boolean('nullable').notNull().default(false),
  },
  (table) => [
    unique('dataset_columns_schema_id_position_unique').on(
      table.schemaId,
      table.position,
    ),
    unique('dataset_columns_schema_id_key_unique').on(
      table.schemaId,
      table.key,
    ),
    check('dataset_columns_position_nonnegative', sql`${table.position} >= 0`),
  ],
);
