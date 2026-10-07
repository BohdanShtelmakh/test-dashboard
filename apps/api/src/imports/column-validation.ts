import type { NormalizedColumn } from './import.types.js';

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

export function assertRowWidth(row: readonly unknown[], width: number): void {
  if (row.length > width) {
    throw new RangeError(
      `Row has ${row.length} cells but columns cover only ${width} positions`,
    );
  }
}
