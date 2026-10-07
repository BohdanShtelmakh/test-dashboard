import { Text } from '@mantine/core'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { hasNumericData, pivotLineData } from './chart-data.ts'
import type { CartesianPoint } from './chart-data.ts'
import { axisLabel, chartColor } from './chart-style.ts'
import type { WidgetDetail } from './widgets.types.ts'

export function LineWidget({
  widget,
}: {
  widget: Extract<WidgetDetail, { type: 'LINE' }>
}) {
  const { data, series } = pivotLineData(widget.dataset, widget.config)
  if (!hasNumericData(data))
    return <Text c="dimmed">No valid chart data to display.</Text>
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <LineChart
        data={data}
        margin={{ top: 12, right: 12, bottom: 8, left: -20 }}
      >
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="x"
          tickFormatter={axisLabel}
          tick={{ fontSize: 11 }}
          minTickGap={24}
        />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((item, index) => (
          <Line
            key={item.id}
            dataKey={(point: CartesianPoint) => point.values[item.id]}
            name={item.label}
            stroke={chartColor(index)}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
