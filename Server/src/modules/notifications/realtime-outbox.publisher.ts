import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RealtimeOutboxType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsGateway } from './notifications.gateway';

type ClaimedOutboxRow = {
  id: string;
  type: RealtimeOutboxType;
  businessEventId: string;
  taskId: string | null;
  recipientId: string | null;
  notificationId: string | null;
  createdAt: Date;
  attempts: number;
};

@Injectable()
export class RealtimeOutboxPublisher {
  private readonly logger = new Logger(RealtimeOutboxPublisher.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
  ) {}

  @Cron('*/5 * * * * *')
  async publishPending(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const claimed = await this.prisma.$transaction(
        (tx) =>
          tx.$queryRaw<ClaimedOutboxRow[]>`
          WITH picked AS (
            SELECT id
            FROM realtime_outbox
            WHERE delivered_at IS NULL AND next_attempt_at <= NOW()
            ORDER BY created_at, id
            FOR UPDATE SKIP LOCKED
            LIMIT 100
          )
          UPDATE realtime_outbox AS queued
          SET attempts = queued.attempts + 1,
              next_attempt_at = NOW() + INTERVAL '30 seconds'
          FROM picked
          WHERE queued.id = picked.id
          RETURNING queued.id,
                    queued.type,
                    queued.business_event_id AS "businessEventId",
                    queued.task_id AS "taskId",
                    queued.recipient_id AS "recipientId",
                    queued.notification_id AS "notificationId",
                    queued.created_at AS "createdAt",
                    queued.attempts
        `,
      );

      for (const item of claimed) {
        try {
          if (
            item.type === RealtimeOutboxType.NOTIFICATION_NEW &&
            item.notificationId &&
            item.recipientId
          ) {
            await this.gateway.publishNotification(
              item.recipientId,
              item.notificationId,
              item.id,
              item.createdAt,
            );
          } else if (
            item.type === RealtimeOutboxType.TASK_UPDATED &&
            item.taskId
          ) {
            await this.gateway.publishTaskUpdated(
              item.taskId,
              item.businessEventId,
              item.createdAt,
            );
          }
          await this.prisma.realtimeOutbox.updateMany({
            where: { id: item.id, deliveredAt: null },
            data: { deliveredAt: new Date(), lastError: null },
          });
        } catch {
          const retryDelayMs = Math.min(15 * 60_000, 1000 * 2 ** item.attempts);
          await this.prisma.realtimeOutbox.updateMany({
            where: { id: item.id, deliveredAt: null },
            data: {
              nextAttemptAt: new Date(Date.now() + retryDelayMs),
              lastError: 'socket_delivery_failed',
            },
          });
          this.logger.warn(`Deferred realtime delivery ${item.id}`);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
