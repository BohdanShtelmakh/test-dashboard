import { Module } from '@nestjs/common';
import { ColumnKeyNormalizer } from './column-key-normalizer.js';
import { ParsingModule } from './parsing/parsing.module.js';
import { SchemaInferrer } from './schema-inferrer.js';
import { ValueNormalizer } from './value-normalizer.js';
import { DatasetWriter } from './dataset-writer.js';
import { SchemaRegistry } from './schema-registry.js';
import { ImportService } from './import.service.js';

@Module({
  imports: [ParsingModule],
  providers: [
    ColumnKeyNormalizer,
    SchemaInferrer,
    ValueNormalizer,
    SchemaRegistry,
    DatasetWriter,
    ImportService,
  ],
  exports: [
    ImportService,
    ParsingModule,
    ColumnKeyNormalizer,
    SchemaInferrer,
    ValueNormalizer,
    SchemaRegistry,
  ],
})
export class ImportsModule {}
