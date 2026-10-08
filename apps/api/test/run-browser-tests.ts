import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { Pool } from 'pg';

config({
  path: fileURLToPath(new URL('../.env', import.meta.url)),
  quiet: true,
});
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const namespace = `browser_test_${randomUUID().replaceAll('-', '')}`;
const admin = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('options', `-c search_path=${namespace}`);
const env = { ...process.env, DATABASE_URL: url.toString() };

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `Browser test command failed (${result.status ?? result.signal})`,
    );
}

try {
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
  run(process.execPath, [
    fileURLToPath(new URL('../dist/database/seed.js', import.meta.url)),
  ]);
  run('npx', ['playwright', 'test']);
} finally {
  await admin.query(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`);
  await admin.end();
}
