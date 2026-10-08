import { columnWidth } from '../database/dataset.contract.js';
import type {
  RawCellValue,
  ScalarCellValue,
} from './parsing/parser.contract.js';
import type {
  NormalizedColumn,
  InferredColumn,
  InferredColumnType,
} from '../database/dataset.contract.js';
import { Injectable } from '@nestjs/common';

export function rawCell(
  value: RawCellValue | undefined,
): ScalarCellValue | undefined {
  return value !== null && typeof value === 'object' && 'kind' in value
    ? value.raw
    : value;
}

/** Recognize calendar displays only; never infer dates from a numeric range. */
export function xlsxDateValue(
  value: RawCellValue | undefined,
): { type: 'DATE' | 'DATETIME'; iso: string } | undefined {
  if (
    !value ||
    typeof value !== 'object' ||
    !('kind' in value) ||
    typeof value.raw !== 'number' ||
    !Number.isFinite(value.raw) ||
    typeof value.formatted !== 'string'
  )
    return undefined;
  // xlstream uses the Excel 1900 calendar. Serial 60 is Excel's fictitious
  // 1900-02-29 and cannot be represented as a valid ISO calendar date.
  const serial = value.raw;
  if (serial < 0 || Math.floor(serial) === 60) return undefined;
  const epoch = Date.UTC(1899, 11, serial < 60 ? 31 : 30);
  const date = new Date(epoch + Math.round(serial * 86_400_000));
  if (!Number.isFinite(date.getTime())) return undefined;
  const iso = date.toISOString();
  const display = value.formatted.trim();
  const match =
    /^(?:(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})\/(\d{1,2})\/(\d{4}))(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(?:\s*(AM|PM))?)?$/i.exec(
      display,
    );
  if (!match) return undefined;
  const year = Number(match[1] ?? match[6]);
  const month = Number(match[2] ?? match[4]);
  const day = Number(match[3] ?? match[5]);
  if (
    year !== date.getUTCFullYear() ||
    month !== date.getUTCMonth() + 1 ||
    day !== date.getUTCDate()
  )
    return undefined;
  const hasTime = match[7] !== undefined;
  if (hasTime) {
    let hour = Number(match[7]);
    if (match[11]) {
      if (hour < 1 || hour > 12) return undefined;
      hour = (hour % 12) + (match[11].toUpperCase() === 'PM' ? 12 : 0);
    }
    if (
      hour !== date.getUTCHours() ||
      Number(match[8]) !== date.getUTCMinutes() ||
      (match[9] !== undefined && Number(match[9]) !== date.getUTCSeconds()) ||
      (match[10] !== undefined &&
        Number(match[10].padEnd(3, '0')) !== date.getUTCMilliseconds())
    )
      return undefined;
  }
  // Preserve hidden time components too rather than truncating a fractional day.
  const type = hasTime || !Number.isInteger(serial) ? 'DATETIME' : 'DATE';
  return { type, iso: type === 'DATE' ? iso.slice(0, 10) : iso };
}

export function isEmpty(value: RawCellValue | undefined): boolean {
  value = rawCell(value);
  return (
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim() === '')
  );
}

export function numericValue(
  value: RawCellValue | undefined,
): { value: number; type: 'INTEGER' | 'NUMBER' } | undefined {
  value = rawCell(value);
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  const text = typeof value === 'string' ? value.trim() : undefined;
  // Reject leading-zero identifiers, thousands separators, hex, and loose coercions.
  if (
    text !== undefined &&
    !/^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text)
  )
    return undefined;
  const number = Number(text ?? value);
  if (
    !Number.isFinite(number) ||
    (Number.isInteger(number) && !Number.isSafeInteger(number))
  )
    return undefined;
  return {
    value: number,
    type:
      Number.isInteger(number) && (text === undefined || !/[.eE]/.test(text))
        ? 'INTEGER'
        : 'NUMBER',
  };
}

export function booleanValue(
  value: RawCellValue | undefined,
): boolean | undefined {
  value = rawCell(value);
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  const text = value.trim().toLowerCase();
  if (text === 'true') return true;
  if (text === 'false') return false;
  return undefined;
}

