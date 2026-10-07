import type { RawCellValue, ScalarCellValue } from './parsing/parser.types.js';

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
