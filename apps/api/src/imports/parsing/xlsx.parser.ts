import { Injectable } from '@nestjs/common';
import { finished } from 'node:stream/promises';
import { getWorksheets, getXlsxStreams } from 'xlstream';
import type { FileParser } from './file-parser.interface.js';
import { fileParseError, ParserError } from './parser.error.js';
import type {
  ParseFileInput,
  ParsedDataset,
  RawCellValue,
  SupportedFileFormat,
} from './parser.types.js';

function rawValues(record: { raw: { arr: unknown[] } }): RawCellValue[] {
  return Array.from(record.raw.arr, (value): RawCellValue => {
    if (value === undefined || value === null) return null;
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value instanceof Date
    ) {
      return value;
    }
    throw new Error('Unsupported raw XLSX cell value');
  });
}

@Injectable()
export class XlsxParser implements FileParser {
  supports(format: SupportedFileFormat): boolean {
    return format === 'XLSX';
  }

  async *parse(input: ParseFileInput): AsyncGenerator<ParsedDataset> {
    if (!this.supports(input.format)) {
      throw new ParserError(
        'Unsupported workbook format',
        'UNSUPPORTED_FORMAT',
        input,
      );
    }
    try {
      const sheets = await getWorksheets({ filePath: input.filePath });
      if (!sheets.length) return;
      const streams = getXlsxStreams({
        filePath: input.filePath,
        sheets: sheets.map((sheet) => ({
          id: sheet.name,
          withHeader: false,
          ignoreEmpty: true,
          fillMergedCells: false,
        })),
      });
      let sheetIndex = 0;
      for await (const stream of streams) {
        const sheetName = sheets[sheetIndex++].name;
        const records = stream[
          Symbol.asyncIterator
        ]() as AsyncIterableIterator<{ raw: { arr: unknown[] } }>;
        let rowsClosed = false;
        async function* rows(): AsyncGenerator<RawCellValue[]> {
          try {
            for await (const record of records) yield rawValues(record);
          } catch (cause) {
            throw fileParseError(cause, input);
          } finally {
            rowsClosed = true;
            stream.destroy();
            await finished(stream, { cleanup: true }).catch(() => {});
          }
        }
        try {
          let header = await records.next();
          while (
            !header.done &&
            rawValues(header.value).every(
              (value) => value === null || value === '',
            )
          ) {
            header = await records.next();
          }
          if (header.done) continue;
          yield {
            name: sheetName,
            sheetName,
            headers: rawValues(header.value).map((value) =>
              value === null ? '' : String(value),
            ),
            rows: rows(),
          };
          if (!rowsClosed) {
            throw new ParserError(
              'Consume or close rows before advancing datasets',
              'INVALID_ITERATION',
              input,
            );
          }
        } finally {
          stream.destroy();
          await records.return?.();
          await finished(stream, { cleanup: true }).catch(() => {});
        }
      }
    } catch (cause) {
      throw fileParseError(cause, input);
    }
  }
}
