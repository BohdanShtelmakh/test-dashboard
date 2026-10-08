import type { DatabaseService } from './database.service.js';

export interface NormalizedColumn {
  position: number;
  name: string;
  key: string;
}

export type InferredColumnType =
  'STRING' | 'INTEGER' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'DATETIME';

export interface InferredColumn extends NormalizedColumn {
  type: InferredColumnType;
  nullable: boolean;
}

// Persistence helpers require the caller's transaction, never the global client.
export type DatabaseTransaction = Parameters<
  Parameters<DatabaseService['db']['transaction']>[0]
>[0];

export function columnWidth(columns: readonly NormalizedColumn[]): number {
  const positions = new Set<number>();
  const keys = new Set<string>();
  let width = 0;
  for (const column of columns) {
    if (
      !Number.isSafeInteger(column.position) ||
      column.position < 0 ||
      positions.has(column.position)
    ) {
      throw new TypeError(
        'Column positions must be unique nonnegative integers',
      );
    }
    if (
      typeof column.key !== 'string' ||
      !column.key.trim() ||
      keys.has(column.key)
    ) {
      throw new TypeError('Column keys must be unique non-empty strings');
    }
    positions.add(column.position);
    keys.add(column.key);
    width = Math.max(width, column.position + 1);
  }
  return width;
}
