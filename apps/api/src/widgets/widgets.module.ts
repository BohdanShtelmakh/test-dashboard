import { Module } from '@nestjs/common';
import { WidgetsController } from './widgets.controller.js';
import { WidgetsService } from './widgets.service.js';
import { GeneratedDatasetFactory } from './generated-dataset.factory.js';
import { DatabaseModule } from '../database/database.module.js';

@Module({
  imports: [DatabaseModule],
  controllers: [WidgetsController],
  providers: [WidgetsService, GeneratedDatasetFactory],
})
export class WidgetsModule {}
