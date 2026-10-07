import { Module } from '@nestjs/common';
import { WidgetsController } from './widgets.controller.js';
import { WidgetsService } from './widgets.service.js';
import { GeneratedDatasetFactory } from './generated-dataset.factory.js';
import { ImportsModule } from '../imports/imports.module.js';

@Module({
  imports: [ImportsModule],
  controllers: [WidgetsController],
  providers: [WidgetsService, GeneratedDatasetFactory],
})
export class WidgetsModule {}
