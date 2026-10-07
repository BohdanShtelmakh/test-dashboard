import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { getXlsxStreams } from 'xlstream';
import { XlsxParser } from './xlsx.parser.js';
import type { ParseFileInput, RawCellValue } from './parser.types.js';

vi.mock('xlstream', async () => {
  const original = await vi.importActual<typeof import('xlstream')>('xlstream');
  return { ...original, getXlsxStreams: vi.fn(original.getXlsxStreams) };
});

const fixture = (name: string): ParseFileInput => ({
  filePath: fileURLToPath(
    new URL('../../../test/fixtures/parsing/' + name, import.meta.url),
  ),
  originalName: name,
  format: 'XLSX',
});

describe('XlsxParser', () => {
  const parser = new XlsxParser();
  const zip = createRequire(import.meta.url)('node-stream-zip');
  afterEach(() => {
    vi.restoreAllMocks();
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves duplicate headers, numeric values, sparse positions, and skips empty sheets', async () => {
    const names: string[] = [];
    for await (const dataset of parser.parse(fixture('edge-cases.xlsx'))) {
      names.push(dataset.sheetName!);
      expect(dataset.name).toBe(dataset.sheetName);
      const rows: RawCellValue[][] = [];
      for await (const row of dataset.rows) rows.push(row);
      if (dataset.sheetName === 'Duplicates') {
        expect(dataset.headers).toEqual(['Result', 'Result', 'Note']);
        expect(rows).toEqual([
          [10, 20.5, '  spaced  '],
          [null, 30],
          [true, false, '123'],
        ]);
      } else {
        expect(dataset.headers).toEqual(['Value']);
        expect(rows).toEqual([]);
      }
    }
    expect(names).toEqual(['Duplicates', 'Header only']);
  });

  it('rejects advancing datasets before consuming rows and closes ZIP handles', async () => {
    const closeZip = vi.spyOn(zip.async.prototype, 'close');
    const datasets = parser.parse(fixture('edge-cases.xlsx'));
    await datasets.next();
    await expect(datasets.next()).rejects.toMatchObject({
      code: 'INVALID_ITERATION',
    });
    expect(closeZip).toHaveBeenCalledTimes(2);
  });

  it('exposes the assignment workbook as two sequential logical datasets', async () => {
    const names: string[] = [];
    const rowCounts: number[] = [];
    for await (const dataset of parser.parse({
      filePath: fileURLToPath(
        new URL('../../../../../data/line-and-pie.xlsx', import.meta.url),
      ),
      originalName: 'line-and-pie.xlsx',
      format: 'XLSX',
    })) {
      names.push(dataset.sheetName!);
      let count = 0;
      for await (const row of dataset.rows) {
        expect(row.length).toBe(dataset.headers.length);
        expect(typeof row.at(-1)).toBe('number');
        count++;
      }
      rowCounts.push(count);
    }
    expect(names).toEqual(['line chart data', 'pie chart data']);
    expect(rowCounts).toEqual([212, 5]);
  });

  it.each(['malformed-row.xlsx', 'malformed-xml.xlsx'])(
    'propagates malformed workbook failures: %s',
    async (name) => {
      async function consume() {
        for await (const dataset of parser.parse(fixture(name))) {
          for await (const row of dataset.rows) void row;
        }
      }
      await expect(consume()).rejects.toMatchObject({
        code: 'FILE_PARSE_FAILED',
        source: { originalName: name },
        cause: expect.any(Error),
      });
    },
  );

  it('reports an unreadable workbook', async () => {
    await expect(
      parser.parse(fixture('missing.xlsx')).next(),
    ).rejects.toMatchObject({
      code: 'FILE_PARSE_FAILED',
      cause: { code: 'ENOENT' },
    });
  });

  it('closes the sheet and workbook generator on early cancellation', async () => {
    const closeZip = vi.spyOn(zip.async.prototype, 'close');
    const datasets = parser.parse(fixture('edge-cases.xlsx'));
    const first = await datasets.next();
    if (first.done) throw new Error('Expected dataset');
    const streams = await vi.mocked(getXlsxStreams).mock.results[0].value;
    const closed = vi.spyOn(streams, 'return');
    const rows = first.value.rows[Symbol.asyncIterator]();
    await rows.next();
    await rows.return?.();
    await datasets.return(undefined);
    expect(closed).toHaveBeenCalled();
    expect(closeZip).toHaveBeenCalledTimes(2);
  });

  it('closes discovery and parsing ZIP handles after full consumption', async () => {
    const closeZip = vi.spyOn(zip.async.prototype, 'close');
    for await (const dataset of parser.parse(fixture('edge-cases.xlsx'))) {
      for await (const row of dataset.rows) void row;
    }
    expect(closeZip).toHaveBeenCalledTimes(2);
  });

  it('closes ZIP handles when a malformed row fails', async () => {
    const closeZip = vi.spyOn(zip.async.prototype, 'close');
    async function consume() {
      for await (const dataset of parser.parse(fixture('malformed-row.xlsx'))) {
        for await (const row of dataset.rows) void row;
      }
    }
    await expect(consume()).rejects.toMatchObject({
      code: 'FILE_PARSE_FAILED',
    });
    expect(closeZip).toHaveBeenCalledTimes(2);
  });

  it('closes ZIP handles if datasets are cancelled before rows start', async () => {
    const closeZip = vi.spyOn(zip.async.prototype, 'close');
    const datasets = parser.parse(fixture('edge-cases.xlsx'));
    await datasets.next();
    await datasets.return(undefined);
    expect(closeZip).toHaveBeenCalledTimes(2);
  });

  it('can advance sheets after rows are stopped early', async () => {
    const names: string[] = [];
    for await (const dataset of parser.parse(fixture('edge-cases.xlsx'))) {
      names.push(dataset.sheetName!);
      for await (const row of dataset.rows) {
        void row;
        break;
      }
    }
    expect(names).toEqual(['Duplicates', 'Header only']);
  });
});
