import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Notification, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { TaskAccessPolicy } from '../../common/auth/task-access.policy';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsQueryDto } from './notifications.dto';

type NotificationCursor = { createdAt: Date; id: string };

const invalidCursor = (): BadRequestException =>
  new BadRequestException({
    code: 'VALIDATION',
    message: 'Notification cursor is invalid',
  });

const notFound = (): NotFoundException =>
  new NotFoundException({
    code: 'NOT_FOUND',
    message: 'Notification not found',
  });

const encodeCursor = (item: Pick<Notification, 'createdAt' | 'id'>): string =>
  Buffer.from(
    JSON.stringify({ createdAt: item.createdAt.toISOString(), id: item.id }),
  ).toString('base64url');

const decodeCursor = (value?: string): NotificationCursor | undefined => {
  if (!value) return undefined;
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    );
    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      !('createdAt' in decoded) ||
      !('id' in decoded) ||
      typeof decoded.createdAt !== 'string' ||
      typeof decoded.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        decoded.id,
      )
    ) {
      throw invalidCursor();
    }
    const createdAt = new Date(decoded.createdAt);
    if (!Number.isFinite(createdAt.getTime())) throw invalidCursor();
    return { createdAt, id: decoded.id };
  } catch {
    throw invalidCursor();
  }
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TaskAccessPolicy,
  ) {}

  async list(actor: AuthenticatedUser, query: NotificationsQueryDto) {
    if (query.after && query.before) {
      throw new BadRequestException({
        code: 'VALIDATION',
        message: 'Use either after or before, not both',
      });
    }
    const after = decodeCursor(query.after);
    const before = decodeCursor(query.before);
    const cursorFilter: Prisma.NotificationWhereInput[] = [];
    if (after) {
      cursorFilter.push({
        OR: [
          { createdAt: { gt: after.createdAt } },
          { createdAt: after.createdAt, id: { gt: after.id } },
        ],
      });
    } else if (before) {
      cursorFilter.push({
        OR: [
          { createdAt: { lt: before.createdAt } },
          { createdAt: before.createdAt, id: { lt: before.id } },
        ],
      });
    }
    const where: Prisma.NotificationWhereInput = {
      recipientId: actor.id,
      ...(query.unreadOnly ? { readAt: null } : {}),
      ...(cursorFilter.length ? { AND: cursorFilter } : {}),
    };
    const direction = after ? 'asc' : 'desc';
    const notifications = await this.prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: direction }, { id: direction }],
      take: query.limit + 1,
      include: {
        task: {
          select: {
            id: true,
            code: true,
            title: true,
            type: true,
            status: true,
            createdById: true,
            primaryAssigneeId: true,
            archivedAt: true,
            participants: {
              select: {
                userId: true,
                invitationStatus: true,
                role: true,
              },
            },
          },
        },
      },
    });
    const hasMore = notifications.length > query.limit;
    const items = notifications.slice(0, query.limit).map((item) => {
      const task = item.task;
      const canReadTask = task ? this.access.canRead(actor, task) : false;
      if (task && !canReadTask) {
        return {
          id: item.id,
          type: item.type,
          title: 'Cập nhật công việc',
          body: 'Có cập nhật liên quan đến một công việc.',
          taskId: null,
          task: null,
          readAt: item.readAt,
          createdAt: item.createdAt,
        };
      }
      return {
        id: item.id,
        type: item.type,
        title: item.title,
        body: item.body,
        taskId: item.taskId,
        task: task ? { id: task.id, code: task.code, title: task.title } : null,
        readAt: item.readAt,
        createdAt: item.createdAt,
      };
    });
    const continuation = items.at(-1);
    const latest = after ? continuation : items.at(0);
    const unreadCount = await this.prisma.notification.count({
      where: { recipientId: actor.id, readAt: null },
    });
    return {
      items,
      unreadCount,
      hasMore,
      latestCursor: latest ? encodeCursor(latest) : null,
      nextCursor:
        hasMore && continuation
          ? encodeCursor({
              id: continuation.id,
              createdAt: continuation.createdAt,
            })
          : null,
    };
  }

  unreadCount(recipientId: string) {
    return this.prisma.notification
      .count({
        where: { recipientId, readAt: null },
      })
      .then((count) => ({ count }));
  }

  async readOne(recipientId: string, notificationId: string) {
    const now = new Date();
    const changed = await this.prisma.notification.updateMany({
      where: { id: notificationId, recipientId },
      data: { readAt: now },
    });
    if (changed.count !== 1) {
      const owned = await this.prisma.notification.findFirst({
        where: { id: notificationId, recipientId },
        select: { id: true },
      });
      if (!owned) throw notFound();
    }
    return this.prisma.notification.findFirstOrThrow({
      where: { id: notificationId, recipientId },
      select: { id: true, readAt: true },
    });
  }

  async readAll(recipientId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { recipientId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updatedCount: result.count };
  }
}
