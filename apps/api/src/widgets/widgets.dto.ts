import { IsIn, IsString, ValidateIf } from 'class-validator';
import type { WidgetType } from './widgets.types.js';

export class CreateWidgetDto {
  @IsIn(['LINE', 'BAR', 'STACKED_BAR', 'PIE', 'TEXT'])
  type!: WidgetType;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  text?: string;
}

export class UpdateTextWidgetDto {
  @IsString()
  text!: string;
}
