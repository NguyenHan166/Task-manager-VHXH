import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FileStatus,
  InvitationStatus,
  NotificationType,
  ParticipantRole,
  Prisma,
  TaskPriority,
  TaskStatus,
  TaskType,
  UserRole,
  UserStatus,
  type Task,
  type TaskComment,
  type TaskEvent,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { TaskAccessPolicy } from '../../common/auth/task-access.policy';
import { BusinessCodeService } from '../../database/business-code.service';
import { PrismaService } from '../../database/prisma.service';
import {
  type CommentDto,
  type CreateTaskDto,
  SortDirection,
  TaskScope,
  TaskSortBy,
  type TaskListQueryDto,
  type TaskPageQueryDto,
  type UpdateTaskDto,
} from './tasks.dto';

type Page<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

const toPublicTask = (task: Task) => ({
  id: task.id,
  code: task.code,
  type: task.type,
  title: task.title,
  description: task.description,
  deliverable: task.deliverable,
  status: task.status,
  priority: task.priority,
  progressPercent: task.progressPercent,
  createdById: task.createdById,
  primaryAssigneeId: task.primaryAssigneeId,
  projectId: task.projectId,
  parentTaskId: task.parentTaskId,
  assignedAt: task.assignedAt,
  dueAt: task.dueAt,
  completedAt: task.completedAt,
  approvedById: task.approvedById,
  approvedAt: task.approvedAt,
  completionDueAtSnapshot: task.completionDueAtSnapshot,
  isBlocked: task.isBlocked,
  blockedReason: task.blockedReason,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
  version: task.version,
});

type PublicTask = ReturnType<typeof toPublicTask>;

const notFound = (): NotFoundException =>
  new NotFoundException({ code: 'NOT_FOUND', message: 'Task not found' });
const invalid = (message: string): BadRequestException =>
  new BadRequestException({ code: 'VALIDATION', message });
const forbidden = (message: string): ForbiddenException =>
  new ForbiddenException({ code: 'FORBIDDEN', message });
