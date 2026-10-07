import type {
  ChartWidgetType,
  DatasetColumnResponse,
  ValidatedChartConfig,
} from './widgets.types.js';

export function validateChartConfig(
  type: ChartWidgetType,
  input: unknown,
  columns: readonly DatasetColumnResponse[],
): ValidatedChartConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Widget config must be an object');
  }
  const config = input as Record<string, unknown>;
  const fields = new Map(columns.map((column) => [column.key, column]));
  function field(value: unknown, numeric = false): string {
    if (typeof value !== 'string' || !value || value.trim() !== value) {
      throw new Error('Widget field must be a non-empty normalized key');
    }
    const column = fields.get(value);
    if (!column) throw new Error('Widget field does not exist in its dataset');
    if (numeric && column.type !== 'INTEGER' && column.type !== 'NUMBER') {
      throw new Error('Widget value field must be numeric');
    }
    return value;
  }
  switch (type) {
    case 'LINE':
    case 'BAR':
      if (type === 'BAR' && config.categoryKey !== undefined) {
        return {
          type,
          config: {
            categoryKey: field(config.categoryKey),
            valueKey: field(config.valueKey, true),
          },
        };
      }
      return {
        type,
        config: {
          xKey: field(config.xKey),
          valueKey: field(config.valueKey, true),
          ...(config.seriesKey === undefined
            ? {}
            : { seriesKey: field(config.seriesKey) }),
        },
      };
    case 'PIE':
      return {
        type,
        config: {
          labelKey: field(config.labelKey),
          valueKey: field(config.valueKey, true),
        },
      };
    case 'STACKED_BAR': {
      if (!Array.isArray(config.seriesKeys) || !config.seriesKeys.length) {
        throw new Error('Stacked bar requires at least one series');
      }
      const seriesKeys = config.seriesKeys.map((key) => field(key, true));
      if (new Set(seriesKeys).size !== seriesKeys.length)
        throw new Error('Stacked bar series must be unique');
      return {
        type,
        config: { categoryKey: field(config.categoryKey), seriesKeys },
      };
    }
  }
}
