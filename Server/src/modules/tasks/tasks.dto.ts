import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { TaskPriority, TaskStatus, TaskType } from '@prisma/client';

const optional = (_input: unknown, value: unknown): boolean =>
  value !== undefined;
const optionalNonNull = (_input: unknown, value: unknown): boolean =>
  value !== undefined && value !== null;
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const utcTime = /Z$/;
const taskTypes = ['ALL', ...Object.values(TaskType)];
const taskStatuses = ['ALL', ...Object.values(TaskStatus)];
const taskPriorities = ['ALL', ...Object.values(TaskPriority)];

export enum TaskScope {
  ALL = 'ALL',
  OWNED = 'OWNED',
  COLLABORATING = 'COLLABORATING',
  WATCHING = 'WATCHING',
}

export enum TaskSortBy {
  DUE_AT = 'DUE_AT',
  UPDATED_AT = 'UPDATED_AT',
  PRIORITY = 'PRIORITY',
  CREATED_AT = 'CREATED_AT',
}

export enum SortDirection {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class TaskPageQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 10;
}

export class TaskListQueryDto extends TaskPageQueryDto {
  @ValidateIf(optional)
  @IsEnum(TaskScope)
  scope?: TaskScope;

  @ValidateIf(optional)
  @IsIn(taskTypes)
  type?: TaskType | 'ALL';

  @ValidateIf(optional)
  @IsIn(taskStatuses)
  status?: TaskStatus | 'ALL';

  @ValidateIf(optional)
  @IsIn(taskPriorities)
  priority?: TaskPriority | 'ALL';

  @ValidateIf(optional)
  @IsUUID()
  projectId?: string;

  @ValidateIf(optional)
  @IsUUID()
  primaryAssigneeId?: string;

  @ValidateIf(optional)
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  search?: string;

  @ValidateIf(optional)
  @IsDateString({ strict: true })
  @Matches(utcTime)
  dueFrom?: string;

  @ValidateIf(optional)
  @IsDateString({ strict: true })
  @Matches(utcTime)
  dueTo?: string;

  @ValidateIf(optional)
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  isOverdue?: boolean;

  @IsEnum(TaskSortBy)
  sortBy = TaskSortBy.UPDATED_AT;

  @IsEnum(SortDirection)
  sortDirection = SortDirection.DESC;
}

export class CreateTaskDto {
  @IsEnum(TaskType)
  type!: TaskType;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ValidateIf(optional)
  @IsString()
  @MaxLength(10_000)
  description?: string;

  @ValidateIf(optional)
  @IsString()
  @MaxLength(2_000)
  deliverable?: string;

  @ValidateIf(optional)
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ValidateIf(optional)
  @IsUUID()
  primaryAssigneeId?: string | null;

  @ValidateIf(optional)
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  collaboratorIds?: string[];

  @ValidateIf(optional)
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  watcherIds?: string[];

  @ValidateIf((_input, value: unknown) => value !== undefined && value !== null)
  @IsDateString({ strict: true })
  @Matches(utcTime)
  dueAt?: string | null;

  @ValidateIf(optional)
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate?: string;

  @ValidateIf((_input, value: unknown) => value !== undefined && value !== null)
  @IsUUID()
  projectId?: string | null;

  @ValidateIf((_input, value: unknown) => value !== undefined && value !== null)
  @IsUUID()
  parentTaskId?: string | null;
}

export class UpdateTaskDto {
  @ValidateIf(optional)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ValidateIf(optional)
  @IsString()
  @MaxLength(10_000)
  description?: string;

  @ValidateIf(optional)
  @IsString()
  @MaxLength(2_000)
  deliverable?: string;

  @ValidateIf(optional)
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ValidateIf((_input, value: unknown) => value !== undefined && value !== null)
  @IsUUID()
  projectId?: string | null;
}

export class CommentDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(4_000)
  body!: string;
}

export class TaskProgressDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent!: number;

  @IsBoolean()
  isBlocked!: boolean;

  @ValidateIf(optionalNonNull)
  @Transform(trim)
  @IsString()
  blockedReason?: string | null;
}

export class AdjustTaskDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  reason!: string;

  @ValidateIf(optional)
  @IsDateString({ strict: true })
  @Matches(utcTime)
  dueAt?: string;

  @ValidateIf(optional)
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate?: string;

  @ValidateIf(optional)
  @IsUUID()
  primaryAssigneeId?: string;

  @ValidateIf(optional)
  @IsEnum(TaskPriority)
  priority?: TaskPriority;
}

export class TaskReasonDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(1_000)
  reason!: string;
}

export class SubmitTaskDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  summary!: string;

  @ValidateIf(optionalNonNull)
  @IsString()
  details?: string | null;

  @ValidateIf(optionalNonNull)
  @IsString()
  deliverableUrl?: string | null;

  @ValidateIf(optionalNonNull)
  @IsString()
  notes?: string | null;

  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  fileIds!: string[];
}

export class WithdrawSubmissionDto {
  @ValidateIf(optional)
  @Transform(trim)
  @IsString()
  reason?: string;
}

export class DecideApprovalDto {
  @IsUUID()
  submissionId!: string;

  @ValidateIf(optional)
  @Transform(trim)
  @IsString()
  reason?: string;
}

export class ReturnSubmissionDto {
  @IsUUID()
  submissionId!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  reason!: string;
}
