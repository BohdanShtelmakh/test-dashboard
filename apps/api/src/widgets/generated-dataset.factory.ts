import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import type { InferredColumn } from '../imports/import.types.js';
import type { ChartWidgetType, ValidatedChartConfig } from './widgets.types.js';

export interface GeneratedDatasetDefinition {
  name: string;
  columns: InferredColumn[];
  rows: Record<string, unknown>[];
  chart: ValidatedChartConfig;
}

@Injectable()
export class GeneratedDatasetFactory {
  create(type: ChartWidgetType): GeneratedDatasetDefinition {
    const column = (
      name: string,
      key: string,
      type: InferredColumn['type'],
      position: number,
    ): InferredColumn => ({ name, key, type, position, nullable: false });
    const value = () => randomInt(10, 101);
    switch (type) {
      case 'LINE': {
        const start = new Date();
        start.setUTCHours(0, 0, 0, 0);
        const rows: Record<string, unknown>[] = [];
        for (let day = 0; day < 10; day++) {
          const date = new Date(start);
          date.setUTCDate(start.getUTCDate() - 9 + day);
          for (const series of ['Series A', 'Series B', 'Series C'])
            rows.push({
              date: date.toISOString().slice(0, 10),
              series,
              value: value(),
            });
        }
        return {
          name: 'Line chart',
          columns: [
            column('Date', 'date', 'DATE', 0),
            column('Series', 'series', 'STRING', 1),
            column('Value', 'value', 'INTEGER', 2),
          ],
          rows,
          chart: {
            type,
            config: { xKey: 'date', valueKey: 'value', seriesKey: 'series' },
          },
        };
      }
      case 'BAR':
        return {
          name: 'Bar chart',
          columns: [
            column('Category', 'category', 'STRING', 0),
            column('Value', 'value', 'INTEGER', 1),
          ],
          rows: Array.from({ length: 6 }, (_, i) => ({
            category: `Category ${i + 1}`,
            value: value(),
          })),
          chart: {
            type,
            config: { categoryKey: 'category', valueKey: 'value' },
          },
        };
      case 'STACKED_BAR':
        return {
          name: 'Stacked bar chart',
          columns: [
            column('Category', 'category', 'STRING', 0),
            ...['a', 'b', 'c'].map((key, i) =>
              column(
                `Series ${key.toUpperCase()}`,
                `series_${key}`,
                'INTEGER',
                i + 1,
              ),
            ),
          ],
          rows: Array.from({ length: 5 }, (_, i) => ({
            category: `Category ${i + 1}`,
            series_a: value(),
            series_b: value(),
            series_c: value(),
          })),
          chart: {
            type,
            config: {
              categoryKey: 'category',
              seriesKeys: ['series_a', 'series_b', 'series_c'],
            },
          },
        };
      case 'PIE':
        return {
          name: 'Pie chart',
          columns: [
            column('Label', 'label', 'STRING', 0),
            column('Value', 'value', 'INTEGER', 1),
          ],
          rows: Array.from({ length: 5 }, (_, i) => ({
            label: `Slice ${i + 1}`,
            value: value(),
          })),
          chart: { type, config: { labelKey: 'label', valueKey: 'value' } },
        };
    }
  }
}
