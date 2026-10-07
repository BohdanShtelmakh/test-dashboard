import 'dotenv/config';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { asc, eq, sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { DatabaseService } from '../src/database/database.service.js';
import * as schema from '../src/database/schema/index.js';
import { ImportService } from '../src/imports/import.service.js';
import { ImportError } from '../src/imports/import.error.js';
import { ParserRegistry } from '../src/imports/parsing/parser-registry.js';
import { SchemaRegistry } from '../src/imports/schema-registry.js';
import { SchemaInferrer } from '../src/imports/schema-inferrer.js';
import type { InferredColumn } from '../src/imports/import.types.js';
import type { ParsedDataset } from '../src/imports/parsing/parser.types.js';
import {
  INITIAL_WIDGET_IDS,
  seedInitialWidgets,
} from '../src/database/seed-widgets.js';

const assignment = (name: string) =>
  fileURLToPath(new URL(`../../../data/${name}`, import.meta.url));

describe('import pipeline (database integration)', () => {
  const namespace = `import_test_${randomUUID().replaceAll('-', '')}`;
  let admin: Pool;
  let module: TestingModule;
  let database: DatabaseService;
  let importer: ImportService;
  let registry: ParserRegistry;
  let directory: string;

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is required');
    admin = new Pool({ connectionString, connectionTimeoutMillis: 5000 });
    await admin.query(`CREATE SCHEMA "${namespace}"`);
    const journal = JSON.parse(
      await readFile(
        new URL('../drizzle/meta/_journal.json', import.meta.url),
        'utf8',
      ),
    ) as { entries: { tag: string }[] };
    // Apply the real migrations in a disposable namespace; never truncate public data.
    for (const entry of journal.entries) {
      const migration = await readFile(
        new URL(`../drizzle/${entry.tag}.sql`, import.meta.url),
        'utf8',
      );
      const client = await admin.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SET LOCAL search_path TO "${namespace}"`);
        await client.query(migration.replaceAll('"public"', `"${namespace}"`));
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
    const url = new URL(connectionString);
    url.searchParams.set('options', `-c search_path=${namespace}`);
    module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue(new ConfigService({ DATABASE_URL: url.toString() }))
      .compile();
    database = module.get(DatabaseService);
    importer = module.get(ImportService);
    registry = module.get(ParserRegistry);
  });

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'import-integration-'));
    await database.db.execute(
      sql.raw(
        'TRUNCATE widgets, dataset_rows, datasets, dataset_columns, dataset_schemas, source_files RESTART IDENTITY CASCADE',
      ),
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  afterAll(async () => {
    await module?.close();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`);
      await admin.end();
    }
  });

  async function csv(name: string, contents: string) {
    const filePath = join(directory, name);
    await writeFile(filePath, contents);
    return { filePath, originalName: name, format: 'CSV' as const };
  }

  async function counts() {
    const result = await database.db.execute(sql`
      SELECT (SELECT count(*)::int FROM source_files) AS files,
        (SELECT count(*)::int FROM datasets) AS datasets,
        (SELECT count(*)::int FROM dataset_rows) AS rows,
        (SELECT count(*)::int FROM dataset_schemas) AS schemas,
        (SELECT count(*)::int FROM dataset_columns) AS columns`);
    return result.rows[0];
  }

  it('imports the real CSV and multi-sheet XLSX, then reuses both without parsing', async () => {
    const inputs = [
      {
        filePath: assignment('stacked-bar.csv'),
        originalName: 'stacked-bar.csv',
        format: 'CSV' as const,
      },
      {
        filePath: assignment('line-and-pie.xlsx'),
        originalName: 'line-and-pie.xlsx',
        format: 'XLSX' as const,
      },
    ];
    const csvResult = await importer.importFile(inputs[0]);
    const xlsxResult = await importer.importFile(inputs[1]);
    expect(csvResult.reused).toBe(false);
    expect(csvResult.datasets.map((d) => d.rowCount)).toEqual([5]);
    expect(xlsxResult.datasets.map((d) => [d.sheetName, d.rowCount])).toEqual([
      ['line chart data', 212],
      ['pie chart data', 5],
    ]);
    expect(await counts()).toMatchObject({ files: 2, datasets: 3, rows: 222 });
    for (const dataset of await database.db.select().from(schema.datasets)) {
      const rows = await database.db
        .select()
        .from(schema.datasetRows)
        .where(eq(schema.datasetRows.datasetId, dataset.id))
        .orderBy(asc(schema.datasetRows.rowIndex));
      const columns = await database.db
        .select()
        .from(schema.datasetColumns)
        .where(eq(schema.datasetColumns.schemaId, dataset.schemaId));
      if (dataset.name === 'line chart data') {
        expect(columns.find((column) => column.key === 'date')?.type).toBe(
          'DATE',
        );
        expect(rows[0].values.date).toBe('2024-10-28');
        for (const row of rows)
          expect(row.values.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
      expect(rows.map((row) => row.rowIndex)).toEqual(
        Array.from({ length: dataset.rowCount }, (_, i) => i),
      );
      for (const row of rows) {
        expect(Object.keys(row.values).sort()).toEqual(
          columns.map((column) => column.key).sort(),
        );
        for (const column of columns) {
          const value = row.values[column.key];
          if (value !== null)
            expect(typeof value).toBe(
              column.type === 'INTEGER' || column.type === 'NUMBER'
                ? 'number'
                : column.type === 'BOOLEAN'
                  ? 'boolean'
                  : 'string',
            );
        }
      }
    }
    const parse = vi.spyOn(registry, 'getParser').mockImplementation(() => {
      throw new Error('Reuse must not parse');
    });
    for (const [index, input] of inputs.entries()) {
      const reused = await importer.importFile({
        ...input,
        originalName: 'renamed-file',
      });
      expect(reused.reused).toBe(true);
      expect(reused.sourceFileId).toBe(
        [csvResult, xlsxResult][index].sourceFileId,
      );
      expect(reused.datasets.map((d) => d.id).sort()).toEqual(
        [csvResult, xlsxResult][index].datasets.map((d) => d.id).sort(),
      );
    }
    expect(parse).not.toHaveBeenCalled();
    expect(await counts()).toMatchObject({ files: 2, datasets: 3, rows: 222 });
  });

  it('seeds exactly three deterministic widgets and preserves existing state on rerun', async () => {
    const csvResult = await importer.importFile({
      filePath: assignment('stacked-bar.csv'),
      originalName: 'stacked-bar.csv',
      format: 'CSV',
    });
    const xlsxResult = await importer.importFile({
      filePath: assignment('line-and-pie.xlsx'),
      originalName: 'line-and-pie.xlsx',
      format: 'XLSX',
    });
    await seedInitialWidgets(database, csvResult, xlsxResult);
    const widgets = await database.db
      .select()
      .from(schema.widgets)
      .orderBy(asc(schema.widgets.id));
    expect(widgets.map((widget) => widget.id)).toEqual(
      Object.values(INITIAL_WIDGET_IDS),
    );
    expect(widgets.map((widget) => widget.type)).toEqual([
      'LINE',
      'PIE',
      'STACKED_BAR',
    ]);
    const names = ['line chart data', 'pie chart data', 'stacked-bar'];
    const fields = [
      ['date', 'result', 'campaign'],
      ['campaign', 'result'],
      ['brand', 'positive', 'neutral', 'negative'],
    ];
    for (const [index, widget] of widgets.entries()) {
      const [dataset] = await database.db
        .select()
        .from(schema.datasets)
        .where(eq(schema.datasets.id, widget.datasetId!));
      expect(dataset.name).toBe(names[index]);
      const columns = await database.db
        .select()
        .from(schema.datasetColumns)
        .where(eq(schema.datasetColumns.schemaId, dataset.schemaId));
      for (const field of fields[index])
        expect(columns.map((column) => column.key)).toContain(field);
    }
    await database.db
      .update(schema.widgets)
      .set({
        title: 'Edited by user',
        config: { xKey: 'date', valueKey: 'result' },
      })
      .where(eq(schema.widgets.id, INITIAL_WIDGET_IDS.line));
    const before = await database.db
      .select()
      .from(schema.widgets)
      .orderBy(asc(schema.widgets.id));
    await seedInitialWidgets(
      database,
      await importer.importFile({
        filePath: assignment('stacked-bar.csv'),
        originalName: 'stacked-bar.csv',
        format: 'CSV',
      }),
      await importer.importFile({
        filePath: assignment('line-and-pie.xlsx'),
        originalName: 'line-and-pie.xlsx',
        format: 'XLSX',
      }),
    );
    expect(
      await database.db
        .select()
        .from(schema.widgets)
        .orderBy(asc(schema.widgets.id)),
    ).toEqual(before);
    expect(await counts()).toMatchObject({ files: 2, datasets: 3, rows: 222 });
  });

  it('persists more than two batches, including every sampled row exactly once', async () => {
    const input = await csv(
      'large.csv',
      `Value\n${Array.from({ length: 1205 }, (_, i) => i).join('\n')}\n`,
    );
    const parser = registry.getParser('CSV');
    const parse = vi.spyOn(parser, 'parse');
    const result = await importer.importFile(input);
    expect(parse).toHaveBeenCalledOnce();
    expect(result.datasets[0].rowCount).toBe(1205);
    const rows = await database.db
      .select()
      .from(schema.datasetRows)
      .orderBy(asc(schema.datasetRows.rowIndex));
    expect(rows.map((row) => row.values.value)).toEqual(
      Array.from({ length: 1205 }, (_, i) => i),
    );
    expect(rows.map((row) => row.rowIndex)).toEqual(
      Array.from({ length: 1205 }, (_, i) => i),
    );
  });

  it('reuses schema metadata across different files', async () => {
    const first = await importer.importFile(
      await csv('first.csv', 'Value\n1\n'),
    );
    const second = await importer.importFile(
      await csv('second.csv', 'Value\n2\n'),
    );
    expect(first.sourceFileId).not.toBe(second.sourceFileId);
    expect(await counts()).toMatchObject({
      files: 2,
      datasets: 2,
      schemas: 1,
      columns: 1,
    });
    const datasets = await database.db.select().from(schema.datasets);
    expect(datasets[0].schemaId).toBe(datasets[1].schemaId);
  });

  it('rolls back rows already flushed when a later value cannot be normalized', async () => {
    const input = await csv(
      'bad.csv',
      `Value\n${Array.from({ length: 501 }, (_, i) => i).join('\n')}\ninvalid\n`,
    );
    await expect(importer.importFile(input)).rejects.toMatchObject({
      name: 'ImportError',
      cause: { name: 'ValueNormalizationError' },
    });
    expect(await counts()).toEqual({
      files: 0,
      datasets: 0,
      rows: 0,
      schemas: 0,
      columns: 0,
    });
  });

  it('rolls back an earlier worksheet when parsing a later dataset fails and closes iterators', async () => {
    const input = await csv('sheets.csv', 'placeholder');
    const closed = vi.fn();
    const firstRowsClosed = vi.fn();
    vi.spyOn(registry.getParser('CSV'), 'parse').mockImplementation(
      async function* () {
        try {
          yield {
            name: 'first',
            headers: ['Value'],
            rows: (async function* () {
              try {
                yield ['1'];
              } finally {
                firstRowsClosed();
              }
            })(),
          };
          throw new Error('later sheet failed');
        } finally {
          closed();
        }
      },
    );
    await expect(importer.importFile(input)).rejects.toMatchObject({
      name: 'ImportError',
      cause: { message: 'later sheet failed' },
    });
    expect(firstRowsClosed).toHaveBeenCalledOnce();
    expect(closed).toHaveBeenCalledOnce();
    expect(await counts()).toEqual({
      files: 0,
      datasets: 0,
      rows: 0,
      schemas: 0,
      columns: 0,
    });
  });

  it('propagates actual parser errors without retaining a source file', async () => {
    await expect(
      importer.importFile(await csv('malformed.csv', 'A,B\n1\n')),
    ).rejects.toBeInstanceOf(ImportError);
    expect(await counts()).toEqual({
      files: 0,
      datasets: 0,
      rows: 0,
      schemas: 0,
      columns: 0,
    });
  });

  it('closes the sampled source iterator and rolls back if inference fails', async () => {
    const input = await csv('inference.csv', 'placeholder');
    const closed = vi.fn();
    vi.spyOn(registry.getParser('CSV'), 'parse').mockImplementation(
      async function* () {
        yield {
          name: 'sampled',
          headers: ['Value'],
          rows: (async function* () {
            try {
              for (let i = 0; i < 250; i++) yield [String(i)];
            } finally {
              closed();
            }
          })(),
        };
      },
    );
    const infer = vi
      .spyOn(module.get(SchemaInferrer), 'infer')
      .mockImplementation((_columns, sample) => {
        expect(sample).toHaveLength(200);
        throw new Error('inference failed');
      });
    await expect(importer.importFile(input)).rejects.toMatchObject({
      name: 'ImportError',
      cause: { message: 'inference failed' },
    });
    expect(infer).toHaveBeenCalledOnce();
    expect(closed).toHaveBeenCalledOnce();
    expect(await counts()).toEqual({
      files: 0,
      datasets: 0,
      rows: 0,
      schemas: 0,
      columns: 0,
    });
  });

  it('rolls back unrelated uniqueness errors instead of ignoring them', async () => {
    const input = await csv('duplicate-dataset.csv', 'placeholder');
    vi.spyOn(registry.getParser('CSV'), 'parse').mockImplementation(
      async function* () {
        for (let i = 0; i < 2; i++)
          yield {
            name: 'same',
            headers: ['Value'],
            rows: (async function* () {
              yield ['1'];
            })(),
          };
      },
    );
    await expect(importer.importFile(input)).rejects.toMatchObject({
      name: 'ImportError',
      cause: {
        cause: {
          code: '23505',
          constraint: 'datasets_source_file_id_name_unique',
        },
      },
    });
    expect(await counts()).toEqual({
      files: 0,
      datasets: 0,
      rows: 0,
      schemas: 0,
      columns: 0,
    });
  });

  async function waitForConflict(table: string) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const { rows } = await admin.query(
        'SELECT 1 FROM pg_stat_activity WHERE wait_event = $1 AND query LIKE $2',
        ['transactionid', `%insert into "${table}"%`],
      );
      if (rows.length) return;
      await setTimeout(10);
    }
    throw new Error(`No blocked unique conflict for ${table}`);
  }

  it('resolves concurrent checksum claims without parsing or inserting twice', async () => {
    const input = await csv('race.csv', 'Value\n1\n');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const parser = registry.getParser('CSV');
    const original = parser.parse.bind(parser);
    const parse = vi
      .spyOn(parser, 'parse')
      .mockImplementation(
        async function* (input): AsyncGenerator<ParsedDataset> {
          entered();
          await gate;
          yield* original(input);
        },
      );
    const first = importer.importFile(input);
    await started;
    const second = importer.importFile(input);
    try {
      await waitForConflict('source_files');
    } finally {
      release();
    }
    const results = await Promise.all([first, second]);
    expect(results.map((result) => result.reused)).toEqual([false, true]);
    expect(results[0].sourceFileId).toBe(results[1].sourceFileId);
    expect(parse).toHaveBeenCalledOnce();
    expect(await counts()).toMatchObject({ files: 1, datasets: 1, rows: 1 });
  });

  it('resolves concurrent schema fingerprints after the winning columns commit', async () => {
    const registry = module.get(SchemaRegistry);
    const columns: InferredColumn[] = [
      {
        position: 0,
        name: 'Value',
        key: 'value',
        type: 'INTEGER',
        nullable: false,
      },
    ];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const first = database.db.transaction(async (tx) => {
      const id = await registry.resolve(tx, columns);
      entered();
      await gate;
      return id;
    });
    await started;
    const second = database.db.transaction((tx) =>
      registry.resolve(tx, columns),
    );
    try {
      await waitForConflict('dataset_schemas');
    } finally {
      release();
    }
    const ids = await Promise.all([first, second]);
    expect(ids[0]).toBe(ids[1]);
    expect(await counts()).toMatchObject({ schemas: 1, columns: 1 });
  });
});
