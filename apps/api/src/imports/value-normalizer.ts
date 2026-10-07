import { Injectable } from '@nestjs/common';
import { assertRowWidth, columnWidth } from './column-validation.js';
import type { InferredColumn } from './import.types.js';
import type { RawCellValue } from './parsing/parser.types.js';
import {
  booleanValue,
  dateOnlyValue,
  datetimeValue,
  isEmpty,
  numericValue,
} from './scalar-values.js';

export class ValueNormalizationError extends Error {
  constructor(readonly column: InferredColumn) {
    super(
      `Cannot normalize column "${column.key}" at position ${column.position} as ${column.type}`,
    );
    this.name = 'ValueNormalizationError';
  }
}

function normalizeValue(
  column: InferredColumn,
  value: RawCellValue | undefined,
): unknown {
  if (isEmpty(value)) return null;
  switch (column.type) {
    case 'INTEGER': {
      const numeric = numericValue(value);
      if (numeric && Number.isSafeInteger(numeric.value)) return numeric.value;
      break;
    }
    case 'NUMBER': {
      const numeric = numericValue(value);
      if (numeric) return numeric.value;
      break;
    }
    case 'BOOLEAN': {
      const boolean = booleanValue(value);
      if (boolean !== undefined) return boolean;
      break;
    }
    case 'DATE': {
      const date = dateOnlyValue(value);
      if (date !== undefined) return date;
      if (value instanceof Date && Number.isFinite(value.getTime())) {
        const iso = value.toISOString();
        if (iso.endsWith('T00:00:00.000Z')) return iso.slice(0, 10);
      }
      break;
    }
    case 'DATETIME': {
      const datetime = datetimeValue(value);
      if (datetime !== undefined) return datetime;
      const date = dateOnlyValue(value);
      if (date !== undefined) return `${date}T00:00:00.000Z`;
      break;
    }
    case 'STRING':
      if (!(value instanceof Date)) return String(value);
      if (Number.isFinite(value.getTime())) return value.toISOString();
      break;
  }
  throw new ValueNormalizationError(column);
}

@Injectable()
export class ValueNormalizer {
  normalize(
    columns: readonly InferredColumn[],
    row: readonly RawCellValue[],
  ): Record<string, unknown> {
    assertRowWidth(row, columnWidth(columns));
    return Object.fromEntries(
      columns.map((column) => [
        column.key,
        normalizeValue(column, row[column.position]),
      ]),
    );
  }
}
