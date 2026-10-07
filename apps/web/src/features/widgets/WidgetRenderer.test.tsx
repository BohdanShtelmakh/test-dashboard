import { describe, expect, it } from 'vitest'
import { BarWidget } from './BarWidget.tsx'
import { LineWidget } from './LineWidget.tsx'
import { PieWidget } from './PieWidget.tsx'
import { StackedBarWidget } from './StackedBarWidget.tsx'
import { TextWidget } from './TextWidget.tsx'
import { WidgetRenderer } from './WidgetRenderer.tsx'
import type { Dataset, WidgetDetail } from './widgets.types.ts'
const dataset: Dataset = {
  id: 'dataset',
  name: 'Test',
  rowCount: 0,
  columns: [],
  rows: [],
}
const base = { id: 'widget', title: 'Test', dataset }

describe('WidgetRenderer', () => {
  it.each([
    [
      { ...base, type: 'LINE', config: { xKey: 'date', valueKey: 'value' } },
      LineWidget,
    ],
    [
      {
        ...base,
        type: 'BAR',
        config: { categoryKey: 'label', valueKey: 'value' },
      },
      BarWidget,
    ],
    [
      {
        ...base,
        type: 'PIE',
        config: { labelKey: 'label', valueKey: 'value' },
      },
      PieWidget,
    ],
    [
      {
        ...base,
        type: 'STACKED_BAR',
        config: { categoryKey: 'label', seriesKeys: ['value'] },
      },
      StackedBarWidget,
    ],
    [{ id: 'text', title: 'Note', type: 'TEXT', text: null }, TextWidget],
  ] satisfies [WidgetDetail, unknown][])(
    'selects the correct component for %j',
    (widget, component) => {
      expect(WidgetRenderer({ widget }).type).toBe(component)
    },
  )
})
