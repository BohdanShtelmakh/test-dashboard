import { pgEnum } from 'drizzle-orm/pg-core';

export const sourceFileFormat = pgEnum('source_file_format', ['CSV', 'XLSX']);
export const datasetColumnType = pgEnum('dataset_column_type', [
  'STRING',
  'INTEGER',
  'NUMBER',
  'BOOLEAN',
  'DATE',
  'DATETIME',
]);
export const datasetOrigin = pgEnum('dataset_origin', ['FILE', 'GENERATED']);
export const widgetType = pgEnum('widget_type', [
  'LINE',
  'BAR',
  'STACKED_BAR',
  'PIE',
  'TEXT',
]);
