import 'dotenv/config';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { asc, eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { vi } from 'vitest';
import { WidgetsService } from '../src/widgets/widgets.service.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { DatabaseService } from '../src/database/database.service.js';
import {
  INITIAL_WIDGET_IDS,
  seedInitialWidgets,
} from '../src/database/seed-widgets.js';
import * as schema from '../src/database/schema/index.js';
import { ImportService } from '../src/imports/import.service.js';
import type {
  WidgetDetail,
  WidgetSummary,
} from '../src/widgets/widgets.types.js';

const assignment = (name: string) =>
  fileURLToPath(new URL(`../../../data/${name}`, import.meta.url));

describe('widgets API (PostgreSQL e2e)', () => {
  const namespace = `widgets_test_${randomUUID().replaceAll('-', '')}`;
  let admin: Pool;
  let app: INestApplication;
  let database: DatabaseService;
  let importer: ImportService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL)
      throw new Error('DATABASE_URL is required for widgets e2e');
    admin = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5000,
    });
    await admin.query(`CREATE SCHEMA "${namespace}"`);
    const journal = JSON.parse(
      await readFile(
        new URL('../drizzle/meta/_journal.json', import.meta.url),
        'utf8',
      ),
    ) as { entries: { tag: string }[] };
    const client = await admin.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO "${namespace}"`);
      for (const entry of journal.entries) {
        const migration = await readFile(
          new URL(`../drizzle/${entry.tag}.sql`, import.meta.url),
          'utf8',
        );
        await client.query(migration.replaceAll('"public"', `"${namespace}"`));
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    const url = new URL(process.env.DATABASE_URL);
    url.searchParams.set('options', `-c search_path=${namespace}`);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          DATABASE_URL: url.toString(),
          CORS_ORIGIN: 'http://localhost:5173',
        }),
      )
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    database = app.get(DatabaseService);
    importer = app.get(ImportService);
  });

  beforeEach(async () => {
    await database.db.execute(
      sql.raw(
        'TRUNCATE widgets, dataset_rows, datasets, dataset_columns, dataset_schemas, source_files RESTART IDENTITY CASCADE',
      ),
    );
    const csv = await importer.importFile({
      filePath: assignment('stacked-bar.csv'),
      originalName: 'stacked-bar.csv',
      format: 'CSV',
    });
    const xlsx = await importer.importFile({
      filePath: assignment('line-and-pie.xlsx'),
      originalName: 'line-and-pie.xlsx',
      format: 'XLSX',
    });
    await seedInitialWidgets(database, csv, xlsx);
  });

  afterAll(async () => {
    await app?.close();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`);
      await admin.end();
    }
  });

  it('returns a complete snapshot when a generated widget is deleted during a read', async () => {
    const widget = await create('LINE');
    const expected = await detail(widget.id);
    const transaction = database.db.transaction.bind(database.db);
    const spy = vi.spyOn(database.db, 'transaction');
    spy.mockImplementationOnce((callback, config) =>
      transaction(async (tx) => {
        // Establish the reader snapshot, then commit deletion on another connection.
        await tx
          .select({ id: schema.widgets.id })
          .from(schema.widgets)
          .where(eq(schema.widgets.id, widget.id));
        await app.get(WidgetsService).delete(widget.id);
        return callback(tx);
      }, config),
    );
    try {
      expect(await detail(widget.id)).toEqual(expected);
      await request(app.getHttpServer())
        .get(`/api/widgets/${widget.id}`)
        .expect(404);
    } finally {
      spy.mockRestore();
    }
  });

  it('lists three lightweight summaries in stable dashboard order', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/widgets')
      .expect(200);
    const summaries = response.body as WidgetSummary[];
    expect(summaries.map((widget) => widget.id)).toEqual(
      Object.values(INITIAL_WIDGET_IDS),
    );
    expect(summaries.map((widget) => widget.type)).toEqual([
      'LINE',
      'PIE',
      'STACKED_BAR',
    ]);
    for (const summary of summaries)
      expect(Object.keys(summary).sort()).toEqual(['id', 'title', 'type']);
    await request(app.getHttpServer()).get('/widgets').expect(404);
  });

  it.each([
    [INITIAL_WIDGET_IDS.line, 'LINE', 'line chart data', 212],
    [INITIAL_WIDGET_IDS.pie, 'PIE', 'pie chart data', 5],
    [INITIAL_WIDGET_IDS.stackedBar, 'STACKED_BAR', 'stacked-bar', 5],
  ] as const)(
    'returns %s chart details with ordered dataset values',
    async (id, type, name, count) => {
      const response = await request(app.getHttpServer())
        .get(`/api/widgets/${id}`)
        .expect(200);
      const widget = response.body as WidgetDetail;
      if (widget.type === 'TEXT') throw new Error('Expected chart');
      expect(widget.type).toBe(type);
      expect(widget.dataset.name).toBe(name);
      expect(widget.dataset.rowCount).toBe(count);
      expect(widget.dataset.rows).toHaveLength(count);
      expect(Object.keys(widget).sort()).toEqual([
        'config',
        'dataset',
        'id',
        'title',
        'type',
      ]);
      expect(Object.keys(widget.dataset).sort()).toEqual([
        'columns',
        'id',
        'name',
        'rowCount',
        'rows',
      ]);
      const columns = await database.db
        .select({
          name: schema.datasetColumns.name,
          key: schema.datasetColumns.key,
          type: schema.datasetColumns.type,
          nullable: schema.datasetColumns.nullable,
          position: schema.datasetColumns.position,
        })
        .from(schema.datasetColumns)
        .innerJoin(
          schema.datasets,
          eq(schema.datasetColumns.schemaId, schema.datasets.schemaId),
        )
        .where(eq(schema.datasets.id, widget.dataset.id))
        .orderBy(asc(schema.datasetColumns.position));
      const rows = await database.db
        .select({ values: schema.datasetRows.values })
        .from(schema.datasetRows)
        .where(eq(schema.datasetRows.datasetId, widget.dataset.id))
        .orderBy(asc(schema.datasetRows.rowIndex));
      expect(widget.dataset.columns).toEqual(columns);
      expect(widget.dataset.rows).toEqual(rows.map((row) => row.values));
      if (widget.type === 'LINE') {
        expect(widget.config).toEqual({
          xKey: 'date',
          valueKey: 'result',
          seriesKey: 'campaign',
        });
        expect(
          widget.dataset.columns.find((column) => column.key === 'date')?.type,
        ).toBe('DATE');
        expect(widget.dataset.rows[0].date).toBe('2024-10-28');
        for (const row of widget.dataset.rows)
          expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      } else if (widget.type === 'PIE') {
        expect(widget.config).toEqual({
          labelKey: 'campaign',
          valueKey: 'result',
        });
      } else if (widget.type === 'STACKED_BAR') {
        expect(widget.config).toEqual({
          categoryKey: 'brand',
          seriesKeys: ['positive', 'neutral', 'negative'],
        });
      }
    },
  );

  it('sorts row values and columns independently of physical insertion order', async () => {
    const [datasetSchema] = await database.db
      .insert(schema.datasetSchemas)
      .values({ fingerprint: 'f'.repeat(64) })
      .returning();
    await database.db.insert(schema.datasetColumns).values([
      {
        schemaId: datasetSchema.id,
        position: 1,
        name: 'Value',
        key: 'value',
        type: 'INTEGER',
      },
      {
        schemaId: datasetSchema.id,
        position: 0,
        name: 'Label',
        key: 'label',
        type: 'STRING',
      },
    ]);
    const [dataset] = await database.db
      .insert(schema.datasets)
      .values({
        schemaId: datasetSchema.id,
        name: 'Ordering test',
        origin: 'GENERATED',
        rowCount: 3,
      })
      .returning();
    await database.db.insert(schema.datasetRows).values(
      [2, 0, 1].map((rowIndex) => ({
        datasetId: dataset.id,
        rowIndex,
        values: { label: String(rowIndex), value: rowIndex },
      })),
    );
    const [widget] = await database.db
      .insert(schema.widgets)
      .values({
        type: 'BAR',
        title: 'Ordering',
        datasetId: dataset.id,
        config: { xKey: 'label', valueKey: 'value' },
      })
      .returning();
    const { body } = await request(app.getHttpServer())
      .get(`/api/widgets/${widget.id}`)
      .expect(200);
    expect(
      body.dataset.columns.map(
        (column: { position: number }) => column.position,
      ),
    ).toEqual([0, 1]);
    expect(body.dataset.rows).toEqual(
      [0, 1, 2].map((value) => ({ label: String(value), value })),
    );
  });

  it('returns text widgets without dataset/config fields', async () => {
    const [widget] = await database.db
      .insert(schema.widgets)
      .values({ type: 'TEXT', title: 'Note', text: null })
      .returning();
    const { body } = await request(app.getHttpServer())
      .get(`/api/widgets/${widget.id}`)
      .expect(200);
    expect(body).toEqual({
      id: widget.id,
      type: 'TEXT',
      title: 'Note',
      text: null,
    });
  });

  it('returns 404 for unknown UUIDs and 400 for malformed UUIDs', async () => {
    await request(app.getHttpServer())
      .get('/api/widgets/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/widgets/not-a-uuid')
      .expect(400);
  });

  it('rejects corrupt persisted config without leaking its contents', async () => {
    await database.db
      .update(schema.widgets)
      .set({ config: { xKey: 'private-invalid-field', valueKey: 'result' } })
      .where(eq(schema.widgets.id, INITIAL_WIDGET_IDS.line));
    const { body } = await request(app.getHttpServer())
      .get(`/api/widgets/${INITIAL_WIDGET_IDS.line}`)
      .expect(500);
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('private-invalid-field');
  });

  it('allows the configured frontend CORS origin', async () => {
    await request(app.getHttpServer())
      .options('/api/widgets')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET')
      .expect(204)
      .expect('Access-Control-Allow-Origin', 'http://localhost:5173');
  });
  async function create(type: string): Promise<WidgetSummary> {
    const response = await request(app.getHttpServer())
      .post('/api/widgets')
      .send({ type })
      .expect(201);
    return response.body as WidgetSummary;
  }
  async function detail(id: string): Promise<WidgetDetail> {
    const response = await request(app.getHttpServer())
      .get(`/api/widgets/${id}`)
      .expect(200);
    return response.body as WidgetDetail;
  }
  async function counts() {
    const result = await database.db.execute(sql`SELECT
      (SELECT count(*)::int FROM widgets) AS widgets,
      (SELECT count(*)::int FROM datasets) AS datasets,
      (SELECT count(*)::int FROM dataset_rows) AS rows,
      (SELECT count(*)::int FROM dataset_schemas) AS schemas,
      (SELECT count(*)::int FROM dataset_columns) AS columns,
      (SELECT count(*)::int FROM source_files) AS files`);
    return result.rows[0];
  }

  it.each(['Initial note\nSecond line', ''])(
    'persists optional initial TEXT content %j',
    async (text) => {
      const before = await counts();
      const response = await request(app.getHttpServer())
        .post('/api/widgets')
        .send({ type: 'TEXT', text })
        .expect(201);
      const widget = response.body as WidgetSummary;
      expect(await detail(widget.id)).toEqual({ ...widget, text });
      expect(await detail(widget.id)).toEqual({ ...widget, text });
      expect(await counts()).toEqual({ ...before, widgets: 4 });
    },
  );

  it('creates TEXT without a dataset and updates its text and timestamp', async () => {
    const before = await counts();
    const widget = await create('TEXT');
    const [stored] = await database.db
      .select()
      .from(schema.widgets)
      .where(eq(schema.widgets.id, widget.id));
    expect(stored).toMatchObject({ datasetId: null, config: {}, text: '' });
    expect(await counts()).toEqual({ ...before, widgets: 4 });
    // A fixed old timestamp avoids clock-dependent assertions.
    await database.db
      .update(schema.widgets)
      .set({ updatedAt: new Date('2000-01-01') })
      .where(eq(schema.widgets.id, widget.id));
    const response = await request(app.getHttpServer())
      .patch(`/api/widgets/${widget.id}`)
      .send({ text: 'Persisted note\nSecond line' })
      .expect(200);
    expect(response.body).toEqual({
      ...widget,
      text: 'Persisted note\nSecond line',
    });
    expect(await detail(widget.id)).toEqual(response.body);
    const [updated] = await database.db
      .select()
      .from(schema.widgets)
      .where(eq(schema.widgets.id, widget.id));
    expect(updated.updatedAt.getTime()).toBeGreaterThan(
      new Date('2000-01-01').getTime(),
    );
    await request(app.getHttpServer())
      .patch(`/api/widgets/${widget.id}`)
      .send({ text: '' })
      .expect(200);
    expect(await detail(widget.id)).toMatchObject({ text: '' });
    await request(app.getHttpServer())
      .delete(`/api/widgets/${widget.id}`)
      .expect(204)
      .expect('');
    await request(app.getHttpServer())
      .get(`/api/widgets/${widget.id}`)
      .expect(404);
    expect(await counts()).toEqual(before);
  });

  it.each(['LINE', 'BAR', 'STACKED_BAR', 'PIE'] as const)(
    'persists %s data, reuses schemas, and cleans up its dataset',
    async (type) => {
      const first = await create(type);
      const widget = await detail(first.id);
      if (widget.type === 'TEXT') throw new Error('Expected chart');
      const [dataset] = await database.db
        .select()
        .from(schema.datasets)
        .where(eq(schema.datasets.id, widget.dataset.id));
      expect(dataset).toMatchObject({
        origin: 'GENERATED',
        sourceFileId: null,
        rowCount: widget.dataset.rows.length,
      });
      expect(widget.dataset.rows.length).toBeGreaterThanOrEqual(5);
      const keys = widget.dataset.columns.map((column) => column.key);
      for (const row of widget.dataset.rows)
        expect(Object.keys(row).sort()).toEqual([...keys].sort());
      for (const field of Object.values(widget.config).flat())
        expect(keys).toContain(field);
      for (const row of widget.dataset.rows) {
        for (const column of widget.dataset.columns) {
          expect(typeof row[column.key]).toBe(
            column.type === 'INTEGER' ? 'number' : 'string',
          );
          if (column.type === 'DATE')
            expect(row[column.key]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
      }
      expect(await detail(first.id)).toEqual(widget);
      const second = await create(type);
      const other = await detail(second.id);
      if (other.type === 'TEXT') throw new Error('Expected chart');
      expect(other.dataset.id).not.toBe(widget.dataset.id);
      const [secondDataset] = await database.db
        .select()
        .from(schema.datasets)
        .where(eq(schema.datasets.id, other.dataset.id));
      expect(secondDataset.schemaId).toBe(dataset.schemaId);
      await request(app.getHttpServer())
        .delete(`/api/widgets/${first.id}`)
        .expect(204);
      expect(
        await database.db
          .select()
          .from(schema.datasets)
          .where(eq(schema.datasets.id, dataset.id)),
      ).toHaveLength(0);
      expect(
        await database.db
          .select()
          .from(schema.datasetRows)
          .where(eq(schema.datasetRows.datasetId, dataset.id)),
      ).toHaveLength(0);
      expect(
        await database.db
          .select()
          .from(schema.datasetSchemas)
          .where(eq(schema.datasetSchemas.id, dataset.schemaId)),
      ).toHaveLength(1);
      expect(await detail(second.id)).toEqual(other);
    },
  );

  it.each(Object.values(INITIAL_WIDGET_IDS))(
    'deletes imported widget %s without altering any imported data',
    async (id) => {
      const before = await counts();
      await request(app.getHttpServer())
        .delete(`/api/widgets/${id}`)
        .expect(204);
      expect(await counts()).toEqual({ ...before, widgets: 2 });
      await request(app.getHttpServer()).get(`/api/widgets/${id}`).expect(404);
    },
  );

  it('keeps shared generated datasets until the last reference is deleted, including concurrent deletes', async () => {
    const first = await create('BAR');
    const widget = await detail(first.id);
    if (widget.type === 'TEXT') throw new Error('Expected chart');
    const [second] = await database.db
      .insert(schema.widgets)
      .values({
        type: 'BAR',
        title: 'Shared',
        datasetId: widget.dataset.id,
        config: widget.config,
      })
      .returning();
    await request(app.getHttpServer())
      .delete(`/api/widgets/${first.id}`)
      .expect(204);
    expect(
      await database.db
        .select()
        .from(schema.datasets)
        .where(eq(schema.datasets.id, widget.dataset.id)),
    ).toHaveLength(1);
    const [third] = await database.db
      .insert(schema.widgets)
      .values({
        type: 'BAR',
        title: 'Shared again',
        datasetId: widget.dataset.id,
        config: widget.config,
      })
      .returning();
    await Promise.all(
      [second, third].map((item) =>
        request(app.getHttpServer())
          .delete(`/api/widgets/${item.id}`)
          .expect(204),
      ),
    );
    expect(
      await database.db
        .select()
        .from(schema.datasets)
        .where(eq(schema.datasets.id, widget.dataset.id)),
    ).toHaveLength(0);
  });

  it('returns client errors for invalid writes and chart editing without changing state', async () => {
    const before = await counts();
    for (const body of [
      {},
      { type: 'OTHER' },
      { type: null },
      { type: 'TEXT', datasetId: randomUUID() },
      { type: 'TEXT', text: 42 },
      { type: 'TEXT', text: null },
      { type: 'BAR', text: 'Not allowed on charts' },
      { type: 'LINE', text: '' },
    ])
      await request(app.getHttpServer())
        .post('/api/widgets')
        .send(body)
        .expect(400);
    for (const body of [
      {},
      { text: 42 },
      { text: null },
      { text: 'note', config: {} },
    ])
      await request(app.getHttpServer())
        .patch(`/api/widgets/${INITIAL_WIDGET_IDS.line}`)
        .send(body)
        .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/widgets/${INITIAL_WIDGET_IDS.line}`)
      .send({ text: 'note' })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/api/widgets/not-a-uuid')
      .send({ text: 'note' })
      .expect(400);
    await request(app.getHttpServer())
      .delete('/api/widgets/not-a-uuid')
      .expect(400);
    const missing = randomUUID();
    await request(app.getHttpServer())
      .patch(`/api/widgets/${missing}`)
      .send({ text: 'note' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/widgets/${missing}`)
      .expect(404);
    expect(await counts()).toEqual(before);
  });

  it('rolls back generated schemas, datasets and rows if the widget insert fails', async () => {
    const before = await counts();
    await database.db.execute(
      sql.raw(
        "CREATE FUNCTION fail_widget_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private database failure'; END $$",
      ),
    );
    await database.db.execute(
      sql.raw(
        'CREATE TRIGGER fail_widget_insert BEFORE INSERT ON widgets FOR EACH ROW EXECUTE FUNCTION fail_widget_insert()',
      ),
    );
    try {
      const response = await request(app.getHttpServer())
        .post('/api/widgets')
        .send({ type: 'BAR' })
        .expect(500);
      expect(response.body.message).toBe('Internal server error');
      expect(JSON.stringify(response.body)).not.toContain(
        'private database failure',
      );
      expect(await counts()).toEqual(before);
    } finally {
      await database.db.execute(
        sql.raw('DROP TRIGGER fail_widget_insert ON widgets'),
      );
      await database.db.execute(sql.raw('DROP FUNCTION fail_widget_insert()'));
    }
  });

  it('rolls back widget deletion when generated dataset cleanup fails', async () => {
    const created = await create('BAR');
    const before = await detail(created.id);
    await database.db.execute(
      sql.raw(
        "CREATE FUNCTION fail_dataset_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private cleanup failure'; END $$",
      ),
    );
    await database.db.execute(
      sql.raw(
        'CREATE TRIGGER fail_dataset_delete BEFORE DELETE ON datasets FOR EACH ROW EXECUTE FUNCTION fail_dataset_delete()',
      ),
    );
    try {
      const response = await request(app.getHttpServer())
        .delete(`/api/widgets/${created.id}`)
        .expect(500);
      expect(response.body.message).toBe('Internal server error');
      expect(await detail(created.id)).toEqual(before);
    } finally {
      await database.db.execute(
        sql.raw('DROP TRIGGER fail_dataset_delete ON datasets'),
      );
      await database.db.execute(sql.raw('DROP FUNCTION fail_dataset_delete()'));
    }
  });
});
