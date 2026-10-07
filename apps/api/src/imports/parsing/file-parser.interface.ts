import type {
  ParseFileInput,
  ParsedDataset,
  SupportedFileFormat,
} from './parser.types.js';

export interface FileParser {
  supports(format: SupportedFileFormat): boolean;
  parse(input: ParseFileInput): AsyncIterable<ParsedDataset>;
}
