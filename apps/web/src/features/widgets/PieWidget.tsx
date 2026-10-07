import { Text } from '@mantine/core'
import { Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { pieData } from './chart-data.ts'
import { chartColor } from './chart-style.ts'
import type { WidgetDetail } from './widgets.types.ts'
export function PieWidget({
  widget,
}: {
  widget: Extract<WidgetDetail, { type: 'PIE' }>
}) {
  const data = pieData(widget.dataset, widget.config).map((row, index) => ({
    ...row,
    fill: chartColor(index),
  }))
  if (!data.some((row) => row.value > 0))
    return <Text c="dimmed">No positive chart values to display.</Text>
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="45%"
          outerRadius="75%"
          isAnimationActive={false}
        />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}
