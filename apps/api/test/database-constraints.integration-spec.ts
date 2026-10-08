import 'dotenv/config';
import { createHash } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import * as schema from '../src/database/schema/index.js';

describe('database integrity rules (integration)', () => {
  let pool: Pool;
  let client: PoolClient;
  let db: NodePgDatabase<typeof schema>;
  let sourceFile: typeof schema.sourceFiles.$inferSelect;
  let datasetSchema: typeof schema.datasetSchemas.$inferSelect;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        'DATABASE_URL is required for database integration tests',
      );
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5000,
    });
    client = await pool.connect();
    db = drizzle({ client, schema });
  });

  beforeEach(async () => {
    await client.query('BEGIN');
    [sourceFile] = await db
      .insert(schema.sourceFiles)
      .values({
        originalName: 'schema-verification.csv',
        format: 'CSV',
        size: 0n,
        checksum: createHash('sha256')
          .update('schema-verification-file')
          .digest('hex'),
      })
      .returning();
    [datasetSchema] = await db
      .insert(schema.datasetSchemas)
      .values({
        fingerprint: createHash('sha256')
          .update('schema-verification-columns')
          .digest('hex'),
      })
      .returning();
  });

  afterEach(async () => {
    await client?.query('ROLLBACK');
  });

  afterAll(async () => {
    client?.release();
    await pool?.end();
  });

  async function expectConstraintFailure(
    statement: string,
    values: unknown[],
    code: string,
    constraint?: string,
  ) {
    await client.query('SAVEPOINT constraint_test');
    try {
      await expect(client.query(statement, values)).rejects.toMatchObject({
        code,
        ...(constraint ? { constraint } : {}),
      });
    } finally {
      await client.query('ROLLBACK TO SAVEPOINT constraint_test');
      await client.query('RELEASE SAVEPOINT constraint_test');
    }
  }

  async function createDataset() {
    const [dataset] = await db
      .insert(schema.datasets)
      .values({
        sourceFileId: sourceFile.id,
        schemaId: datasetSchema.id,
        origin: 'FILE',
        name: 'Schema verification',
      })
      .returning();
    return dataset;
  }

  it('enforces column positions and keys within a schema', async () => {
    await db.insert(schema.datasetColumns).values({
      schemaId: datasetSchema.id,
      position: 0,
      name: 'Campaign',
      key: 'campaign',
      type: 'STRING',
    });

    await expectConstraintFailure(
      'INSERT INTO dataset_columns (schema_id, position, name, key, type) VALUES ($1, $2, $3, $4, $5)',
      [datasetSchema.id, -1, 'Other', 'other', 'STRING'],
      '23514',
      'dataset_columns_position_nonnegative',
    );
    await expectConstraintFailure(
      'INSERT INTO dataset_columns (schema_id, position, name, key, type) VALUES ($1, $2, $3, $4, $5)',
      [datasetSchema.id, 0, 'Other', 'other', 'STRING'],
      '23505',
      'dataset_columns_schema_id_position_unique',
    );
    await expectConstraintFailure(
      'INSERT INTO dataset_columns (schema_id, position, name, key, type) VALUES ($1, $2, $3, $4, $5)',
      [datasetSchema.id, 1, 'Campaign', 'campaign', 'STRING'],
      '23505',
      'dataset_columns_schema_id_key_unique',
    );
  });

  it('rejects inconsistent dataset origins and negative row counts', async () => {
    await expectConstraintFailure(
      'INSERT INTO datasets (schema_id, origin, name) VALUES ($1, $2, $3)',
      [datasetSchema.id, 'FILE', 'Missing source'],
      '23514',
      'datasets_origin_source_file_check',
    );
    await expectConstraintFailure(
      'INSERT INTO datasets (source_file_id, schema_id, origin, name) VALUES ($1, $2, $3, $4)',
      [sourceFile.id, datasetSchema.id, 'GENERATED', 'Unexpected source'],
      '23514',
      'datasets_origin_source_file_check',
    );
    await expectConstraintFailure(
      'INSERT INTO datasets (schema_id, origin, name, row_count) VALUES ($1, $2, $3, $4)',
      [datasetSchema.id, 'GENERATED', 'Negative count', -1],
      '23514',
      'datasets_row_count_nonnegative',
    );
  });

  it('enforces row identity, nonnegative indexes, and dataset references', async () => {
    const dataset = await createDataset();
    await db
      .insert(schema.datasetRows)
      .values({ datasetId: dataset.id, rowIndex: 0, values: {} });
    await expectConstraintFailure(
      'INSERT INTO dataset_rows (dataset_id, row_index, values) VALUES ($1, $2, $3)',
      [dataset.id, 0, {}],
      '23505',
      'dataset_rows_dataset_id_row_index_unique',
    );
    await expectConstraintFailure(
      'INSERT INTO dataset_rows (dataset_id, row_index, values) VALUES ($1, $2, $3)',
      [dataset.id, -1, {}],
      '23514',
      'dataset_rows_row_index_nonnegative',
    );
    await expectConstraintFailure(
      'INSERT INTO dataset_rows (dataset_id, row_index, values) VALUES ($1, $2, $3)',
      ['00000000-0000-0000-0000-000000000000', 0, {}],
      '23503',
      'dataset_rows_dataset_id_datasets_id_fk',
    );
  });

  it('rejects charts without datasets and text widgets with datasets', async () => {
    const dataset = await createDataset();
    await expectConstraintFailure(
      'INSERT INTO widgets (type, title) VALUES ($1, $2)',
      ['BAR', 'Missing dataset'],
      '23514',
      'widgets_type_dataset_check',
    );
    await expectConstraintFailure(
      'INSERT INTO widgets (type, title, dataset_id) VALUES ($1, $2, $3)',
      ['TEXT', 'Unexpected dataset', dataset.id],
      '23514',
      'widgets_type_dataset_check',
    );
  });

  it('restricts deletion of schemas and datasets that are still referenced', async () => {
    const dataset = await createDataset();
    await expectConstraintFailure(
      'DELETE FROM dataset_schemas WHERE id = $1',
      [datasetSchema.id],
      '23503',
      'datasets_schema_id_dataset_schemas_id_fk',
    );
    await db
      .insert(schema.widgets)
      .values({ type: 'BAR', title: 'Chart', datasetId: dataset.id });
    await expectConstraintFailure(
      'DELETE FROM datasets WHERE id = $1',
      [dataset.id],
      '23503',
      'widgets_dataset_id_datasets_id_fk',
    );
    await expectConstraintFailure(
      'DELETE FROM source_files WHERE id = $1',
      [sourceFile.id],
      '23503',
      'widgets_dataset_id_datasets_id_fk',
    );
  });

  it('cascades file deletion to datasets/rows and schema deletion to columns', async () => {
    const dataset = await createDataset();
    const [row] = await db
      .insert(schema.datasetRows)
      .values({
        datasetId: dataset.id,
        rowIndex: 0,
        values: {},
      })
      .returning();
    const [column] = await db
      .insert(schema.datasetColumns)
      .values({
        schemaId: datasetSchema.id,
        position: 0,
        name: 'Campaign',
        key: 'campaign',
        type: 'STRING',
      })
      .returning();
    await client.query('DELETE FROM source_files WHERE id = $1', [
      sourceFile.id,
    ]);
    expect(
      (
        await client.query('SELECT id FROM datasets WHERE id = $1', [
          dataset.id,
        ])
      ).rows,
    ).toEqual([]);
    expect(
      (
        await client.query('SELECT id FROM dataset_rows WHERE id = $1', [
          row.id,
        ])
      ).rows,
    ).toEqual([]);
    await client.query('DELETE FROM dataset_schemas WHERE id = $1', [
      datasetSchema.id,
    ]);
    expect(
      (
        await client.query('SELECT id FROM dataset_columns WHERE id = $1', [
          column.id,
        ])
      ).rows,
    ).toEqual([]);
  });
});
