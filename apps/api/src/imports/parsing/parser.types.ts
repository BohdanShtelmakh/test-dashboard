export type SupportedFileFormat = 'CSV' | 'TSV' | 'XLSX';

export interface ParseFileInput {
  filePath: string;
  originalName: string;
  format: SupportedFileFormat;
}

export type RawCellValue = string | number | boolean | Date | null;

/** Single-pass: consume or close rows before advancing to the next dataset. */
export interface ParsedDataset {
  name: string;
  sheetName?: string;
  headers: string[];
  rows: AsyncIterable<RawCellValue[]>;
}
