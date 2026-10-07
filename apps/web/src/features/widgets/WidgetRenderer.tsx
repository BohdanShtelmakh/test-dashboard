import { BarWidget } from './BarWidget.tsx'
import { LineWidget } from './LineWidget.tsx'
import { PieWidget } from './PieWidget.tsx'
import { StackedBarWidget } from './StackedBarWidget.tsx'
import { TextWidget } from './TextWidget.tsx'
import type { WidgetDetail } from './widgets.types.ts'
export function WidgetRenderer({ widget }: { widget: WidgetDetail }) {
  switch (widget.type) {
    case 'LINE':
      return <LineWidget widget={widget} />
    case 'BAR':
      return <BarWidget widget={widget} />
    case 'PIE':
      return <PieWidget widget={widget} />
    case 'STACKED_BAR':
      return <StackedBarWidget widget={widget} />
    case 'TEXT':
      return <TextWidget widget={widget} />
  }
}
