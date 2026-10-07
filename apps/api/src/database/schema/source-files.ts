import {
  bigint,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sourceFileFormat } from './enums.js';

export const sourceFiles = pgTable('source_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  originalName: text('original_name').notNull(),
  format: sourceFileFormat('format').notNull(),
  mimeType: text('mime_type'),
  size: bigint('size', { mode: 'bigint' }).notNull(),
  checksum: varchar('checksum', { length: 64 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
