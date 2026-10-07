import { Test } from '@nestjs/testing';
import { ColumnKeyNormalizer } from './column-key-normalizer.js';
import { ImportsModule } from './imports.module.js';
import { ParserRegistry } from './parsing/parser-registry.js';
import { SchemaInferrer } from './schema-inferrer.js';
import { ValueNormalizer } from './value-normalizer.js';
import { ImportService } from './import.service.js';

describe('ImportsModule', () => {
  it('exports the parsing and normalization services through Nest without a database', async () => {
    const module = await Test.createTestingModule({
      imports: [ImportsModule],
      providers: [
        {
          provide: 'pipeline',
          inject: [
            ParserRegistry,
            ColumnKeyNormalizer,
            SchemaInferrer,
            ValueNormalizer,
          ],
          useFactory: (
            registry: ParserRegistry,
            keys: ColumnKeyNormalizer,
            inferrer: SchemaInferrer,
            values: ValueNormalizer,
          ) => ({ registry, keys, inferrer, values }),
        },
      ],
    })
      .overrideProvider(ImportService)
      .useValue({})
      .compile();
    try {
      const pipeline = module.get<{
        registry: ParserRegistry;
        keys: ColumnKeyNormalizer;
        inferrer: SchemaInferrer;
        values: ValueNormalizer;
      }>('pipeline');
      expect(pipeline.registry.getParser('CSV')).toBe(
        pipeline.registry.getParser('TSV'),
      );
      const columns = pipeline.keys.normalize(['Campaign', 'Date', 'Result']);
      const row = ['Nike', '2026-01-01', '15'];
      expect(
        pipeline.values.normalize(pipeline.inferrer.infer(columns, [row]), row),
      ).toEqual({ campaign: 'Nike', date: '2026-01-01', result: 15 });
    } finally {
      await module.close();
    }
  });
});
