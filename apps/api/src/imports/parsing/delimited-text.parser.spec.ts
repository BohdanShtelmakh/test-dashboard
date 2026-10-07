import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DelimitedTextParser } from './delimited-text.parser.js';
import type { ParseFileInput, RawCellValue } from './parser.types.js';
import { ParserError } from './parser.error.js';

vi.mock('node:fs', async () => {
  const original = await vi.importActual<typeof import('node:fs')>('node:fs');
  return { ...original, createReadStream: vi.fn(original.createReadStream) };
});

describe('DelimitedTextParser', () => {
  const parser = new DelimitedTextParser();
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'delimited-parser-'));
    vi.clearAllMocks();
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  async function fixture(
    content: string,
    format: 'CSV' | 'TSV' = 'CSV',
  ): Promise<ParseFileInput> {
    const filePath = join(directory, 'fixture.' + format.toLowerCase());
    await writeFile(filePath, content);
    return {
      filePath,
      originalName: 'fixture.' + format.toLowerCase(),
      format,
    };
  }

  it('preserves CSV duplicate headers, quoted delimiters, BOM, empty records, and cell whitespace', async () => {
    const input = await fixture(
      '\uFEFF\n,\nResult,Result,Note\n10,20,"a,b"\n\n30,40,"  spaced  "\n,,\n',
    );
    for await (const dataset of parser.parse(input)) {
      expect(dataset.name).toBe('fixture');
      expect(dataset.headers).toEqual(['Result', 'Result', 'Note']);
      const rows: RawCellValue[][] = [];
      for await (const row of dataset.rows) rows.push(row);
      expect(rows).toEqual([
        ['10', '20', 'a,b'],
        ['30', '40', '  spaced  '],
      ]);
    }
  });

  it('uses tab delimiters for TSV and handles quoted tabs/newlines', async () => {
    const input = await fixture('Name\tNote\nA\t"one\ttwo\nthree"\n', 'TSV');
    for await (const dataset of parser.parse(input)) {
      expect(dataset.headers).toEqual(['Name', 'Note']);
      for await (const row of dataset.rows)
        expect(row).toEqual(['A', 'one\ttwo\nthree']);
    }
  });

  it.each(['', '\n\r\n', ',,\n,,\n'])(
    'rejects files without a non-empty header: %j',
    async (content) => {
      const input = await fixture(content);
      await expect(parser.parse(input).next()).rejects.toMatchObject({
        code: 'MISSING_HEADER',
        source: { originalName: input.originalName },
      });
    },
  );

  it.each(['A,B\n"unclosed,b\n', 'A,B\nonly-one\n', 'A,B\n1,2,3\n'])(
    'rejects malformed syntax or record widths: %j',
    async (content) => {
      const input = await fixture(content);
      async function consume() {
        for await (const dataset of parser.parse(input)) {
          for await (const row of dataset.rows) void row;
        }
      }
      await expect(consume()).rejects.toBeInstanceOf(ParserError);
      await expect(consume()).rejects.toMatchObject({
        code: 'FILE_PARSE_FAILED',
        source: { format: 'CSV' },
      });
    },
  );

  it('reports unreadable files and closes streams', async () => {
    const input = {
      filePath: join(directory, 'missing.csv'),
      originalName: 'missing.csv',
      format: 'CSV' as const,
    };
    await expect(parser.parse(input).next()).rejects.toMatchObject({
      code: 'FILE_PARSE_FAILED',
      cause: { code: 'ENOENT' },
    });
    expect(vi.mocked(createReadStream).mock.results[0].value.closed).toBe(true);
  });

  it('streams a large file lazily and closes the file when rows are stopped early', async () => {
    const input = await fixture('A,B\n' + 'one,two\n'.repeat(100_000));
    const datasets = parser.parse(input);
    const first = await datasets.next();
    if (first.done) throw new Error('Expected dataset');
    const rows = first.value.rows[Symbol.asyncIterator]();
    expect((await rows.next()).value).toEqual(['one', 'two']);
    const source = vi.mocked(createReadStream).mock.results[0].value;
    expect(source.bytesRead).toBeLessThan((await stat(input.filePath)).size);
    await rows.return?.();
    await datasets.return(undefined);
    expect(source.closed).toBe(true);
  });

  it('closes a file if the outer dataset iterator is stopped before rows start', async () => {
    const input = await fixture('A,B\n' + 'one,two\n'.repeat(100_000));
    const datasets = parser.parse(input);
    await datasets.next();
    await datasets.return(undefined);
    expect(vi.mocked(createReadStream).mock.results[0].value.closed).toBe(true);
  });

  it('rejects advancing datasets before consuming rows', async () => {
    const datasets = parser.parse(await fixture('A,B\n1,2\n'));
    await datasets.next();
    await expect(datasets.next()).rejects.toMatchObject({
      code: 'INVALID_ITERATION',
    });
  });

  it('delivers rows before a later structural failure without accumulating the input', async () => {
    const input = await fixture(
      'A,B\n' + 'one,two\n'.repeat(20_000) + 'broken\n',
    );
    let count = 0;
    async function consume() {
      for await (const dataset of parser.parse(input)) {
        for await (const row of dataset.rows) {
          expect(row).toHaveLength(2);
          count++;
        }
      }
    }
    await expect(consume()).rejects.toMatchObject({
      code: 'FILE_PARSE_FAILED',
    });
    expect(count).toBeGreaterThan(0);
    expect(vi.mocked(createReadStream).mock.results[0].value.closed).toBe(true);
  });

  it('parses the supplied assignment CSV as one positional dataset', async () => {
    let datasetCount = 0;
    let rowCount = 0;
    for await (const dataset of parser.parse({
      filePath: fileURLToPath(
        new URL('../../../../../data/stacked-bar.csv', import.meta.url),
      ),
      originalName: 'stacked-bar.csv',
      format: 'CSV',
    })) {
      datasetCount++;
      expect(dataset.headers).toEqual([
        'Brand',
        'Positive',
        'Neutral',
        'Negative',
      ]);
      for await (const row of dataset.rows) {
        expect(row).toHaveLength(4);
        rowCount++;
      }
    }
    expect(datasetCount).toBe(1);
    expect(rowCount).toBe(5);
  });
});
