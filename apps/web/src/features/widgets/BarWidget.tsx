import { Text } from '@mantine/core'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { hasNumericData, pivotLineData } from './chart-data.ts'
import type { CartesianPoint } from './chart-data.ts'
import { axisLabel, chartColor } from './chart-style.ts'
import type { WidgetDetail } from './widgets.types.ts'
export function BarWidget({
  widget,
}: {
  widget: Extract<WidgetDetail, { type: 'BAR' }>
}) {
  const config =
    'categoryKey' in widget.config
      ? { xKey: widget.config.categoryKey, valueKey: widget.config.valueKey }
      : widget.config
  const { data, series } = pivotLineData(widget.dataset, config)
  if (!hasNumericData(data))
    return <Text c="dimmed">No valid chart data to display.</Text>
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <BarChart
        data={data}
        margin={{ top: 12, right: 12, bottom: 8, left: -20 }}
      >
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="x" tickFormatter={axisLabel} tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((item, index) => (
          <Bar
            key={item.id}
            dataKey={(point: CartesianPoint) => point.values[item.id]}
            name={item.label}
            fill={chartColor(index)}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
