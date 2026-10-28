import { Controller, Get, HttpStatus, Query, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser, Roles } from '../../common/auth/auth.decorators';
import type { AuthenticatedUser } from '../../common/auth/auth.types';
import {
  ReportExportQueryDto,
  ReportTasksQueryDto,
} from '../dashboard/dashboard.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
@SkipThrottle({ login: true })
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('kpi')
  kpi(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ReportTasksQueryDto,
  ) {
    return this.reports.kpi(actor, query);
  }

  @Get('tasks')
  tasks(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ReportTasksQueryDto,
  ) {
    return this.reports.tasks(actor, query);
  }

  @Roles(UserRole.MANAGER, UserRole.DEPUTY_MANAGER)
  @Get('tasks/export')
  async exportTasks(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ReportExportQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.reports.exportTasks(actor, query);
    response
      .status(HttpStatus.OK)
      .setHeader('Content-Type', result.contentType)
      .setHeader(
        'Content-Disposition',
        `attachment; filename="${result.filename}"`,
      )
      .setHeader('Content-Length', result.body.byteLength)
      .send(result.body);
  }
}
