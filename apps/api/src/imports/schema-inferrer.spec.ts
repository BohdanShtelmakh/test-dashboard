import { ColumnKeyNormalizer } from './column-key-normalizer.js';
import {
  DEFAULT_SCHEMA_SAMPLE_LIMIT,
  SchemaInferrer,
} from './schema-inferrer.js';
import type { RawCellValue } from './parsing/parser.types.js';

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
    expect(infer([null, ''])).toMatchObject({ type: 'STRING', nullable: true });
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
    expect(inferrer.infer(columns, [[1], ['text']], 1)[0].type).toBe('INTEGER');
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
    expect(inferrer.infer(reordered, [[1, true]]).map((c) => c.type)).toEqual([
      'BOOLEAN',
      'INTEGER',
    ]);
    expect(() => inferrer.infer(columns, [[1, 2]])).toThrow(RangeError);
    expect(() => inferrer.infer([...columns, ...columns], [])).toThrow();
    expect(() =>
      inferrer.infer([{ ...columns[0], position: -1 }], []),
    ).toThrow();
  });
});
