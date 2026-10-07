import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

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
