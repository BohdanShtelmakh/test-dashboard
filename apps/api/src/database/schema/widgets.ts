import { sql } from 'drizzle-orm';
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { datasets } from './datasets.js';
import { widgetType } from './enums.js';

export const widgets = pgTable(
  'widgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: widgetType('type').notNull(),
    title: text('title').notNull(),
    datasetId: uuid('dataset_id').references(() => datasets.id, {
      onDelete: 'restrict',
    }),
    config: jsonb('config')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    text: text('text'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'widgets_type_dataset_check',
      sql`
    (${table.type} = 'TEXT' AND ${table.datasetId} IS NULL)
    OR (${table.type} IN ('LINE', 'BAR', 'STACKED_BAR', 'PIE') AND ${table.datasetId} IS NOT NULL)
  `,
    ),
    index('widgets_dataset_id_idx').on(table.datasetId),
  ],
);
