import { ColumnKeyNormalizer } from './column-key-normalizer.js';
import { SchemaInferrer } from './schema-inferrer.js';
import { ValueNormalizer } from './value-normalizer.js';
import type { RawCellValue } from './parsing/parser.types.js';
import { xlsxDateValue } from './xlsx-cell-values.js';

const cell = (raw: number, formatted: string): RawCellValue => ({
  kind: 'xlsx',
  raw,
  formatted,
});
const keys = new ColumnKeyNormalizer().normalize(['Value']);
const infer = (value: RawCellValue) =>
  new SchemaInferrer().infer(keys, [[value]]);

describe('XLSX formatting hints', () => {
  it('infers and normalizes calendar-formatted serials without changing bare numbers', () => {
    const value = cell(45649, '12/23/2024');
    expect(infer(value)[0].type).toBe('DATE');
    expect(new ValueNormalizer().normalize(infer(value), [value])).toEqual({
      value: '2024-12-23',
    });
    expect(infer(45649)[0].type).toBe('INTEGER');
    expect(new ValueNormalizer().normalize(infer(45649), [45649])).toEqual({
      value: 45649,
    });
  });

  it.each(['45,649', '$45,649.00', '4564900%', '2024-12-24', '12/23', '45649'])(
    'keeps non-calendar or mismatched display %s numeric',
    (formatted) => {
      const value = cell(45649, formatted);
      expect(infer(value)[0].type).toBe('INTEGER');
      expect(new ValueNormalizer().normalize(infer(value), [value])).toEqual({
        value: 45649,
      });
    },
  );

  it('preserves fractions as UTC datetimes and widens date/date-time samples', () => {
    const date = cell(45649, '12/23/2024');
    const datetime = cell(45649.5, '12/23/2024 12:00:00 PM');
    const columns = new SchemaInferrer().infer(keys, [[date], [datetime]]);
    expect(columns[0].type).toBe('DATETIME');
    const normalizer = new ValueNormalizer();
    expect(normalizer.normalize(columns, [date])).toEqual({
      value: '2024-12-23T00:00:00.000Z',
    });
    expect(normalizer.normalize(columns, [datetime])).toEqual({
      value: '2024-12-23T12:00:00.000Z',
    });
    expect(xlsxDateValue(cell(45649.5, '12/23/2024'))).toEqual({
      type: 'DATETIME',
      iso: '2024-12-23T12:00:00.000Z',
    });
  });

  it('rejects invalid displays and Excel fictitious leap day', () => {
    expect(xlsxDateValue(cell(60, '2/29/1900'))).toBeUndefined();
    expect(xlsxDateValue(cell(45649, '12/32/2024'))).toBeUndefined();
    expect(xlsxDateValue(cell(45649.5, '12/23/2024 13:00:00'))).toBeUndefined();
    expect(xlsxDateValue(cell(59, '2/28/1900'))?.iso).toBe('1900-02-28');
    expect(xlsxDateValue(cell(61, '3/1/1900'))?.iso).toBe('1900-03-01');
  });

  it('retains nulls, booleans, and strings when XLSX cells are wrapped', () => {
    const columns = new SchemaInferrer().infer(
      new ColumnKeyNormalizer().normalize(['Empty', 'Flag', 'Name']),
      [
        [
          { kind: 'xlsx', raw: null, formatted: null },
          { kind: 'xlsx', raw: false, formatted: false },
          { kind: 'xlsx', raw: 'text', formatted: 'text' },
        ],
      ],
    );
    expect(
      new ValueNormalizer().normalize(columns, [
        { kind: 'xlsx', raw: null, formatted: null },
        { kind: 'xlsx', raw: false, formatted: false },
        { kind: 'xlsx', raw: 'text', formatted: 'text' },
      ]),
    ).toEqual({ empty: null, flag: false, name: 'text' });
  });
});
