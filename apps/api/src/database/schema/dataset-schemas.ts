import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const datasetSchemas = pgTable('dataset_schemas', {
  id: uuid('id').primaryKey().defaultRandom(),
  fingerprint: varchar('fingerprint', { length: 64 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
