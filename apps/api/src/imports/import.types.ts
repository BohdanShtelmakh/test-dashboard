import type { SupportedFileFormat } from './parsing/parser.types.js';

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
export interface ImportFileInput {
  filePath: string;
  originalName: string;
  format: SupportedFileFormat;
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
