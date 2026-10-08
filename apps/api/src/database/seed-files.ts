import { readdir } from 'node:fs/promises';
import { fileFormat } from '../imports/file-utils.js';

export async function seedFileNames(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && fileFormat(entry.name))
    .map((entry) => entry.name)
    .sort();
}
