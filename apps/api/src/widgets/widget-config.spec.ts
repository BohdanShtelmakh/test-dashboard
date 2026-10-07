import { validateChartConfig } from './widget-config.js';
import type { DatasetColumnResponse } from './widgets.types.js';
const columns: DatasetColumnResponse[] = [
  { position: 0, name: 'Date', key: 'date', type: 'DATE', nullable: false },
  {
    position: 1,
    name: 'Campaign',
    key: 'campaign',
    type: 'STRING',
    nullable: false,
  },
  {
    position: 2,
    name: 'Result',
    key: 'result',
    type: 'INTEGER',
    nullable: false,
  },
  { position: 3, name: 'Other', key: 'other', type: 'NUMBER', nullable: true },
];

describe('chart config validation', () => {
  it.each(['LINE', 'BAR'] as const)(
    'validates %s fields and optional series',
    (type) => {
      expect(
        validateChartConfig(
          type,
          { xKey: 'date', valueKey: 'result', seriesKey: 'campaign' },
          columns,
        ),
      ).toEqual({
        type,
        config: { xKey: 'date', valueKey: 'result', seriesKey: 'campaign' },
      });
      expect(
        validateChartConfig(
          type,
          { xKey: 'campaign', valueKey: 'result' },
          columns,
        ).config,
      ).toEqual({ xKey: 'campaign', valueKey: 'result' });
    },
  );
  it('validates pie and stacked bar fields', () => {
    expect(
      validateChartConfig(
        'PIE',
        { labelKey: 'campaign', valueKey: 'result' },
        columns,
      ).type,
    ).toBe('PIE');
    expect(
      validateChartConfig(
        'STACKED_BAR',
        { categoryKey: 'campaign', seriesKeys: ['result', 'other'] },
        columns,
      ).config,
    ).toEqual({ categoryKey: 'campaign', seriesKeys: ['result', 'other'] });
  });
  it.each([
    null,
    [],
    'bad',
    {},
    { xKey: 'missing', valueKey: 'result' },
    { xKey: 'date', valueKey: 'campaign' },
    { xKey: 'date', valueKey: 'result', seriesKey: '' },
  ])('rejects invalid line config %j', (config) => {
    expect(() => validateChartConfig('LINE', config, columns)).toThrow();
  });
  it.each([[], ['result', 'result'], ['missing'], ['campaign']])(
    'rejects invalid stacked series %j',
    (...seriesKeys) => {
      expect(() =>
        validateChartConfig(
          'STACKED_BAR',
          { categoryKey: 'campaign', seriesKeys },
          columns,
        ),
      ).toThrow();
    },
  );
});
