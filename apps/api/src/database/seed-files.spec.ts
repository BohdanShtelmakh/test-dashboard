import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedFileNames } from './seed-files.js';

it('discovers supported regular files in stable order, excluding directories and unrelated files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'seed-files-'));
  try {
    for (const name of ['z.csv', 'a.XLSX', 'b.tsv', 'notes.md'])
      await writeFile(join(directory, name), '');
    await mkdir(join(directory, 'folder.csv'));
    expect(await seedFileNames(directory)).toEqual([
      'a.XLSX',
      'b.tsv',
      'z.csv',
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
