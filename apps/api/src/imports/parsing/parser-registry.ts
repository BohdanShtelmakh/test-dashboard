import { Inject, Injectable } from '@nestjs/common';
import { DelimitedTextParser } from './delimited-text.parser.js';
import type { FileParser, SupportedFileFormat } from './parser.contract.js';
import { ParserError } from './parser.contract.js';
import { XlsxParser } from './xlsx.parser.js';

@Injectable()
export class ParserRegistry {
  constructor(
    @Inject(DelimitedTextParser)
    private readonly delimited: DelimitedTextParser,
    @Inject(XlsxParser) private readonly xlsx: XlsxParser,
  ) {}

  getParser(format: SupportedFileFormat): FileParser {
    if (this.delimited.supports(format)) return this.delimited;
    if (this.xlsx.supports(format)) return this.xlsx;
    throw new ParserError('Unsupported file format', 'UNSUPPORTED_FORMAT', {
      originalName: '',
      format,
    });
  }
}
