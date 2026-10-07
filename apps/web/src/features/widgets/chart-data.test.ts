import { describe, expect, it } from 'vitest'
import {
  dateLabel,
  numericValue,
  pieData,
  pivotLineData,
  stackedBarData,
  stringLabel,
} from './chart-data.ts'
import type { Dataset } from './widgets.types.ts'

function dataset(rows: Record<string, unknown>[]): Dataset {
  return {
    id: 'dataset',
    name: 'Test',
    rowCount: rows.length,
    columns: [
      { name: 'Date', key: 'date', type: 'DATE', position: 0, nullable: false },
      {
        name: 'Result',
        key: 'result',
        type: 'NUMBER',
        position: 1,
        nullable: false,
      },
    ],
    rows,
  }
}

describe('LINE data', () => {
  it('pivots long-form rows, discovers dynamic series, sorts dates, and preserves input', () => {
    const rows = [
      { date: '2025-01-02', campaign: 'Custom team', result: 10 },
      { date: '2024-12-30', campaign: 'Other team', result: 20 },
      { date: '2024-12-30', campaign: 'Custom team', result: 5 },
    ]
    const before = structuredClone(rows)
    rows.forEach(Object.freeze)
    const { data, series } = pivotLineData(dataset(rows), {
      xKey: 'date',
      seriesKey: 'campaign',
      valueKey: 'result',
    })
    expect(series.map((item) => item.label)).toEqual([
      'Custom team',
      'Other team',
    ])
    expect(data).toEqual([
      { x: '2024-12-30', values: { series_0: 5, series_1: 20 } },
      { x: '2025-01-02', values: { series_0: 10, series_1: null } },
    ])
    expect(rows).toEqual(before)
  })

  it('handles names that collide with chart properties safely', () => {
    const { data, series } = pivotLineData(
      dataset([
        { date: '2025-01-01', campaign: '__proto__', result: 1 },
        { date: '2025-01-01', campaign: 'x', result: 2 },
      ]),
      { xKey: 'date', seriesKey: 'campaign', valueKey: 'result' },
    )
    expect(series.map((item) => item.label)).toEqual(['__proto__', 'x'])
    expect(data[0]).toEqual({
      x: '2025-01-01',
      values: { series_0: 1, series_1: 2 },
    })
  })

  it('skips invalid dates, keeps numeric gaps, and retains the last valid duplicate', () => {
    const { data } = pivotLineData(
      dataset([
        { date: 45649, campaign: 'Team', result: 2 },
        { date: '2025-02-30', campaign: 'Team', result: 3 },
        { date: '2025-01-01', campaign: 'Team', result: 1 },
        { date: '2025-01-01', campaign: 'Team', result: 5 },
        { date: '2025-01-01', campaign: 'Team', result: 'bad' },
        { date: '2025-01-02', campaign: 'Team', result: null },
      ]),
      { xKey: 'date', seriesKey: 'campaign', valueKey: 'result' },
    )
    expect(data).toEqual([
      { x: '2025-01-01', values: { series_0: 5 } },
      { x: '2025-01-02', values: { series_0: null } },
    ])
  })

  it('supports a single series and preserves categorical source order', () => {
    const input = dataset([
      { category: 'B', result: 0 },
      { category: 'A', result: 2 },
    ])
    const { data, series } = pivotLineData(input, {
      xKey: 'category',
      valueKey: 'result',
    })
    expect(series.map((item) => item.label)).toEqual(['Result'])
    expect(data.map((point) => point.x)).toEqual(['B', 'A'])
    expect(data[0].values.series_0).toBe(0)
  })
})

describe('other chart data and scalar safety', () => {
  it('uses arbitrary stacked series config, preserving zero and gaps', () => {
    const input = dataset([
      { category: 'One', wins: 0, losses: 2, ignored: 100 },
      { category: 'Two', wins: 4, losses: 'bad' },
    ])
    const { data, series } = stackedBarData(input, {
      categoryKey: 'category',
      seriesKeys: ['losses', 'wins'],
    })
    expect(series.map((item) => item.key)).toEqual(['losses', 'wins'])
    expect(data).toEqual([
      { x: 'One', values: { series_0: 2, series_1: 0 } },
      { x: 'Two', values: { series_0: null, series_1: 4 } },
    ])
  })
  it('filters invalid pie values without hardcoded labels', () => {
    expect(
      pieData(
        dataset([
          { name: 'Team', result: 2 },
          { name: 'Zero', result: 0 },
          { name: 'Negative', result: -1 },
          { name: {}, result: 3 },
          { name: 'Bad', result: '4' },
        ]),
        { labelKey: 'name', valueKey: 'result' },
      ),
    ).toEqual([
      { name: 'Team', value: 2 },
      { name: 'Zero', value: 0 },
    ])
  })
  it('does not coerce arbitrary values into chart numbers or dates', () => {
    for (const value of [null, undefined, '12', true, {}, NaN, Infinity])
      expect(numericValue(value)).toBeNull()
    expect(numericValue(0)).toBe(0)
    expect(stringLabel({})).toBeNull()
    expect(dateLabel(45649)).toBeNull()
    expect(dateLabel('2024-12-23')).toBe('2024-12-23')
    expect(dateLabel('2025-02-30')).toBeNull()
  })
})
