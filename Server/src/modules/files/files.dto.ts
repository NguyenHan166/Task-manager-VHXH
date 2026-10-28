import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const optional = (_input: unknown, value: unknown): boolean =>
  value !== undefined;
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export enum FileEntityType {
  TASK = 'TASK',
  SUBMISSION = 'SUBMISSION',
  COMMENT = 'COMMENT',
  MESSAGE = 'MESSAGE',
}

export class UploadUrlDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  originalName!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  mimeType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @IsEnum(FileEntityType)
  entityType!: FileEntityType;

  @IsUUID()
  entityId!: string;
}

export class CompleteFileDto {
  @IsUUID()
  fileId!: string;
}

export class FilesQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 10;

  @ValidateIf(optional)
  @IsEnum(FileEntityType)
  entityType?: FileEntityType;

  @ValidateIf(optional)
  @IsUUID()
  entityId?: string;

  @ValidateIf(optional)
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  search?: string;
}
