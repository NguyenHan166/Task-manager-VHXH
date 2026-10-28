import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const optional = (_input: unknown, value: unknown): boolean =>
  value !== undefined;

export class UpdateSettingsDto {
  @ValidateIf(optional)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  workspaceName?: string;

  @ValidateIf(optional)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  defaultDueHour?: number;

  @ValidateIf(optional)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(720)
  reminderBeforeHours?: number;

  @ValidateIf(optional)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1024)
  maxFileSizeMb?: number;
}
