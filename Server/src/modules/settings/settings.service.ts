import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, type AppSettings } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { UpdateSettingsDto } from './settings.dto';

const invalid = (): BadRequestException =>
  new BadRequestException({
    code: 'VALIDATION',
    message: 'At least one setting field is required',
  });

const settingsView = (settings: AppSettings) => ({
  workspaceName: settings.workspaceName,
  timezone: 'Asia/Ho_Chi_Minh' as const,
  defaultDueHour: settings.defaultDueHour,
  reminderBeforeHours: settings.reminderBeforeHours,
  maxFileSizeMb: settings.maxFileSizeMb,
});

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    const settings = await this.prisma.appSettings.findUnique({
      where: { id: 1 },
    });
    if (!settings)
      throw new Error('The workspace settings singleton is missing');
    return settingsView(settings);
  }

  async update(input: UpdateSettingsDto, actorId: string) {
    if (!Object.keys(input).length) throw invalid();
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "app_settings" WHERE "id" = 1 FOR UPDATE`;
      const before = await tx.appSettings.findUnique({ where: { id: 1 } });
      if (!before)
        throw new Error('The workspace settings singleton is missing');
      const after = await tx.appSettings.update({
        where: { id: 1 },
        data: input,
      });
      const beforeView = settingsView(before);
      const afterView = settingsView(after);
      const changed = Object.keys(input).some(
        (key) =>
          beforeView[key as keyof typeof beforeView] !==
          afterView[key as keyof typeof afterView],
      );
      if (changed) {
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'SETTINGS_UPDATED',
            entity: 'AppSettings',
            before: beforeView satisfies Prisma.InputJsonObject,
            after: afterView satisfies Prisma.InputJsonObject,
          },
        });
      }
      return afterView;
    });
  }
}
