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
