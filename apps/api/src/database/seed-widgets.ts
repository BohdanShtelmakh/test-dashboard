import { and, eq } from 'drizzle-orm';
import type { DatabaseService } from './database.service.js';
import { datasetColumns, datasets, widgets } from './schema/index.js';
import type { ImportFileResult } from '../imports/import.types.js';
import { validateChartConfig } from '../widgets/widget-config.js';
import type { ChartConfigMap } from '../widgets/widgets.types.js';

export const INITIAL_WIDGET_IDS = {
  line: 'a2d97c21-981b-4ba1-9b32-000000000001',
  pie: 'a2d97c21-981b-4ba1-9b32-000000000002',
  stackedBar: 'a2d97c21-981b-4ba1-9b32-000000000003',
} as const;

export async function seedInitialWidgets(
  database: DatabaseService,
  csv: ImportFileResult,
  xlsx: ImportFileResult,
): Promise<void> {
  const line = xlsx.datasets.find(
    (dataset) => dataset.sheetName === 'line chart data',
  );
  const pie = xlsx.datasets.find(
    (dataset) => dataset.sheetName === 'pie chart data',
  );
  const stackedBar = csv.datasets.find(
    (dataset) => dataset.name === 'stacked-bar',
  );
  if (!line || !pie || !stackedBar)
    throw new Error('Assignment datasets are missing');
  const initial = [
    {
      id: INITIAL_WIDGET_IDS.line,
      type: 'LINE' as const,
      title: 'Campaign Performance',
      dataset: line,
      sourceFileId: xlsx.sourceFileId,
      config: {
        xKey: 'date',
        valueKey: 'result',
        seriesKey: 'campaign',
      } satisfies ChartConfigMap['LINE'],
    },
    {
      id: INITIAL_WIDGET_IDS.pie,
      type: 'PIE' as const,
      title: 'Campaign Distribution',
      dataset: pie,
      sourceFileId: xlsx.sourceFileId,
      config: {
        labelKey: 'campaign',
        valueKey: 'result',
      } satisfies ChartConfigMap['PIE'],
    },
    {
      id: INITIAL_WIDGET_IDS.stackedBar,
      type: 'STACKED_BAR' as const,
      title: 'Brand Sentiment',
      dataset: stackedBar,
      sourceFileId: csv.sourceFileId,
      config: {
        categoryKey: 'brand',
        seriesKeys: ['positive', 'neutral', 'negative'],
      } satisfies ChartConfigMap['STACKED_BAR'],
    },
  ];
  await database.db.transaction(async (tx) => {
    for (const widget of initial) {
      const [dataset] = await tx
        .select({ schemaId: datasets.schemaId })
        .from(datasets)
        .where(
          and(
            eq(datasets.id, widget.dataset.id),
            eq(datasets.sourceFileId, widget.sourceFileId),
          ),
        );
      if (!dataset)
        throw new Error('Seed dataset does not belong to its imported source');
      const columns = await tx
        .select()
        .from(datasetColumns)
        .where(eq(datasetColumns.schemaId, dataset.schemaId));
      validateChartConfig(widget.type, widget.config, columns);
    }
    await tx
      .insert(widgets)
      .values(
        initial.map(({ dataset, sourceFileId: _source, ...widget }) => ({
          ...widget,
          datasetId: dataset.id,
        })),
      )
      .onConflictDoNothing({ target: widgets.id });
  });
}
