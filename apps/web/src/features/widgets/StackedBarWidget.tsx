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
import { hasNumericData, stackedBarData } from './chart-data.ts'
import type { CartesianPoint } from './chart-data.ts'
import { chartColor } from './chart-style.ts'
import type { WidgetDetail } from './widgets.types.ts'
export function StackedBarWidget({
  widget,
}: {
  widget: Extract<WidgetDetail, { type: 'STACKED_BAR' }>
}) {
  const { data, series } = stackedBarData(widget.dataset, widget.config)
  if (!hasNumericData(data))
    return <Text c="dimmed">No valid chart data to display.</Text>
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <BarChart
        data={data}
        margin={{ top: 12, right: 12, bottom: 8, left: -20 }}
      >
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="x" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((item, index) => (
          <Bar
            key={item.id}
            dataKey={(point: CartesianPoint) => point.values[item.id]}
            name={item.label}
            stackId="values"
            fill={chartColor(index)}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
