import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/auth/auth.decorators';
import { PrismaService } from '../../database/prisma.service';
import { OperationsMetricsService } from '../observability/operations-metrics.service';
import { BackupService } from './backup.service';

@Controller()
@SkipThrottle({ login: true })
export class OperationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: OperationsMetricsService,
    private readonly backup: BackupService,
  ) {}

  @Roles(UserRole.MANAGER)
  @Get('operations/metrics')
  async metricsSnapshot() {
    const [database] = await this.prisma.$queryRaw<
      Array<{ connections: bigint; maxConnections: number }>
    >`
      SELECT
        (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) AS "connections",
        current_setting('max_connections')::int AS "maxConnections"
    `;
    return {
      ...this.metrics.snapshot(),
      databaseConnections: Number(database?.connections ?? 0),
      databaseConnectionLimit: database?.maxConnections ?? 0,
      backup: await this.backup.getStatus(),
    };
  }

  @Roles(UserRole.MANAGER)
  @Get('backup')
  backupStatus() {
    return this.backup.getStatus();
  }
}
