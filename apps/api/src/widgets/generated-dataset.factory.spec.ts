import { vi } from 'vitest';
import { GeneratedDatasetFactory } from './generated-dataset.factory.js';
import { validateChartConfig } from './widget-config.js';

vi.mock('node:crypto', () => ({ randomInt: () => 42 }));

describe('GeneratedDatasetFactory', () => {
  afterEach(() => vi.useRealTimers());
  it.each([
    ['LINE', 30],
    ['BAR', 6],
    ['STACKED_BAR', 5],
    ['PIE', 5],
  ] as const)('generates valid %s definitions', (type, rowCount) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T23:59:00Z'));
    const definition = new GeneratedDatasetFactory().create(type);
    expect(definition.rows).toHaveLength(rowCount);
    expect(
      validateChartConfig(type, definition.chart.config, definition.columns),
    ).toEqual(definition.chart);
    for (const row of definition.rows) {
      expect(Object.keys(row).sort()).toEqual(
        definition.columns.map((column) => column.key).sort(),
      );
      for (const column of definition.columns) {
        if (column.type === 'INTEGER') expect(row[column.key]).toBe(42);
        else expect(typeof row[column.key]).toBe('string');
      }
    }
    if (type === 'LINE') {
      expect(definition.rows[0].date).toBe('2026-09-28');
      expect(definition.rows.at(-1)?.date).toBe('2026-10-07');
      expect(new Set(definition.rows.map((row) => row.series)).size).toBe(3);
    }
  });
});
