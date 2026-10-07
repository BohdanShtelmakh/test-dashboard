import { IsIn, IsString } from 'class-validator';
import type { WidgetType } from './widgets.types.js';

export class CreateWidgetDto {
  @IsIn(['LINE', 'BAR', 'STACKED_BAR', 'PIE', 'TEXT'])
  type!: WidgetType;
}

export class UpdateTextWidgetDto {
  @IsString()
  text!: string;
}
