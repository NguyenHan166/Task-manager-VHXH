import { Controller, Get, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { CurrentUser, Roles } from '../../common/auth/auth.decorators';
import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { AuditQueryDto } from '../dashboard/dashboard.dto';
import { AuditService } from './audit.service';

@Controller('audit-logs')
@SkipThrottle({ login: true })
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Roles(UserRole.MANAGER)
  @Get()
  list(@CurrentUser() actor: AuthenticatedUser, @Query() query: AuditQueryDto) {
    return this.audit.list(actor, query);
  }
}