const conflict = (message: string): ConflictException =>
  new ConflictException({ code: 'CONFLICT', message });

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TaskAccessPolicy,
    private readonly codes: BusinessCodeService,
  ) {}

  async list(
    actor: AuthenticatedUser,
    query: TaskListQueryDto,
  ): Promise<Page<PublicTask>> {
    if (
      query.dueFrom &&
      query.dueTo &&
      new Date(query.dueFrom) > new Date(query.dueTo)
    ) {
      throw invalid('dueFrom must be earlier than or equal to dueTo');
    }
    const where: Prisma.TaskWhereInput = {
      AND: [
        this.access.readableTaskWhere(actor),
        this.listFilters(actor, query),
      ],
    };
    const [tasks, total] = await this.prisma.$transaction(
      [
        this.prisma.task.findMany({
          where,
          orderBy: this.orderBy(query),
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.prisma.task.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return {
      items: tasks.map(toPublicTask),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async detail(actor: AuthenticatedUser, taskId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const task = await tx.task.findFirst({
          where: this.visibleTaskWhere(actor, taskId),
          include: {
            participants: {
              orderBy: [{ invitedAt: 'asc' }, { id: 'asc' }],
            },
            _count: {
              select: {
                comments: true,
                submissions: true,
                approvals: true,
                events: true,
              },
            },
          },
        });
        if (!task) throw notFound();

        const [links, latestSubmission] = await Promise.all([
          tx.fileLink.findMany({
            where: {
              removedAt: null,
              file: { status: FileStatus.READY },
              OR: [
                { taskId },
                { submission: { is: { taskId } } },
                { comment: { is: { taskId } } },
              ],
            },
            select: {
              file: {
                select: {
                  id: true,
                  originalName: true,
                  mimeType: true,
                  sizeBytes: true,
                  uploadedById: true,
                  status: true,
                  createdAt: true,
                },
              },
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          }),
          tx.taskSubmission.findFirst({
            where: { taskId },
            include: {
              fileLinks: {
                where: {
                  removedAt: null,
                  file: { status: FileStatus.READY },
                },
                select: { fileId: true },
              },
            },
            orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
          }),
        ]);

        return {
          task: toPublicTask(task),
          participants: task.participants,
          files: links.map(({ file }) => ({
            ...file,
            sizeBytes: Number(file.sizeBytes),
          })),
          latestSubmission: latestSubmission
            ? {
                id: latestSubmission.id,
                taskId: latestSubmission.taskId,
                submittedById: latestSubmission.submittedById,
                summary: latestSubmission.summary,
                details: latestSubmission.details,
                deliverableUrl: latestSubmission.deliverableUrl,
                notes: latestSubmission.notes,
                status: latestSubmission.status,
                submittedAt: latestSubmission.submittedAt,
                withdrawnAt: latestSubmission.withdrawnAt,
                withdrawnReason: latestSubmission.withdrawnReason,
                fileIds: latestSubmission.fileLinks.map((link) => link.fileId),
              }
            : null,
          historyCounts: {
            comments: task._count.comments,
            submissions: task._count.submissions,
            approvals: task._count.approvals,
            events: task._count.events,
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async create(
    actor: AuthenticatedUser,
    input: CreateTaskDto,
  ): Promise<PublicTask> {
    if (
      actor.role !== UserRole.MANAGER &&
      actor.role !== UserRole.DEPUTY_MANAGER
    ) {
      throw forbidden('Only leaders can create OFFICIAL tasks');
    }
    if (input.type !== TaskType.OFFICIAL) {
      throw invalid('TEAM and PERSONAL task creation opens in Phase 09');
    }
    if (input.projectId || input.parentTaskId) {
      throw invalid('Project and parent links open in Phase 09');
    }
    if (input.dueAt !== undefined && input.dueDate !== undefined) {
      throw invalid('Provide either dueAt or dueDate, not both');
    }

    const collaboratorIds = input.collaboratorIds ?? [];
    const watcherIds = input.watcherIds ?? [];
    const participantIds = [...collaboratorIds, ...watcherIds];
    if (new Set(participantIds).size !== participantIds.length) {
      throw invalid('A user cannot be both collaborator and watcher');
    }
    if (
      participantIds.includes(actor.id) ||
      (input.primaryAssigneeId &&
        participantIds.includes(input.primaryAssigneeId))
    ) {
      throw invalid('Creator and primary assignee cannot be participants');
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const activeIds = [
        ...new Set([
          ...participantIds,
          ...(input.primaryAssigneeId ? [input.primaryAssigneeId] : []),
        ]),
      ];
      if (activeIds.length) {
        const activeUsers = await tx.user.findMany({
          where: { id: { in: activeIds }, status: UserStatus.ACTIVE },
          select: { id: true },
        });
        if (activeUsers.length !== activeIds.length) {
          throw invalid('Assignee and participants must be ACTIVE users');
        }
      }

      const dueAt = await this.resolveDueAt(tx, input);
      const code = await this.codes.allocate(tx, 'CV', now);
      const task = await tx.task.create({
        data: {
          code,
          type: TaskType.OFFICIAL,
          title: input.title,
          description: input.description ?? '',
          deliverable: input.deliverable ?? '',
          status: TaskStatus.DRAFT,
          priority: input.priority ?? TaskPriority.NORMAL,
          createdById: actor.id,
          primaryAssigneeId: input.primaryAssigneeId ?? null,
          dueAt,
          createdAt: now,
        },
      });
      const participants = [
        ...collaboratorIds.map((userId) => ({
          taskId: task.id,
          userId,
          role: ParticipantRole.COLLABORATOR,
          invitationStatus: InvitationStatus.ACCEPTED,
          invitedAt: now,
          respondedAt: now,
        })),
        ...watcherIds.map((userId) => ({
          taskId: task.id,
          userId,
          role: ParticipantRole.WATCHER,
          invitationStatus: InvitationStatus.ACCEPTED,
          invitedAt: now,
          respondedAt: now,
        })),
      ];
      if (participants.length) {
        await tx.taskParticipant.createMany({ data: participants });
      }
      await this.recordTaskEvent(tx, {
        taskId: task.id,
        actorId: actor.id,
        kind: 'CREATED',
        after: {
          code: task.code,
          type: task.type,
          status: task.status,
          title: task.title,
          primaryAssigneeId: task.primaryAssigneeId,
          dueAt: task.dueAt?.toISOString() ?? null,
        } satisfies Prisma.InputJsonObject,
        createdAt: now,
      });
      return toPublicTask(task);
    });
  }

  async update(
    actor: AuthenticatedUser,
    taskId: string,
    input: UpdateTaskDto,
  ): Promise<PublicTask> {
    if (!Object.keys(input).length) {
      throw invalid('At least one task field is required');
    }
    if (input.projectId !== undefined) {
      throw invalid('Project links open in Phase 09');
    }
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({
        where: this.visibleTaskWhere(actor, taskId),
      });
      if (!task) throw notFound();
      if (!this.access.canOperateOfficial(actor, task)) {
        throw forbidden('You cannot edit this task');
      }
      if (
        task.status === TaskStatus.DONE ||
        task.status === TaskStatus.CANCELLED
      ) {
        throw conflict('Completed or cancelled tasks are read-only');
      }
      if (input.priority !== undefined && task.status !== TaskStatus.DRAFT) {
        throw invalid('Change published task priority through /adjust');
      }

      const data: Prisma.TaskUpdateManyMutationInput = {
        version: { increment: 1 },
      };
      const before: Record<string, string> = {};
      const after: Record<string, string> = {};
      if (input.title !== undefined && input.title !== task.title) {
        data.title = input.title;
        before.title = task.title;
        after.title = input.title;
      }
      if (
        input.description !== undefined &&
        input.description !== task.description
      ) {
        data.description = input.description;
        before.description = task.description;
        after.description = input.description;
      }
      if (
        input.deliverable !== undefined &&
        input.deliverable !== task.deliverable
      ) {
        data.deliverable = input.deliverable;
        before.deliverable = task.deliverable;
        after.deliverable = input.deliverable;
      }
      if (input.priority !== undefined && input.priority !== task.priority) {
        data.priority = input.priority;
        before.priority = task.priority;
        after.priority = input.priority;
      }
      if (!Object.keys(after).length) return toPublicTask(task);

      const changed = await tx.task.updateMany({
        where: {
          id: taskId,
          version: task.version,
          status: task.status,
          AND: [this.access.readableTaskWhere(actor)],
        },
        data,
      });
      if (changed.count !== 1) throw conflict('Task changed during update');
      const updated = await tx.task.findUniqueOrThrow({
        where: { id: taskId },
      });
      await this.recordTaskEvent(tx, {
        taskId,
        actorId: actor.id,
        kind: 'DETAILS_UPDATED',
        before,
        after,
      });
      return toPublicTask(updated);
    });
  }

  async comments(
    actor: AuthenticatedUser,
    taskId: string,
    query: TaskPageQueryDto,
  ): Promise<Page<TaskComment>> {
    return this.prisma.$transaction(
      async (tx) => {
        await this.assertVisible(tx, actor, taskId);
        const [items, total] = await Promise.all([
          tx.taskComment.findMany({
            where: { taskId },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip: (query.page - 1) * query.pageSize,
            take: query.pageSize,
          }),
          tx.taskComment.count({ where: { taskId } }),
        ]);
        return { items, total, page: query.page, pageSize: query.pageSize };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async events(
    actor: AuthenticatedUser,
    taskId: string,
    query: TaskPageQueryDto,
  ): Promise<Page<TaskEvent>> {
    return this.prisma.$transaction(
      async (tx) => {
        await this.assertVisible(tx, actor, taskId);
        const [items, total] = await Promise.all([
          tx.taskEvent.findMany({
            where: { taskId },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip: (query.page - 1) * query.pageSize,
            take: query.pageSize,
          }),
          tx.taskEvent.count({ where: { taskId } }),
        ]);
        return { items, total, page: query.page, pageSize: query.pageSize };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async addComment(
    actor: AuthenticatedUser,
    taskId: string,
    input: CommentDto,
  ): Promise<TaskComment> {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({
        where: this.visibleTaskWhere(actor, taskId),
      });
      if (!task) throw notFound();
      if (task.type !== TaskType.OFFICIAL) {
        throw forbidden('Comments on TEAM and PERSONAL tasks open in Phase 09');
      }
      if (
        task.status === TaskStatus.DRAFT ||
        task.status === TaskStatus.DONE ||
        task.status === TaskStatus.CANCELLED
      ) {
        throw conflict('Comments require an active published task');
      }
      const changed = await tx.task.updateMany({
        where: {
          id: taskId,
          version: task.version,
          status: task.status,
          AND: [this.access.readableTaskWhere(actor)],
        },
        data: { version: { increment: 1 } },
      });
      if (changed.count !== 1) throw conflict('Task changed during comment');
      const comment = await tx.taskComment.create({
        data: { taskId, authorId: actor.id, body: input.body },
      });
      const event = await this.recordTaskEvent(tx, {
        taskId,
        actorId: actor.id,
        kind: 'COMMENT_ADDED',
        after: { commentId: comment.id } satisfies Prisma.InputJsonObject,
      });
      const participants = await tx.taskParticipant.findMany({
        where: { taskId, invitationStatus: InvitationStatus.ACCEPTED },
        select: { userId: true },
      });
      const recipients = await tx.user.findMany({
        where: {
          status: UserStatus.ACTIVE,
          OR: [
            { role: { in: [UserRole.MANAGER, UserRole.DEPUTY_MANAGER] } },
            {
              id: {
                in: [
                  task.createdById,
                  task.primaryAssigneeId,
                  ...participants.map((participant) => participant.userId),
                ].filter((id): id is string => Boolean(id)),
              },
            },
          ],
        },
        select: { id: true },
      });
      const recipientIds = [
        ...new Set(recipients.map((user) => user.id)),
      ].filter((id) => id !== actor.id);
      if (recipientIds.length) {
        await tx.notification.createMany({
          data: recipientIds.map((recipientId) => ({
            recipientId,
            taskId,
            type: NotificationType.COMMENT_ADDED,
            title: 'Bình luận mới',
            body: `[${task.code}] ${task.title} có bình luận mới.`,
            businessEventId: event.id,
            createdAt: event.createdAt,
          })),
          skipDuplicates: true,
        });
        const persisted = await tx.notification.findMany({
          where: {
            businessEventId: event.id,
            recipientId: { in: recipientIds },
          },
          select: { id: true, recipientId: true },
        });
        if (persisted.length) {
          await tx.realtimeOutbox.createMany({
            data: persisted.map((notification) => ({
              type: 'NOTIFICATION_NEW',
              idempotencyKey: `notification:${notification.id}`,
              businessEventId: event.id,
              taskId,
              recipientId: notification.recipientId,
              notificationId: notification.id,
              createdAt: event.createdAt,
            })),
            skipDuplicates: true,
          });
        }
      }
      return comment;
    });
  }

  private visibleTaskWhere(
    actor: AuthenticatedUser,
    taskId: string,
  ): Prisma.TaskWhereInput {
    return { id: taskId, AND: [this.access.readableTaskWhere(actor)] };
  }

  private async assertVisible(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedUser,
    taskId: string,
  ): Promise<void> {
    const task = await tx.task.findFirst({
      where: this.visibleTaskWhere(actor, taskId),
      select: { id: true },
    });
    if (!task) throw notFound();
  }

  private async resolveDueAt(
    tx: Prisma.TransactionClient,
    input: CreateTaskDto,
  ): Promise<Date | null> {
    if (input.dueAt) return new Date(input.dueAt);
    if (!input.dueDate) return null;
    const settings = await tx.appSettings.findUnique({
      where: { id: 1 },
      select: { defaultDueHour: true },
    });
    const hour = String(settings?.defaultDueHour ?? 16).padStart(2, '0');
    return new Date(`${input.dueDate}T${hour}:00:00+07:00`);
  }

  private async recordTaskEvent(
    tx: Prisma.TransactionClient,
    data: Prisma.TaskEventUncheckedCreateInput,
  ) {
    const event = await tx.taskEvent.create({ data });
    await tx.realtimeOutbox.create({
      data: {
        type: 'TASK_UPDATED',
        idempotencyKey: `task:${event.id}`,
        businessEventId: event.id,
        taskId: event.taskId,
        createdAt: event.createdAt,
      },
    });
    return event;
  }

  private listFilters(
    actor: AuthenticatedUser,
    query: TaskListQueryDto,
  ): Prisma.TaskWhereInput {
    const filters: Prisma.TaskWhereInput[] = [];
    if (query.scope === TaskScope.OWNED) {
      filters.push({
        OR: [{ createdById: actor.id }, { primaryAssigneeId: actor.id }],
      });
    } else if (query.scope === TaskScope.COLLABORATING) {
      filters.push({
        participants: {
          some: {
            userId: actor.id,
            role: ParticipantRole.COLLABORATOR,
            invitationStatus: InvitationStatus.ACCEPTED,
          },
        },
        OR: [
          { primaryAssigneeId: null },
          { primaryAssigneeId: { not: actor.id } },
        ],
      });
    } else if (query.scope === TaskScope.WATCHING) {
      filters.push({
        participants: {
          some: {
            userId: actor.id,
            role: ParticipantRole.WATCHER,
            invitationStatus: InvitationStatus.ACCEPTED,
          },
        },
      });
    }
    if (query.type && query.type !== 'ALL') filters.push({ type: query.type });
    if (query.status && query.status !== 'ALL') {
      filters.push({ status: query.status });
    }
    if (query.priority && query.priority !== 'ALL') {
      filters.push({ priority: query.priority });
    }
    if (query.projectId) filters.push({ projectId: query.projectId });
    if (query.primaryAssigneeId) {
      filters.push({ primaryAssigneeId: query.primaryAssigneeId });
    }
    if (query.search) {
      filters.push({
        OR: [
          { code: { contains: query.search, mode: 'insensitive' } },
          { title: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    if (query.dueFrom || query.dueTo) {
      filters.push({
        dueAt: {
          ...(query.dueFrom ? { gte: new Date(query.dueFrom) } : {}),
          ...(query.dueTo ? { lte: new Date(query.dueTo) } : {}),
        },
      });
    }
    if (query.isOverdue) {
      filters.push({
        dueAt: { lt: new Date() },
        status: {
          in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.IN_REVIEW],
        },
      });
    }
    return { AND: filters };
  }

  private orderBy(
    query: TaskListQueryDto,
  ): Prisma.TaskOrderByWithRelationInput[] {
    const direction: Prisma.SortOrder =
      query.sortDirection === SortDirection.ASC ? 'asc' : 'desc';
    switch (query.sortBy) {
      case TaskSortBy.DUE_AT:
        return [{ dueAt: { sort: direction, nulls: 'last' } }, { id: 'asc' }];
      case TaskSortBy.PRIORITY:
        return [{ priority: direction }, { id: 'asc' }];
      case TaskSortBy.CREATED_AT:
        return [{ createdAt: direction }, { id: 'asc' }];
      default:
        return [{ updatedAt: direction }, { id: 'asc' }];
    }
  }
}
