import type { ParseFileInput } from './parser.types.js';

export class ParserError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'UNSUPPORTED_FORMAT'
      | 'MISSING_HEADER'
      | 'FILE_PARSE_FAILED'
      | 'INVALID_ITERATION',
    readonly source: Pick<ParseFileInput, 'originalName' | 'format'>,
    options?: ErrorOptions,
  ) {
    super(`${source.originalName} (${source.format}): ${message}`, options);
    this.name = 'ParserError';
  }
}

export function fileParseError(
  cause: unknown,
  input: ParseFileInput,
): ParserError {
  if (cause instanceof ParserError) return cause;
  const detail =
    cause instanceof Error ? cause.message : 'Unknown parser failure';
  return new ParserError(detail, 'FILE_PARSE_FAILED', input, { cause });
}
