import { Injectable } from '@nestjs/common';
import { assertRowWidth, columnWidth } from './column-validation.js';
import type {
  InferredColumn,
  InferredColumnType,
  NormalizedColumn,
} from './import.types.js';
import type { RawCellValue } from './parsing/parser.types.js';
import {
  booleanValue,
  dateOnlyValue,
  datetimeValue,
  isEmpty,
  numericValue,
} from './scalar-values.js';

export const DEFAULT_SCHEMA_SAMPLE_LIMIT = 200;

function valueType(value: RawCellValue | undefined): InferredColumnType {
  if (booleanValue(value) !== undefined) return 'BOOLEAN';
  const numeric = numericValue(value);
  if (numeric) return numeric.type;
  if (dateOnlyValue(value) !== undefined) return 'DATE';
  if (datetimeValue(value) !== undefined) return 'DATETIME';
  return 'STRING';
}

function widen(
  current: InferredColumnType | undefined,
  observed: InferredColumnType,
): InferredColumnType {
  if (current === undefined || current === observed) return observed;
  if (
    (current === 'INTEGER' && observed === 'NUMBER') ||
    (current === 'NUMBER' && observed === 'INTEGER')
  )
    return 'NUMBER';
  if (
    (current === 'DATE' && observed === 'DATETIME') ||
    (current === 'DATETIME' && observed === 'DATE')
  )
    return 'DATETIME';
  return 'STRING';
}

@Injectable()
export class SchemaInferrer {
  infer(
    columns: readonly NormalizedColumn[],
    sample: readonly (readonly RawCellValue[])[],
    sampleLimit = DEFAULT_SCHEMA_SAMPLE_LIMIT,
  ): InferredColumn[] {
    if (!Number.isSafeInteger(sampleLimit) || sampleLimit <= 0) {
      throw new RangeError('Sample limit must be a positive safe integer');
    }
    const width = columnWidth(columns);
    const observedTypes: (InferredColumnType | undefined)[] = columns.map(
      () => undefined,
    );
    const nullable = columns.map(() => false);
    const count = Math.min(sample.length, sampleLimit);
    for (let index = 0; index < count; index++) {
      const row = sample[index];
      assertRowWidth(row, width);
      columns.forEach((column, columnIndex) => {
        const value = row[column.position];
        if (isEmpty(value)) nullable[columnIndex] = true;
        else
          observedTypes[columnIndex] = widen(
            observedTypes[columnIndex],
            valueType(value),
          );
      });
    }
    return columns.map((column, index) => ({
      ...column,
      type: observedTypes[index] ?? 'STRING',
      nullable: nullable[index] || count === 0,
    }));
  }
}
