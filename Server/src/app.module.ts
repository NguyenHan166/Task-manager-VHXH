import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { validateEnv } from './config/validate-env';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { RolesGuard } from './common/auth/roles.guard';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { FilesModule } from './modules/files/files.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SettingsModule } from './modules/settings/settings.module';
import { AuditModule } from './modules/audit/audit.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 60 },
      {
        name: 'login',
        ttl: 60_000,
        limit: 5,
        getTracker: (request) => {
          const req = request as unknown as Request;
          const body = req.body;
          const email =
            typeof body === 'object' &&
            body !== null &&
            'email' in body &&
            typeof (body as { email?: unknown }).email === 'string'
              ? (body as { email: string }).email.trim().toLowerCase()
              : '';
          const emailHash = createHash('sha256')
            .update(email)
            .digest('hex')
            .slice(0, 24);
          return `${req.ip ?? 'unknown'}:${emailHash}`;
        },
      },
    ]),
    DatabaseModule,
    HealthModule,
    AuthModule,
    UsersModule,
    TasksModule,
    FilesModule,
    NotificationsModule,
    RemindersModule,
    DashboardModule,
    ReportsModule,
    SettingsModule,
    AuditModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
