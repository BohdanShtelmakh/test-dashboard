import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname } from 'node:path';
import type { SupportedFileFormat } from './parsing/parser.contract.js';

export async function fileChecksum(
  filePath: string,
): Promise<{ checksum: string; size: bigint }> {
  const metadata = await stat(filePath, { bigint: true });
  if (!metadata.isFile())
    throw new Error('Import input must be a regular file');
  const hash = createHash('sha256');
  let bytes = 0n;
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
    bytes += BigInt(chunk.length);
  }
  if (bytes !== metadata.size)
    throw new Error('File size changed while hashing');
  return { checksum: hash.digest('hex'), size: metadata.size };
}

export function fileFormat(filePath: string): SupportedFileFormat | undefined {
  switch (extname(filePath).toLowerCase()) {
    case '.csv':
      return 'CSV';
    case '.tsv':
      return 'TSV';
    case '.xlsx':
      return 'XLSX';
    default:
      return undefined;
  }
}

export function detectFileFormat(filePath: string): SupportedFileFormat {
  const format = fileFormat(filePath);
  if (!format)
    throw new Error(
      'Unsupported file extension; expected .csv, .tsv, or .xlsx',
    );
  return format;
}
