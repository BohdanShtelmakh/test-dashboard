import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { datasetColumns, datasetSchemas } from './schema/index.js';
import { columnWidth } from './dataset.contract.js';
import type {
  DatabaseTransaction,
  InferredColumn,
} from './dataset.contract.js';

export function schemaFingerprint(columns: readonly InferredColumn[]): string {
  columnWidth(columns);
  // Tuples fix field ordering; positions fix column ordering. Names and nullable
  // are included because both are stored in the shared dataset_columns records.
  const canonical = [...columns]
    .sort((a, b) => a.position - b.position)
    .map(({ position, name, key, type, nullable }) => [
      position,
      name,
      key,
      type,
      nullable,
    ]);
  return createHash('sha256')
    .update(JSON.stringify(['dataset-schema-v1', canonical]))
    .digest('hex');
}

@Injectable()
export class SchemaRegistry {
  async resolve(
    tx: DatabaseTransaction,
    columns: readonly InferredColumn[],
  ): Promise<string> {
    const fingerprint = schemaFingerprint(columns);
    const [created] = await tx
      .insert(datasetSchemas)
      .values({ fingerprint })
      .onConflictDoNothing({ target: datasetSchemas.fingerprint })
      .returning({ id: datasetSchemas.id });
    if (created) {
      if (columns.length) {
        await tx.insert(datasetColumns).values(
          columns.map(({ position, name, key, type, nullable }) => ({
            schemaId: created.id,
            position,
            name,
            key,
            type,
            nullable,
          })),
        );
      }
      return created.id;
    }
    // READ COMMITTED sees the winner after the unique-index conflict waited
    // for its transaction (including its columns) to commit.
    const [existing] = await tx
      .select({ id: datasetSchemas.id })
      .from(datasetSchemas)
      .where(eq(datasetSchemas.fingerprint, fingerprint));
    if (!existing) throw new Error('Conflicting schema is no longer available');
    return existing.id;
  }
}
