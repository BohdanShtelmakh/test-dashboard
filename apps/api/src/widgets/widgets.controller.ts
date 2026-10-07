import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  ValidationPipe,
} from '@nestjs/common';
import { CreateWidgetDto, UpdateTextWidgetDto } from './widgets.dto.js';
import { WidgetsService } from './widgets.service.js';
import type { WidgetDetail, WidgetSummary } from './widgets.types.js';

@Controller('widgets')
export class WidgetsController {
  constructor(
    @Inject(WidgetsService) private readonly widgets: WidgetsService,
  ) {}

  @Get()
  findAll(): Promise<WidgetSummary[]> {
    return this.widgets.findAll();
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<WidgetDetail> {
    return this.widgets.findOne(id);
  }

  @Post()
  create(
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        expectedType: CreateWidgetDto,
      }),
    )
    body: CreateWidgetDto,
  ): Promise<WidgetSummary> {
    return this.widgets.create(body.type);
  }

  @Patch(':id')
  updateText(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        expectedType: UpdateTextWidgetDto,
      }),
    )
    body: UpdateTextWidgetDto,
  ): Promise<WidgetDetail> {
    return this.widgets.updateText(id, body.text);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.widgets.delete(id);
  }
}
