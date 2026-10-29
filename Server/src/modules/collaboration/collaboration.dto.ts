import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { TaskPriority } from '@prisma/client';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class ProjectInputDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(160)
  name!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(4_000)
  description?: string;
  @IsOptional() @IsDateString({ strict: true }) startAt?: string | null;
  @IsOptional() @IsDateString({ strict: true }) endAt?: string | null;
}

export class ProjectPatchDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(160)
  name?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(4_000)
  description?: string;
  @IsOptional() @IsDateString({ strict: true }) startAt?: string | null;
  @IsOptional() @IsDateString({ strict: true }) endAt?: string | null;
  @IsOptional() @IsIn(['ACTIVE', 'ARCHIVED']) status?: 'ACTIVE' | 'ARCHIVED';
}

export class CalendarQueryDto {
  @IsDateString({ strict: true }) from!: string;
  @IsDateString({ strict: true }) to!: string;
  @IsOptional() @IsUUID() projectId?: string;
}

export class RecurrenceRuleInputDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(200)
  title!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(10_000)
  description?: string;
  @IsOptional() @IsIn(['ALL', 'CUSTOM']) scope: 'ALL' | 'CUSTOM' = 'ALL';
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ArrayUnique() @IsUUID(undefined, { each: true })
  assigneeIds?: string[];
  @IsOptional() @IsEnum(TaskPriority) priority: TaskPriority = TaskPriority.NORMAL;
  @IsIn(['WEEKLY', 'MONTHLY']) frequency!: 'WEEKLY' | 'MONTHLY';
  @Type(() => Number) @IsInt() @Min(1) @Max(8760) dueAfterHours!: number;
  @IsDateString({ strict: true }) nextRunAt!: string;
}

export class RecurrenceRulePatchDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(200)
  title?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(10_000)
  description?: string;
  @IsOptional() @IsIn(['ALL', 'CUSTOM']) scope?: 'ALL' | 'CUSTOM';
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ArrayUnique() @IsUUID(undefined, { each: true })
  assigneeIds?: string[];
  @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority;
  @IsOptional() @IsIn(['WEEKLY', 'MONTHLY']) frequency?: 'WEEKLY' | 'MONTHLY';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(8760) dueAfterHours?: number;
  @IsOptional() @IsDateString({ strict: true }) nextRunAt?: string;
}

export class ToggleRecurrenceDto {
  @IsBoolean() active!: boolean;
}

export class ChatRoomInputDto {
  @IsIn(['DIRECT', 'GROUP']) kind!: 'DIRECT' | 'GROUP';
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120)
  title?: string | null;
  @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsUUID(undefined, { each: true })
  memberIds!: string[];
}

export class ChatMessageInputDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(10_000)
  body!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ArrayUnique() @IsUUID(undefined, { each: true })
  fileIds?: string[];
}

export class ChatHistoryQueryDto {
  @Type(() => Number) @IsInt() @Min(1)
  page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize = 50;
  @IsOptional() @IsDateString({ strict: true }) before?: string;
  @IsOptional() @IsDateString({ strict: true }) after?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200)
  search?: string;
}

export class DeadlineRequestInputDto {
  @IsDateString({ strict: true }) proposedDueAt!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(2_000)
  reason!: string;
}

export class AssigneeRequestInputDto {
  @IsUUID() proposedAssigneeId!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(2_000)
  reason!: string;
}

export class RequestDecisionDto {
  @IsIn(['APPROVED', 'REJECTED']) decision!: 'APPROVED' | 'REJECTED';
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2_000)
  reason?: string;
}
