import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotificationType,
  RealtimeOutboxType,
  TaskStatus,
  TaskType,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { SchedulerRegistry } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { OperationsMetricsService } from '../observability/operations-metrics.service';

const BUSINESS_TIMEZONE = 'Asia/Ho_Chi_Minh';
const ACTIVE_STATUSES = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.IN_REVIEW,
];
const LEADER_ROLES = [UserRole.MANAGER, UserRole.DEPUTY_MANAGER];
const REMINDER_INTERVAL_NAME = 'phase06-reminders';
const LEADER_DIGEST_NAMESPACE = '84fc699d-43bb-5d6c-9ce0-349fcb2e9c16';
const REMINDER_WORKDAY_START_HOUR = 9;
const REMINDER_WORKDAY_END_HOUR = 18;

type BusinessClock = {
  dateKey: string;
  hour: number;
};

const businessClock = (date: Date): BusinessClock => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: string): string =>
    parts.find((item) => item.type === type)?.value ?? '';
  return {
    dateKey: `${part('year')}-${part('month')}-${part('day')}`,
    hour: Number(part('hour')),
  };
};

const deterministicUuid = (name: string): string => {
  const namespace = LEADER_DIGEST_NAMESPACE.replaceAll('-', '');
  const namespaceBytes = Buffer.from(namespace, 'hex');
  const digest = createHash('sha1')
    .update(namespaceBytes)
    .update(name)
    .digest();
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

@Injectable()
export class RemindersService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(RemindersService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly scheduler: SchedulerRegistry,
    private readonly metrics: OperationsMetricsService,
  ) {}

  onApplicationBootstrap(): void {
    const intervalMinutes = Number(
      this.config.get<string>('REMINDER_INTERVAL_MINUTES', '15'),
    );
    const timer = setInterval(() => {
      void this.runSafely();
    }, intervalMinutes * 60_000);
    timer.unref();
    this.scheduler.addInterval(REMINDER_INTERVAL_NAME, timer);
    void this.runSafely();
  }

  onModuleDestroy(): void {
    if (this.scheduler.doesExist('interval', REMINDER_INTERVAL_NAME)) {
      this.scheduler.deleteInterval(REMINDER_INTERVAL_NAME);
    }
  }

  async runDueReminders(
    now = new Date(),
    taskIds?: string[],
  ): Promise<{
    dueSoon: number;
    due: number;
    overdue: number;
    leaderDigests: number;
  }> {
    const clock = businessClock(now);
    const tasks = await this.prisma.task.findMany({
      where: {
        status: { in: ACTIVE_STATUSES },
        dueAt: { not: null },
        archivedAt: null,
        ...(taskIds?.length ? { id: { in: taskIds } } : {}),
      },
      select: {
        id: true,
        code: true,
        title: true,
        type: true,
        status: true,
        dueAt: true,
        primaryAssigneeId: true,
      },
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
      take: 1000,
    });
    const assigneeIds = tasks
      .map((task) => task.primaryAssigneeId)
      .filter((id): id is string => Boolean(id));
    const activeAssignees = new Set(
      (
        await this.prisma.user.findMany({
          where: {
            id: { in: [...new Set(assigneeIds)] },
            status: UserStatus.ACTIVE,
          },
          select: { id: true, role: true },
        })
      ).map((user) => user.id),
    );
    const activeLeaders = await this.prisma.user.findMany({
      where: { status: UserStatus.ACTIVE, role: { in: LEADER_ROLES } },
      select: { id: true },
    });

    let dueSoon = 0;
    let due = 0;
    let overdue = 0;
    const overdueOfficial: typeof tasks = [];
    const settings = await this.prisma.appSettings.findUnique({
      where: { id: 1 },
      select: { reminderBeforeHours: true },
    });
    const beforeHours =
      settings?.reminderBeforeHours ??
      Number(this.config.get<string>('REMINDER_BEFORE_HOURS', '24'));
    const soonBoundary = new Date(now.getTime() + beforeHours * 60 * 60_000);
    const isReminderWorkHours =
      clock.hour >= REMINDER_WORKDAY_START_HOUR &&
      clock.hour < REMINDER_WORKDAY_END_HOUR;

    for (const task of tasks) {
      if (!task.dueAt) continue;
      const dueAt = task.dueAt;
      const dueDay = businessClock(dueAt).dateKey;
      const dueKey = dueAt.toISOString();
      const isActiveAssignee =
        task.primaryAssigneeId && activeAssignees.has(task.primaryAssigneeId);
      if (
        isActiveAssignee &&
        dueAt > now &&
        dueAt <= soonBoundary &&
        (await this.createReminder(
          task,
          task.primaryAssigneeId!,
          'DUE_SOON',
          dueKey,
          NotificationType.TASK_DUE_SOON,
          'Sắp đến hạn',
          `[${task.code}] ${task.title} sẽ đến hạn trong ${beforeHours} giờ tới.`,
          now,
        ))
      ) {
        dueSoon += 1;
      }
      if (
        isActiveAssignee &&
        dueAt <= now &&
        dueDay === clock.dateKey &&
        (await this.createReminder(
          task,
          task.primaryAssigneeId!,
          'DUE',
          dueKey,
          NotificationType.TASK_DUE,
          'Đã đến hạn',
          `[${task.code}] ${task.title} đã đến hạn hôm nay.`,
          now,
        ))
      ) {
        due += 1;
      }
      if (dueDay < clock.dateKey && isReminderWorkHours) {
        if (task.type === TaskType.OFFICIAL) overdueOfficial.push(task);
        if (
          isActiveAssignee &&
          !activeLeaders.some(
            (leader) => leader.id === task.primaryAssigneeId,
          ) &&
          (await this.createReminder(
            task,
            task.primaryAssigneeId!,
            'OVERDUE',
            clock.dateKey,
            NotificationType.TASK_OVERDUE,
            'Công việc đã quá hạn',
            `[${task.code}] ${task.title} đang quá hạn.`,
            now,
          ))
        ) {
          overdue += 1;
        }
      }
    }

    let leaderDigests = 0;
    if (overdueOfficial.length) {
      for (const leader of activeLeaders) {
        if (
          await this.createLeaderDigest(
            leader.id,
            overdueOfficial,
            clock.dateKey,
            now,
          )
        ) {
          leaderDigests += 1;
        }
      }
    }

    return { dueSoon, due, overdue, leaderDigests };
  }

  private async createReminder(
    task: { id: string; code: string; title: string },
    recipientId: string,
    reminderType: string,
    milestoneKey: string,
    type: NotificationType,
    title: string,
    body: string,
    now: Date,
  ): Promise<boolean> {
    const created = await this.prisma.$transaction(async (tx) => {
      const inserted = await tx.reminderEvent.createMany({
        data: [
          {
            taskId: task.id,
            recipientId,
            reminderType,
            milestoneKey,
            createdAt: now,
          },
        ],
        skipDuplicates: true,
      });
      if (!inserted.count) return false;
      const event = await tx.reminderEvent.findUniqueOrThrow({
        where: {
          taskId_recipientId_reminderType_milestoneKey: {
            taskId: task.id,
            recipientId,
            reminderType,
            milestoneKey,
          },
        },
        select: { id: true },
      });
      const notification = await tx.notification.create({
        data: {
          recipientId,
          taskId: task.id,
          type,
          title,
          body,
          businessEventId: event.id,
          createdAt: now,
        },
        select: { id: true },
      });
      await tx.realtimeOutbox.create({
        data: {
          type: RealtimeOutboxType.NOTIFICATION_NEW,
          idempotencyKey: `notification:${notification.id}`,
          businessEventId: event.id,
          taskId: task.id,
          recipientId,
          notificationId: notification.id,
          createdAt: now,
        },
      });
      return true;
    });
    if (created) this.metrics.increment('cron_reminder_notifications_created');
    else this.metrics.increment('cron_reminder_duplicates');
    return created;
  }

  private async createLeaderDigest(
    recipientId: string,
    overdueTasks: Array<{ id: string; code: string; title: string }>,
    dayKey: string,
    now: Date,
  ): Promise<boolean> {
    const created = await this.prisma.$transaction(async (tx) => {
      const reminders = await tx.reminderEvent.createMany({
        data: overdueTasks.map((task) => ({
          taskId: task.id,
          recipientId,
          reminderType: 'OVERDUE',
          milestoneKey: dayKey,
          createdAt: now,
        })),
        skipDuplicates: true,
      });
      if (!reminders.count) return false;
      const eventId = deterministicUuid(
        `leader-overdue:${recipientId}:${dayKey}`,
      );
      const digest = await tx.notification.createMany({
        data: [
          {
            recipientId,
            taskId: null,
            type: NotificationType.TASK_OVERDUE,
            title: 'Tổng hợp công việc quá hạn',
            body: `Hiện có ${overdueTasks.length} công việc chính thức quá hạn cần theo dõi.`,
            businessEventId: eventId,
            createdAt: now,
          },
        ],
        skipDuplicates: true,
      });
      const notification = await tx.notification.findUnique({
        where: {
          businessEventId_recipientId: {
            businessEventId: eventId,
            recipientId,
          },
        },
        select: { id: true },
      });
      if (!notification) return false;
      await tx.realtimeOutbox.createMany({
        data: [
          {
            type: RealtimeOutboxType.NOTIFICATION_NEW,
            idempotencyKey: `notification:${notification.id}`,
            businessEventId: eventId,
            recipientId,
            notificationId: notification.id,
            createdAt: now,
          },
        ],
        skipDuplicates: true,
      });
      return digest.count === 1;
    });
    if (created) this.metrics.increment('cron_leader_digests_created');
    else this.metrics.increment('cron_reminder_duplicates');
    return created;
  }

  private async runSafely(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.metrics.increment('cron_runs_started');
    try {
      const counts = await this.runDueReminders();
      this.metrics.increment('cron_runs_succeeded');
      this.logger.log(
        JSON.stringify({ event: 'reminder_scan_succeeded', ...counts }),
      );
    } catch {
      this.metrics.increment('cron_runs_failed');
      this.logger.error(
        JSON.stringify({
          event: 'reminder_scan_failed',
          reason: 'REMINDER_SCAN_FAILED',
        }),
      );
    } finally {
      this.running = false;
    }
  }
}
