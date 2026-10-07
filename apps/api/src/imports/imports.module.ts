import { Module } from '@nestjs/common';
import { ColumnKeyNormalizer } from './column-key-normalizer.js';
import { ParsingModule } from './parsing/parsing.module.js';
import { SchemaInferrer } from './schema-inferrer.js';
import { ValueNormalizer } from './value-normalizer.js';

@Module({
  imports: [ParsingModule],
  providers: [ColumnKeyNormalizer, SchemaInferrer, ValueNormalizer],
  exports: [
    ParsingModule,
    ColumnKeyNormalizer,
    SchemaInferrer,
    ValueNormalizer,
  ],
})
export class ImportsModule {}
