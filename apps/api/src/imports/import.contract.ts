import type { SupportedFileFormat } from './parsing/parser.contract.js';

export interface ImportFileInput {
  filePath: string;
  originalName: string;
  format?: SupportedFileFormat;
  mimeType?: string;
}

export interface ImportFileResult {
  sourceFileId: string;
  reused: boolean;
  datasets: {
    id: string;
    name: string;
    sheetName?: string;
    rowCount: number;
  }[];
}

export class ImportError extends Error {
  constructor(input: ImportFileInput, cause: unknown, datasetName?: string) {
    super(
      `Failed to import "${input.originalName}"${datasetName ? ` (dataset "${datasetName}")` : ''}`,
      { cause },
    );
    this.name = 'ImportError';
  }
}
