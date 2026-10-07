export type ChartWidgetType = 'LINE' | 'BAR' | 'STACKED_BAR' | 'PIE';
export type WidgetType = ChartWidgetType | 'TEXT';

export interface WidgetSummary {
  id: string;
  type: WidgetType;
  title: string;
}

export interface DatasetColumnResponse {
  name: string;
  key: string;
  type: 'STRING' | 'INTEGER' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'DATETIME';
  nullable: boolean;
  position: number;
}

export interface DatasetResponse {
  id: string;
  name: string;
  rowCount: number;
  columns: DatasetColumnResponse[];
  rows: Record<string, unknown>[];
}

export interface ChartConfigMap {
  LINE: { xKey: string; valueKey: string; seriesKey?: string };
  BAR:
    | { categoryKey: string; valueKey: string }
    | { xKey: string; valueKey: string; seriesKey?: string };
  PIE: { labelKey: string; valueKey: string };
  STACKED_BAR: { categoryKey: string; seriesKeys: string[] };
}

export type ValidatedChartConfig = {
  [Type in ChartWidgetType]: { type: Type; config: ChartConfigMap[Type] };
}[ChartWidgetType];

export type WidgetDetail =
  | (WidgetSummary & ValidatedChartConfig & { dataset: DatasetResponse })
  | (WidgetSummary & { type: 'TEXT'; text: string | null });
