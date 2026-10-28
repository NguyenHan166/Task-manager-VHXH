import { Controller, Get, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/auth/auth.decorators';
import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { DashboardQueryDto } from './dashboard.dto';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@SkipThrottle({ login: true })
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('stats')
  stats(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.dashboard.stats(actor, query);
  }
}
