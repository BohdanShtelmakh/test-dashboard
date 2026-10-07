import {
  HttpException,
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, notExists } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import {
  datasetColumns,
  datasetRows,
  datasets,
  widgets,
} from '../database/schema/index.js';
import { validateChartConfig } from './widget-config.js';
import type { WidgetDetail, WidgetSummary } from './widgets.types.js';
import type { WidgetType } from './widgets.types.js';
import { GeneratedDatasetFactory } from './generated-dataset.factory.js';
import { SchemaRegistry } from '../imports/schema-registry.js';

@Injectable()
export class WidgetsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(GeneratedDatasetFactory)
    private readonly generated: GeneratedDatasetFactory,
    @Inject(SchemaRegistry) private readonly schemas: SchemaRegistry,
  ) {}

  async create(type: WidgetType): Promise<WidgetSummary> {
    try {
      return await this.database.db.transaction(async (tx) => {
        if (type === 'TEXT') {
          const [widget] = await tx
            .insert(widgets)
            .values({ type, title: 'Text', text: '', config: {} })
            .returning({
              id: widgets.id,
              type: widgets.type,
              title: widgets.title,
            });
          return widget;
        }
        const definition = this.generated.create(type);
        const schemaId = await this.schemas.resolve(tx, definition.columns);
        const [dataset] = await tx
          .insert(datasets)
          .values({
            origin: 'GENERATED',
            sourceFileId: null,
            schemaId,
            name: definition.name,
            rowCount: definition.rows.length,
          })
          .returning({ id: datasets.id });
        await tx
          .insert(datasetRows)
          .values(
            definition.rows.map((values, rowIndex) => ({
              datasetId: dataset.id,
              rowIndex,
              values,
            })),
          );
        const [widget] = await tx
          .insert(widgets)
          .values({
            type,
            title: definition.name,
            datasetId: dataset.id,
            config: definition.chart.config,
          })
          .returning({
            id: widgets.id,
            type: widgets.type,
            title: widgets.title,
          });
        return widget;
      });
    } catch {
      throw new InternalServerErrorException('Unable to create widget');
    }
  }

  async updateText(
    id: string,
    text: string,
  ): Promise<Extract<WidgetDetail, { type: 'TEXT' }>> {
    try {
      return await this.database.db.transaction(async (tx) => {
        const [widget] = await tx
          .select()
          .from(widgets)
          .where(eq(widgets.id, id))
          .for('update');
        if (!widget) throw new NotFoundException('Widget not found');
        if (widget.type !== 'TEXT')
          throw new BadRequestException('Only TEXT widgets can be edited');
        await tx
          .update(widgets)
          .set({ text, updatedAt: new Date() })
          .where(eq(widgets.id, id));
        return { id, type: 'TEXT', title: widget.title, text };
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Unable to update widget');
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.database.db.transaction(async (tx) => {
        const [widget] = await tx
          .select()
          .from(widgets)
          .where(eq(widgets.id, id))
          .for('update');
        if (!widget) throw new NotFoundException('Widget not found');
        // Serialize cleanup when multiple widgets share a generated dataset.
        // NO KEY UPDATE remains compatible with FK readers (KEY SHARE).
        if (widget.datasetId)
          await tx
            .select({ id: datasets.id })
            .from(datasets)
            .where(eq(datasets.id, widget.datasetId))
            .for('no key update');
        await tx.delete(widgets).where(eq(widgets.id, id));
        if (widget.datasetId) {
          await tx
            .delete(datasets)
            .where(
              and(
                eq(datasets.id, widget.datasetId),
                eq(datasets.origin, 'GENERATED'),
                notExists(
                  tx
                    .select({ id: widgets.id })
                    .from(widgets)
                    .where(eq(widgets.datasetId, widget.datasetId)),
                ),
              ),
            );
        }
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Unable to delete widget');
    }
  }

  async findAll(): Promise<WidgetSummary[]> {
    try {
      return await this.database.db
        .select({ id: widgets.id, type: widgets.type, title: widgets.title })
        .from(widgets)
        .orderBy(asc(widgets.createdAt), asc(widgets.id));
    } catch {
      throw new InternalServerErrorException('Unable to load widgets');
    }
  }

  async findOne(id: string): Promise<WidgetDetail> {
    try {
      const [record] = await this.database.db
        .select({
          widget: {
            id: widgets.id,
            type: widgets.type,
            title: widgets.title,
            config: widgets.config,
            text: widgets.text,
          },
          dataset: {
            id: datasets.id,
            schemaId: datasets.schemaId,
            name: datasets.name,
            rowCount: datasets.rowCount,
          },
        })
        .from(widgets)
        .leftJoin(datasets, eq(widgets.datasetId, datasets.id))
        .where(eq(widgets.id, id));
      if (!record) throw new NotFoundException('Widget not found');
      const { widget, dataset } = record;
      const base = { id: widget.id, title: widget.title };
      if (widget.type === 'TEXT')
        return { ...base, type: 'TEXT', text: widget.text };
      if (!dataset)
        throw new InternalServerErrorException('Widget dataset is unavailable');
      const columns = await this.database.db
        .select({
          name: datasetColumns.name,
          key: datasetColumns.key,
          type: datasetColumns.type,
          nullable: datasetColumns.nullable,
          position: datasetColumns.position,
        })
        .from(datasetColumns)
        .where(eq(datasetColumns.schemaId, dataset.schemaId))
        .orderBy(asc(datasetColumns.position));
      let chart;
      try {
        chart = validateChartConfig(widget.type, widget.config, columns);
      } catch {
        throw new InternalServerErrorException('Invalid widget configuration');
      }
      const rows = await this.database.db
        .select({ values: datasetRows.values })
        .from(datasetRows)
        .where(eq(datasetRows.datasetId, dataset.id))
        .orderBy(asc(datasetRows.rowIndex));
      return {
        ...base,
        ...chart,
        dataset: {
          id: dataset.id,
          name: dataset.name,
          rowCount: dataset.rowCount,
          columns,
          rows: rows.map((row) => row.values),
        },
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Unable to load widget');
    }
  }
}
