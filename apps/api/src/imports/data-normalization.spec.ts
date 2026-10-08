import { ColumnKeyNormalizer } from './column-key-normalizer.js';
import {
  DEFAULT_SCHEMA_SAMPLE_LIMIT,
  SchemaInferrer,
  ValueNormalizer,
  ValueNormalizationError,
  xlsxDateValue,
} from './data-normalization.js';
import type { RawCellValue } from './parsing/parser.contract.js';
import type {
  InferredColumn,
  InferredColumnType,
} from '../database/dataset.contract.js';

describe('schema-inferrer', () => {
  const inferrer = new SchemaInferrer();

  const columns = new ColumnKeyNormalizer().normalize(['Value']);

  const infer = (values: RawCellValue[]) =>
    inferrer.infer(
      columns,
      values.map((v) => [v]),
    )[0];

  describe('SchemaInferrer', () => {
    it.each([
      [[1, '-2', ' 0 '], 'INTEGER'],
      [[1.5, '2.25', '3e2'], 'NUMBER'],
      [[true, ' FALSE ', false], 'BOOLEAN'],
      [['2024-02-29', '2026-01-01'], 'DATE'],
      [['2026-01-01T12:00:00Z', new Date('2026-01-02T00:00:00Z')], 'DATETIME'],
    ] as const)('infers %j as %s', (values, type) => {
      expect(infer([...values])).toEqual({
        ...columns[0],
        type,
        nullable: false,
      });
    });

    it.each([
      [[1, 1.5], 'NUMBER'],
      [[1.5, 1], 'NUMBER'],
      [['2026-01-01', '2026-01-01T12:00:00Z'], 'DATETIME'],
      [['2026-01-01T12:00:00Z', '2026-01-01'], 'DATETIME'],
      [[1, 'text', 2], 'STRING'],
      [[true, 'yes'], 'STRING'],
      [['2026-01-01', 'yesterday'], 'STRING'],
      [[1, true], 'STRING'],
    ] as const)('widens %j to %s', (values, type) => {
      expect(infer([...values]).type).toBe(type);
    });

    it('ignores empty cells for types and tracks nullability', () => {
      expect(infer([null, '', ' \t ', 0])).toMatchObject({
        type: 'INTEGER',
        nullable: true,
      });
      expect(infer([null, ''])).toMatchObject({
        type: 'STRING',
        nullable: true,
      });
      expect(infer([])).toMatchObject({ type: 'STRING', nullable: true });
      expect(inferrer.infer(columns, [[]])[0].nullable).toBe(true);
    });

    it.each([
      '001',
      '0x10',
      '$12',
      '1,000',
      '9007199254740993',
      '1e999',
      '2026-02-30',
      '01/02/2026',
      '2026-01-01T12:00:00',
      '2026-01-01T24:00:00Z',
      Infinity,
      NaN,
    ])('does not guess ambiguous or invalid value %s', (value) => {
      expect(infer([value]).type).toBe('STRING');
    });

    it('bounds the default sample and allows an explicit limit', () => {
      const sample: RawCellValue[][] = Array.from(
        { length: DEFAULT_SCHEMA_SAMPLE_LIMIT },
        () => [1],
      );
      sample.push(['conflict', 'extra']);
      expect(inferrer.infer(columns, sample)[0].type).toBe('INTEGER');
      expect(inferrer.infer(columns, [[1], ['text']], 1)[0].type).toBe(
        'INTEGER',
      );
    });

    it.each([0, -1, 1.5, Infinity])(
      'rejects invalid sample limit %s',
      (limit) => {
        expect(() => inferrer.infer(columns, [], limit)).toThrow(RangeError);
      },
    );

    it('uses explicit positions and rejects excess cells or invalid definitions', () => {
      const reordered = [
        { position: 1, name: 'B', key: 'b' },
        { position: 0, name: 'A', key: 'a' },
      ];
      expect(inferrer.infer(reordered, [[1, true]]).map((c) => c.type)).toEqual(
        ['BOOLEAN', 'INTEGER'],
      );
      expect(() => inferrer.infer(columns, [[1, 2]])).toThrow(RangeError);
      expect(() => inferrer.infer([...columns, ...columns], [])).toThrow();
      expect(() =>
        inferrer.infer([{ ...columns[0], position: -1 }], []),
      ).toThrow();
    });
  });
});

describe('value-normalizer', () => {
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
      [
        'DATETIME',
        new Date('2026-01-01T12:00:00Z'),
        '2026-01-01T12:00:00.000Z',
      ],
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
});

describe('xlsx-cell-values', () => {
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

    it.each([
      '45,649',
      '$45,649.00',
      '4564900%',
      '2024-12-24',
      '12/23',
      '45649',
    ])('keeps non-calendar or mismatched display %s numeric', (formatted) => {
      const value = cell(45649, formatted);
      expect(infer(value)[0].type).toBe('INTEGER');
      expect(new ValueNormalizer().normalize(infer(value), [value])).toEqual({
        value: 45649,
      });
    });

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
      expect(
        xlsxDateValue(cell(45649.5, '12/23/2024 13:00:00')),
      ).toBeUndefined();
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
});
