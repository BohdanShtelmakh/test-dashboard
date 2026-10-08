export type SupportedFileFormat = 'CSV' | 'TSV' | 'XLSX';

export interface ParseFileInput {
  filePath: string;
  originalName: string;
  format: SupportedFileFormat;
}

export type ScalarCellValue = string | number | boolean | Date | null;

export interface XlsxCellValue {
  kind: 'xlsx';
  raw: ScalarCellValue;
  formatted: ScalarCellValue;
}

export type RawCellValue = ScalarCellValue | XlsxCellValue;

/** Single-pass: consume or close rows before advancing to the next dataset. */
export interface ParsedDataset {
  name: string;
  sheetName?: string;
  headers: string[];
  rows: AsyncIterable<RawCellValue[]>;
}

export interface FileParser {
  supports(format: SupportedFileFormat): boolean;
  parse(input: ParseFileInput): AsyncIterable<ParsedDataset>;
}

export class ParserError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'UNSUPPORTED_FORMAT'
      | 'MISSING_HEADER'
      | 'FILE_PARSE_FAILED'
      | 'INVALID_ITERATION',
    readonly source: Pick<ParseFileInput, 'originalName' | 'format'>,
    options?: ErrorOptions,
  ) {
    super(`${source.originalName} (${source.format}): ${message}`, options);
    this.name = 'ParserError';
  }
}

export function fileParseError(
  cause: unknown,
  input: ParseFileInput,
): ParserError {
  if (cause instanceof ParserError) return cause;
  const detail =
    cause instanceof Error ? cause.message : 'Unknown parser failure';
  return new ParserError(detail, 'FILE_PARSE_FAILED', input, { cause });
}
