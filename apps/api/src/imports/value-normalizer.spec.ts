import type { InferredColumn, InferredColumnType } from './import.types.js';
import type { RawCellValue } from './parsing/parser.types.js';
import {
  ValueNormalizer,
  ValueNormalizationError,
} from './value-normalizer.js';

const normalizer = new ValueNormalizer();
const column = (type: InferredColumnType): InferredColumn => ({
  position: 0,
  name: 'Value',
  key: 'value',
  type,
  nullable: false,
});

describe('ValueNormalizer', () => {
  it.each([
    ['INTEGER', '15', 15],
    ['NUMBER', '1.25', 1.25],
    ['NUMBER', '3e2', 300],
    ['BOOLEAN', ' FALSE ', false],
    ['BOOLEAN', true, true],
    ['DATE', '2026-01-01', '2026-01-01'],
    ['DATE', new Date('2026-01-01T00:00:00Z'), '2026-01-01'],
    ['DATETIME', '2026-01-01T12:00:00+02:00', '2026-01-01T10:00:00.000Z'],
    ['DATETIME', '2026-01-01', '2026-01-01T00:00:00.000Z'],
    ['DATETIME', new Date('2026-01-01T12:00:00Z'), '2026-01-01T12:00:00.000Z'],
    ['STRING', ' padded ', ' padded '],
    ['STRING', 15, '15'],
    ['STRING', new Date('2026-01-01T00:00:00Z'), '2026-01-01T00:00:00.000Z'],
  ] satisfies [InferredColumnType, RawCellValue, unknown][])(
    'converts %s value %s',
    (type, value, expected) => {
      expect(normalizer.normalize([column(type)], [value])).toEqual({
        value: expected,
      });
    },
  );

  it('normalizes empty or absent cells to null while retaining zero and false', () => {
    for (const value of [null, '', ' \t '])
      expect(normalizer.normalize([column('INTEGER')], [value])).toEqual({
        value: null,
      });
    expect(normalizer.normalize([column('INTEGER')], [])).toEqual({
      value: null,
    });
    expect(normalizer.normalize([column('INTEGER')], [0])).toEqual({
      value: 0,
    });
    expect(normalizer.normalize([column('BOOLEAN')], [false])).toEqual({
      value: false,
    });
  });

  it.each([
    ['INTEGER', '1.5'],
    ['NUMBER', '001'],
    ['NUMBER', Infinity],
    ['BOOLEAN', 'yes'],
    ['DATE', '2026-02-30'],
    ['DATE', new Date('2026-01-01T12:00:00Z')],
    ['DATETIME', '2026-01-01T12:00:00'],
    ['STRING', new Date(NaN)],
  ] satisfies [InferredColumnType, RawCellValue][])(
    'rejects invalid %s values with column context',
    (type, value) => {
      expect(() => normalizer.normalize([column(type)], [value])).toThrow(
        ValueNormalizationError,
      );
      expect(() => normalizer.normalize([column(type)], [value])).toThrow(
        `position 0 as ${type}`,
      );
    },
  );

  it('maps explicit positions without mutating the row', () => {
    const row = Object.freeze(['Nike', '15']);
    const columns: InferredColumn[] = [
      { ...column('INTEGER'), position: 1, key: 'result' },
      { ...column('STRING'), key: 'campaign' },
    ];
    expect(normalizer.normalize(columns, row)).toEqual({
      result: 15,
      campaign: 'Nike',
    });
  });

  it('rejects excess cells and duplicate keys', () => {
    expect(() => normalizer.normalize([column('INTEGER')], [1, 2])).toThrow(
      RangeError,
    );
    expect(() =>
      normalizer.normalize(
        [column('STRING'), { ...column('STRING'), position: 1 }],
        ['a', 'b'],
      ),
    ).toThrow();
  });

  it('creates ordinary own properties even for special keys', () => {
    const result = normalizer.normalize(
      [{ ...column('STRING'), key: '__proto__' }],
      ['safe'],
    );
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.hasOwn(result, '__proto__')).toBe(true);
    expect(result['__proto__']).toBe('safe');
  });
});
