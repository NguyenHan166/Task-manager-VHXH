import { Transform, Type } from 'class-transformer';
import {
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
  ValidateIf,
} from 'class-validator';
import { TaskPriority, TaskStatus, TaskType } from '@prisma/client';

const optional = (_input: unknown, value: unknown): boolean =>
  value !== undefined;
const utcTime = /Z$/;

export class CommonReportFiltersDto {
  @ValidateIf(optional)
  @IsDateString({ strict: true })
  @Matches(utcTime)
  fromDate?: string;

  @ValidateIf(optional)
  @IsDateString({ strict: true })
  @Matches(utcTime)
  toDate?: string;

  @ValidateIf(optional)
  @IsDateString({ strict: true })
  @Matches(utcTime)
  dueFrom?: string;

  @ValidateIf(optional)
  @IsDateString({ strict: true })
  @Matches(utcTime)
  dueTo?: string;

  @ValidateIf(optional)
  @IsUUID()
  projectId?: string;

  @ValidateIf(optional)
  @IsUUID()
  primaryAssigneeId?: string;

  @ValidateIf(optional)
  @IsIn([...Object.values(TaskType), 'ALL'])
  type?: TaskType | 'ALL';
}

export class ReportFiltersDto extends CommonReportFiltersDto {
  @ValidateIf(optional)
  @IsIn([...Object.values(TaskPriority), 'ALL'])
  priority?: TaskPriority | 'ALL';

  @ValidateIf(optional)
  @IsIn([...Object.values(TaskStatus), 'ALL'])
  status?: TaskStatus | 'ALL';
}

export class DashboardQueryDto extends CommonReportFiltersDto {
  @IsIn(['DEPT', 'STAFF'])
  scope!: 'DEPT' | 'STAFF';

  @ValidateIf(optional)
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ValidateIf(optional)
  @IsEnum(TaskStatus)
  status?: TaskStatus;
}

export class ReportTasksQueryDto extends ReportFiltersDto {
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
  @IsIn(['ALL', 'OWNED', 'COLLABORATING', 'WATCHING'])
  scope?: 'ALL' | 'OWNED' | 'COLLABORATING' | 'WATCHING';

  @ValidateIf(optional)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(200)
  search?: string;

  @ValidateIf(optional)
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsIn([true, false])
  isOverdue?: boolean;

  @ValidateIf(optional)
  @IsIn(['DUE_AT', 'UPDATED_AT', 'PRIORITY', 'CREATED_AT'])
  sortBy?: 'DUE_AT' | 'UPDATED_AT' | 'PRIORITY' | 'CREATED_AT';

  @ValidateIf(optional)
  @IsIn(['ASC', 'DESC'])
  sortDirection?: 'ASC' | 'DESC';
}

export class ReportExportQueryDto extends ReportTasksQueryDto {
  @IsIn(['CSV', 'XLSX'])
  format!: 'CSV' | 'XLSX';
}

export class AuditQueryDto {
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
  @IsDateString({ strict: true })
  @Matches(utcTime)
  fromDate?: string;

  @ValidateIf(optional)
  @IsDateString({ strict: true })
  @Matches(utcTime)
  toDate?: string;

  @ValidateIf(optional)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  kind?: string;

  @ValidateIf(optional)
  @IsUUID()
  actorId?: string;

  @ValidateIf(optional)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  entityType?: string;

  @ValidateIf(optional)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  entityId?: string;
}
