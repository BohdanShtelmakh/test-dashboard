import type { ChartConfigMap, Dataset } from './widgets.types.ts'

export function numericValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
export function stringLabel(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return String(value)
  return null
}
export function dateLabel(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(
      value,
    )
  )
    return null
  const calendar = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  return Number.isFinite(calendar.getTime()) &&
    calendar.toISOString().slice(0, 10) === value.slice(0, 10) &&
    Number.isFinite(Date.parse(value))
    ? value
    : null
}
export interface ChartSeries {
  id: string
  label: string
}
export interface CartesianPoint {
  x: string
  values: Record<string, number | null>
}

export function pivotLineData(
  dataset: Dataset,
  config: ChartConfigMap['LINE'],
) {
  const dateAxis = dataset.columns.some(
    (column) =>
      column.key === config.xKey &&
      (column.type === 'DATE' || column.type === 'DATETIME'),
  )
  const seriesByLabel = new Map<string, ChartSeries>()
  const points = new Map<string, CartesianPoint>()
  for (const row of dataset.rows) {
    const x = dateAxis
      ? dateLabel(row[config.xKey])
      : stringLabel(row[config.xKey])
    const label = config.seriesKey
      ? stringLabel(row[config.seriesKey])
      : dataset.columns.find((column) => column.key === config.valueKey)
          ?.name || config.valueKey
    if (x === null || label === null) continue
    let series = seriesByLabel.get(label)
    if (!series) {
      series = { id: `series_${seriesByLabel.size}`, label }
      seriesByLabel.set(label, series)
    }
    let point = points.get(x)
    if (!point) {
      point = { x, values: {} }
      points.set(x, point)
    }
    const value = numericValue(row[config.valueKey])
    // If duplicate x/series pairs exist, retain the last valid source value.
    if (value !== null) point.values[series.id] = value
  }
  const series = [...seriesByLabel.values()]
  const data = [...points.values()].map((point) => ({
    x: point.x,
    values: Object.fromEntries(
      series.map((item) => [item.id, point.values[item.id] ?? null]),
    ),
  }))
  if (dateAxis) data.sort((a, b) => Date.parse(a.x) - Date.parse(b.x))
  return { data, series }
}

export function stackedBarData(
  dataset: Dataset,
  config: ChartConfigMap['STACKED_BAR'],
) {
  const series = config.seriesKeys.map((key, index) => ({
    id: `series_${index}`,
    key,
    label: dataset.columns.find((column) => column.key === key)?.name || key,
  }))
  const data: CartesianPoint[] = []
  for (const row of dataset.rows) {
    const x = stringLabel(row[config.categoryKey])
    if (x !== null)
      data.push({
        x,
        values: Object.fromEntries(
          series.map((item) => [item.id, numericValue(row[item.key])]),
        ),
      })
  }
  return { data, series }
}

export function pieData(dataset: Dataset, config: ChartConfigMap['PIE']) {
  return dataset.rows.flatMap((row) => {
    const name = stringLabel(row[config.labelKey])
    const value = numericValue(row[config.valueKey])
    return name !== null && value !== null && value >= 0
      ? [{ name, value }]
      : []
  })
}

export function hasNumericData(data: CartesianPoint[]): boolean {
  return data.some((point) =>
    Object.values(point.values).some((value) => value !== null),
  )
}
