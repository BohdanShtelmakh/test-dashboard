import { Injectable } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { basename, extname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { parse } from 'csv-parse';
import type {
  FileParser,
  ParseFileInput,
  ParsedDataset,
  RawCellValue,
  SupportedFileFormat,
} from './parser.contract.js';
import { fileParseError, ParserError } from './parser.contract.js';

@Injectable()
export class DelimitedTextParser implements FileParser {
  supports(format: SupportedFileFormat): boolean {
    return format === 'CSV' || format === 'TSV';
  }

  async *parse(input: ParseFileInput): AsyncGenerator<ParsedDataset> {
    if (!this.supports(input.format)) {
      throw new ParserError(
        'Unsupported delimited format',
        'UNSUPPORTED_FORMAT',
        input,
      );
    }
    const source = createReadStream(input.filePath);
    const parser = parse({
      delimiter: input.format === 'TSV' ? '\t' : ',',
      bom: true,
      record_delimiter: ['\r\n', '\n', '\r'],
      skip_empty_lines: true,
      // Empty records must not establish the header width; validate it below.
      relax_column_count: true,
      on_record: (record: string[]) =>
        record.every((cell) => cell === '') ? null : record,
    });
    const completion = pipeline(source, parser);
    // Errors are delivered through the parser iterator; attach a handler immediately.
    void completion.catch(() => {});
    const records = parser[Symbol.asyncIterator]() as AsyncIterableIterator<
      string[]
    >;
    let rowsClosed = false;
    let headerWidth = 0;
    async function* rows(): AsyncGenerator<RawCellValue[]> {
      try {
        for await (const record of records) {
          if (record.length !== headerWidth) {
            throw new ParserError(
              `Invalid record length: expected ${headerWidth} fields, got ${record.length}`,
              'FILE_PARSE_FAILED',
              input,
            );
          }
          yield record;
        }
      } catch (cause) {
        throw fileParseError(cause, input);
      } finally {
        rowsClosed = true;
        source.destroy();
        parser.destroy();
        await completion.catch(() => {});
      }
    }
    try {
      const header = await records.next();
      if (header.done) {
        throw new ParserError('Missing header row', 'MISSING_HEADER', input);
      }
      headerWidth = header.value.length;
      yield {
        name: basename(input.originalName, extname(input.originalName)),
        headers: header.value,
        rows: rows(),
      };
      if (!rowsClosed) {
        throw new ParserError(
          'Consume or close rows before advancing datasets',
          'INVALID_ITERATION',
          input,
        );
      }
    } catch (cause) {
      throw fileParseError(cause, input);
    } finally {
      source.destroy();
      parser.destroy();
      await records.return?.();
      await completion.catch(() => {});
    }
  }
}
