import { Test } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service.js';
import { ColumnKeyNormalizer } from './column-key-normalizer.js';
import { ImportsModule } from './imports.module.js';
import { ParserRegistry } from './parsing/parser-registry.js';
import { SchemaInferrer, ValueNormalizer } from './data-normalization.js';
import { ImportService } from './import.service.js';

describe('ImportsModule', () => {
  it('exports ImportService while keeping the parsing pipeline functional internally', async () => {
    const importer = { importFile: vi.fn() };
    const module = await Test.createTestingModule({
      imports: [ImportsModule],
      providers: [
        {
          provide: 'consumer',
          inject: [ImportService],
          useFactory: (service: ImportService) => service,
        },
      ],
    })
      .overrideProvider(DatabaseService)
      .useValue({})
      .overrideProvider(ImportService)
      .useValue(importer)
      .compile();
    try {
      expect(module.get('consumer')).toBe(importer);
      const internal = module.select(ImportsModule);
      const registry = internal.get(ParserRegistry, { strict: true });
      expect(registry.getParser('CSV')).toBe(registry.getParser('TSV'));
      const columns = internal
        .get(ColumnKeyNormalizer, { strict: true })
        .normalize(['Campaign', 'Date', 'Result']);
      const row = ['Nike', '2026-01-01', '15'];
      const inferred = internal
        .get(SchemaInferrer, { strict: true })
        .infer(columns, [row]);
      expect(
        internal
          .get(ValueNormalizer, { strict: true })
          .normalize(inferred, row),
      ).toEqual({ campaign: 'Nike', date: '2026-01-01', result: 15 });
    } finally {
      await module.close();
    }
  });

  it('does not expose normalization providers to importing modules', async () => {
    await expect(
      Test.createTestingModule({
        imports: [ImportsModule],
        providers: [
          {
            provide: 'consumer',
            inject: [SchemaInferrer],
            useFactory: (service: SchemaInferrer) => service,
          },
        ],
      })
        .overrideProvider(DatabaseService)
        .useValue({})
        .overrideProvider(ImportService)
        .useValue({})
        .compile(),
    ).rejects.toThrow(/resolve dependencies/);
  });
});
