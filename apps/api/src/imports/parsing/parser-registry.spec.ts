import { Test } from '@nestjs/testing';
import { DelimitedTextParser } from './delimited-text.parser.js';
import { ParserRegistry } from './parser-registry.js';
import type { SupportedFileFormat } from './parser.contract.js';
import { XlsxParser } from './xlsx.parser.js';

describe('ParserRegistry', () => {
  it('resolves parsers through Nest without database or HTTP dependencies', async () => {
    const module = await Test.createTestingModule({
      providers: [DelimitedTextParser, XlsxParser, ParserRegistry],
    }).compile();
    const registry = module.get(ParserRegistry);
    expect(registry.getParser('CSV')).toBe(module.get(DelimitedTextParser));
    expect(registry.getParser('TSV')).toBe(module.get(DelimitedTextParser));
    expect(registry.getParser('XLSX')).toBe(module.get(XlsxParser));
    expect(() => registry.getParser('PDF' as SupportedFileFormat)).toThrow(
      'Unsupported file format',
    );
    await module.close();
  });
});
