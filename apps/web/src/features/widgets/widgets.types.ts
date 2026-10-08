export type ChartWidgetType = 'LINE' | 'BAR' | 'STACKED_BAR' | 'PIE'
export type WidgetType = ChartWidgetType | 'TEXT'
export type CreateWidgetInput =
  { type: 'TEXT'; text?: string } | { type: ChartWidgetType }

export interface WidgetSummary {
  id: string
  type: WidgetType
  title: string
}
export interface DatasetColumn {
  name: string
  key: string
  type: 'STRING' | 'INTEGER' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'DATETIME'
  nullable: boolean
  position: number
}
export interface Dataset {
  id: string
  name: string
  rowCount: number
  columns: DatasetColumn[]
  rows: Record<string, unknown>[]
}
export interface ChartConfigMap {
  LINE: { xKey: string; valueKey: string; seriesKey?: string }
  BAR:
    | { categoryKey: string; valueKey: string }
    | { xKey: string; valueKey: string; seriesKey?: string }
  STACKED_BAR: { categoryKey: string; seriesKeys: string[] }
  PIE: { labelKey: string; valueKey: string }
}
export type ChartWidget = {
  [Type in ChartWidgetType]: {
    id: string
    title: string
    type: Type
    config: ChartConfigMap[Type]
    dataset: Dataset
  }
}[ChartWidgetType]
export type WidgetDetail =
  ChartWidget | { id: string; title: string; type: 'TEXT'; text: string | null }