export function dateOnlyValue(
  value: RawCellValue | undefined,
): string | undefined {
  value = rawCell(value);
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === text
    ? text
    : undefined;
}

export function datetimeValue(
  value: RawCellValue | undefined,
): string | undefined {
  value = rawCell(value);
  if (value instanceof Date)
    return Number.isFinite(value.getTime()) ? value.toISOString() : undefined;
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  const match =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(
      text,
    );
  if (
    !match ||
    !dateOnlyValue(match[1]) ||
    Number(match[2]) > 23 ||
    Number(match[3]) > 59 ||
    Number(match[4]) > 59 ||
    Number(match[6] ?? 0) > 23 ||
    Number(match[7] ?? 0) > 59
  )
    return undefined;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

export function assertRowWidth(row: readonly unknown[], width: number): void {
  if (row.length > width) {
    throw new RangeError(
      `Row has ${row.length} cells but columns cover only ${width} positions`,
    );
  }
}

export const DEFAULT_SCHEMA_SAMPLE_LIMIT = 200;

function valueType(value: RawCellValue | undefined): InferredColumnType {
  const xlsxDate = xlsxDateValue(value);
  if (xlsxDate) return xlsxDate.type;
  if (booleanValue(value) !== undefined) return 'BOOLEAN';
  const numeric = numericValue(value);
  if (numeric) return numeric.type;
  if (dateOnlyValue(value) !== undefined) return 'DATE';
  if (datetimeValue(value) !== undefined) return 'DATETIME';
  return 'STRING';
}

function widen(
  current: InferredColumnType | undefined,
  observed: InferredColumnType,
): InferredColumnType {
  if (current === undefined || current === observed) return observed;
  if (
    (current === 'INTEGER' && observed === 'NUMBER') ||
    (current === 'NUMBER' && observed === 'INTEGER')
  )
    return 'NUMBER';
  if (
    (current === 'DATE' && observed === 'DATETIME') ||
    (current === 'DATETIME' && observed === 'DATE')
  )
    return 'DATETIME';
  return 'STRING';
}

@Injectable()
export class SchemaInferrer {
  infer(
    columns: readonly NormalizedColumn[],
    sample: readonly (readonly RawCellValue[])[],
    sampleLimit = DEFAULT_SCHEMA_SAMPLE_LIMIT,
  ): InferredColumn[] {
    if (!Number.isSafeInteger(sampleLimit) || sampleLimit <= 0) {
      throw new RangeError('Sample limit must be a positive safe integer');
    }
    const width = columnWidth(columns);
    const observedTypes: (InferredColumnType | undefined)[] = columns.map(
      () => undefined,
    );
    const nullable = columns.map(() => false);
    const count = Math.min(sample.length, sampleLimit);
    for (let index = 0; index < count; index++) {
      const row = sample[index];
      assertRowWidth(row, width);
      columns.forEach((column, columnIndex) => {
        const value = row[column.position];
        if (isEmpty(value)) nullable[columnIndex] = true;
        else
          observedTypes[columnIndex] = widen(
            observedTypes[columnIndex],
            valueType(value),
          );
      });
    }
    return columns.map((column, index) => ({
      ...column,
      type: observedTypes[index] ?? 'STRING',
      nullable: nullable[index] || count === 0,
    }));
  }
}

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
  const xlsxDate = xlsxDateValue(value);
  value = rawCell(value);
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
      if (xlsxDate?.type === 'DATE') return xlsxDate.iso;
      const date = dateOnlyValue(value);
      if (date !== undefined) return date;
      if (value instanceof Date && Number.isFinite(value.getTime())) {
        const iso = value.toISOString();
        if (iso.endsWith('T00:00:00.000Z')) return iso.slice(0, 10);
      }
      break;
    }
    case 'DATETIME': {
      if (xlsxDate)
        return xlsxDate.type === 'DATE'
          ? `${xlsxDate.iso}T00:00:00.000Z`
          : xlsxDate.iso;
      const datetime = datetimeValue(value);
      if (datetime !== undefined) return datetime;
      const date = dateOnlyValue(value);
      if (date !== undefined) return `${date}T00:00:00.000Z`;
      break;
    }
    case 'STRING':
      if (xlsxDate) return xlsxDate.iso;
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
