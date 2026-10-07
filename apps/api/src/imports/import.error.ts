import type { ImportFileInput } from './import.types.js';

export class ImportError extends Error {
  constructor(input: ImportFileInput, cause: unknown, datasetName?: string) {
    super(
      `Failed to import "${input.originalName}"${datasetName ? ` (dataset "${datasetName}")` : ''}`,
      { cause },
    );
    this.name = 'ImportError';
  }
}
