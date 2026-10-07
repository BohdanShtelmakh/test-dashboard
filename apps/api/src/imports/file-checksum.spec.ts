import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileChecksum } from './file-checksum.js';

describe('fileChecksum', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'checksum-'));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('calculates the known SHA-256 digest and bigint filesystem size', async () => {
    const path = join(directory, 'file.csv');
    await writeFile(path, 'abc');
    expect(await fileChecksum(path)).toEqual({
      checksum:
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      size: 3n,
    });
  });

  it('supports empty files without buffering their contents', async () => {
    const path = join(directory, 'empty');
    await writeFile(path, '');
    expect(await fileChecksum(path)).toEqual({
      checksum:
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      size: 0n,
    });
  });

  it('propagates missing-file errors and rejects directory inputs', async () => {
    await expect(
      fileChecksum(join(directory, 'missing')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fileChecksum(directory)).rejects.toThrow('regular file');
  });
});
