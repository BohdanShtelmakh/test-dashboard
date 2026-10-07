import { Module } from '@nestjs/common';
import { DelimitedTextParser } from './delimited-text.parser.js';
import { ParserRegistry } from './parser-registry.js';
import { XlsxParser } from './xlsx.parser.js';

@Module({
  providers: [DelimitedTextParser, XlsxParser, ParserRegistry],
  exports: [DelimitedTextParser, XlsxParser, ParserRegistry],
})
export class ParsingModule {}
