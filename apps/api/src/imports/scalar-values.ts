import type { RawCellValue } from './parsing/parser.types.js';
import { rawCell } from './xlsx-cell-values.js';

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
