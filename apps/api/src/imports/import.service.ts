import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { datasets, sourceFiles } from '../database/schema/index.js';
import { ColumnKeyNormalizer } from './column-key-normalizer.js';
import { DatasetWriter } from './dataset-persistence.js';
import { SchemaRegistry } from '../database/dataset-persistence.js';
import { detectFileFormat, fileChecksum } from './file-utils.js';
import { ImportError } from './import.contract.js';
import type { ImportFileInput, ImportFileResult } from './import.contract.js';
import type { DatabaseTransaction } from '../database/dataset.contract.js';
import { ParserRegistry } from './parsing/parser-registry.js';
import type { RawCellValue } from './parsing/parser.contract.js';
import {
  DEFAULT_SCHEMA_SAMPLE_LIMIT,
  SchemaInferrer,
} from './data-normalization.js';

@Injectable()
export class ImportService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ParserRegistry) private readonly parsers: ParserRegistry,
    @Inject(ColumnKeyNormalizer) private readonly keys: ColumnKeyNormalizer,
    @Inject(SchemaInferrer) private readonly inferrer: SchemaInferrer,
    @Inject(SchemaRegistry) private readonly schemas: SchemaRegistry,
    @Inject(DatasetWriter) private readonly writer: DatasetWriter,
  ) {}

  async importFile(input: ImportFileInput): Promise<ImportFileResult> {
    let datasetName: string | undefined;
    try {
      const format = input.format ?? detectFileFormat(input.filePath);
      const { checksum, size } = await fileChecksum(input.filePath);
      const [existing] = await this.database.db
        .select({ id: sourceFiles.id })
        .from(sourceFiles)
        .where(eq(sourceFiles.checksum, checksum));
      if (existing) return await this.existingResult(existing.id);

      // One file is atomic. Very large imports should use staging/status and
      // shorter transactions instead of extending this transaction into a job.
      return await this.database.db.transaction(
        async (tx) => {
          const [created] = await tx
            .insert(sourceFiles)
            .values({
              originalName: input.originalName,
              format,
              mimeType: input.mimeType,
              checksum,
              size,
            })
            .onConflictDoNothing({ target: sourceFiles.checksum })
            .returning({ id: sourceFiles.id });
          if (!created) {
            const [winner] = await tx
              .select({ id: sourceFiles.id })
              .from(sourceFiles)
              .where(eq(sourceFiles.checksum, checksum));
            if (!winner)
              throw new Error('Conflicting source file is no longer available');
            return this.existingResult(winner.id, tx);
          }

          const result: ImportFileResult = {
            sourceFileId: created.id,
            reused: false,
            datasets: [],
          };
          const parser = this.parsers.getParser(format);
          for await (const dataset of parser.parse({ ...input, format })) {
            datasetName = dataset.name;
            const iterator = dataset.rows[Symbol.asyncIterator]();
            try {
              const sample: RawCellValue[][] = [];
              for (let i = 0; i < DEFAULT_SCHEMA_SAMPLE_LIMIT; i++) {
                const next = await iterator.next();
                if (next.done) break;
                sample.push(next.value);
              }
              const columns = this.inferrer.infer(
                this.keys.normalize(dataset.headers),
                sample,
              );
              const schemaId = await this.schemas.resolve(tx, columns);
              const [persisted] = await tx
                .insert(datasets)
                .values({
                  origin: 'FILE',
                  sourceFileId: created.id,
                  schemaId,
                  name: dataset.name,
                  sheetName: dataset.sheetName,
                })
                .returning({ id: datasets.id });

              async function* replay(): AsyncGenerator<RawCellValue[]> {
                yield* sample;
                while (true) {
                  const next = await iterator.next();
                  if (next.done) break;
                  yield next.value;
                }
              }
              const rowCount = await this.writer.write(
                tx,
                persisted.id,
                columns,
                replay(),
              );
              result.datasets.push({
                id: persisted.id,
                name: dataset.name,
                ...(dataset.sheetName === undefined
                  ? {}
                  : { sheetName: dataset.sheetName }),
                rowCount,
              });
            } finally {
              await iterator.return?.();
            }
          }
          if (!result.datasets.length)
            throw new Error('File contains no importable datasets');
          return result;
        },
        { isolationLevel: 'read committed' },
      );
    } catch (cause) {
      throw new ImportError(input, cause, datasetName);
    }
  }

  private async existingResult(
    sourceFileId: string,
    client: DatabaseTransaction | DatabaseService['db'] = this.database.db,
  ): Promise<ImportFileResult> {
    const stored = await client
      .select({
        id: datasets.id,
        name: datasets.name,
        sheetName: datasets.sheetName,
        rowCount: datasets.rowCount,
      })
      .from(datasets)
      .where(eq(datasets.sourceFileId, sourceFileId))
      .orderBy(asc(datasets.name));
    if (!stored.length)
      throw new Error('Stored source file has no imported datasets');
    return {
      sourceFileId,
      reused: true,
      datasets: stored.map(({ sheetName, ...dataset }) => ({
        ...dataset,
        ...(sheetName === null ? {} : { sheetName }),
      })),
    };
  }
}
