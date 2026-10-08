import { Module } from '@nestjs/common';
import { ColumnKeyNormalizer } from './column-key-normalizer.js';
import { DatabaseModule } from '../database/database.module.js';
import { ParserRegistry } from './parsing/parser-registry.js';
import { DelimitedTextParser } from './parsing/delimited-text.parser.js';
import { XlsxParser } from './parsing/xlsx.parser.js';
import { SchemaInferrer, ValueNormalizer } from './data-normalization.js';
import { DatasetWriter } from './dataset-persistence.js';
import { ImportService } from './import.service.js';

@Module({
  imports: [DatabaseModule],
  providers: [
    ColumnKeyNormalizer,
    SchemaInferrer,
    ValueNormalizer,
    DelimitedTextParser,
    XlsxParser,
    ParserRegistry,
    DatasetWriter,
    ImportService,
  ],
  exports: [ImportService],
})
export class ImportsModule {}
