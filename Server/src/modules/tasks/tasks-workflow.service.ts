import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalDecision,
  FileStatus,
  NotificationType,
  ParticipantRole,
  Prisma,
  RealtimeOutboxType,
  SubmissionStatus,
  Task,
  TaskStatus,
  TaskType,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { RequestContextService } from '../../common/http/request-context.service';
import { TaskAccessPolicy } from '../../common/auth/task-access.policy';
import { PrismaService } from '../../database/prisma.service';
import {
  AdjustTaskDto,
  DecideApprovalDto,
  ReturnSubmissionDto,
  SubmitTaskDto,
  TaskPageQueryDto,
  TaskProgressDto,
  TaskReasonDto,
  WithdrawSubmissionDto,
} from './tasks.dto';

type Page<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

type NotificationGroup = {
  recipientIds: string[];
  type: NotificationType;
  title: string;
  body: string;
};

const publicTask = (task: Task) => ({
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

const notFound = (): NotFoundException =>
  new NotFoundException({ code: 'NOT_FOUND', message: 'Task not found' });
const invalid = (message: string): BadRequestException =>
  new BadRequestException({ code: 'VALIDATION', message });
const forbidden = (message: string): ForbiddenException =>
  new ForbiddenException({ code: 'FORBIDDEN', message });
const conflict = (message: string): ConflictException =>
  new ConflictException({ code: 'CONFLICT', message });

@Injectable()
export class TasksWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TaskAccessPolicy,
    private readonly requestContext: RequestContextService,
  ) {}

  async publish(actor: AuthenticatedUser, taskId: string) {
    return this.prisma.$transaction(async (tx) => {
      const task = await this.commandTask(tx, actor, taskId);
      this.requireLeader(actor);
      this.requireOfficial(task);
      if (task.createdById !== actor.id && actor.role !== UserRole.MANAGER) {
        throw forbidden('Only the task creator can publish this draft');
      }
      if (task.status !== TaskStatus.DRAFT) {
        throw conflict('Only a DRAFT task can be published');
      }
      if (!task.title.trim() || !task.deliverable.trim()) {
        throw invalid('Title and deliverable are required before publishing');
      }
      if (!task.primaryAssigneeId || !task.dueAt) {
        throw invalid('An active primary assignee and due date are required');
      }
      if (!(await this.lockActiveUser(tx, task.primaryAssigneeId))) {
        throw invalid('The primary assignee must be ACTIVE');
      }

      const now = new Date();
      const updated = await this.transition(
        tx,
        actor,
        task,
        {
          status: TaskStatus.TODO,
          assignedAt: now,
        },
        now,
      );
      const event = await this.event(
        tx,
        actor,
        task,
        'PUBLISHED',
        'Nhiệm vụ đã được phát hành.',
        {
          status: task.status,
          assignedAt: task.assignedAt?.toISOString() ?? null,
        },
        { status: updated.status, assignedAt: now.toISOString() },
        now,
      );
      const collaborators = await tx.taskParticipant.findMany({
        where: {
          taskId: task.id,
          role: ParticipantRole.COLLABORATOR,
          invitationStatus: 'ACCEPTED',
        },
        select: { userId: true },
      });
      await this.notify(tx, task, actor.id, event.id, now, [
        {
          recipientIds: [
            task.primaryAssigneeId,
            ...collaborators.map(({ userId }) => userId),
          ],
          type: NotificationType.TASK_ASSIGNED,
          title: 'Bạn được giao công việc',
          body: `Bạn được giao thực hiện [${task.code}] ${task.title}.`,
        },
      ]);
      return publicTask(updated);
    }, { maxWait: 10_000, timeout: 15_000 });
  }

  async start(actor: AuthenticatedUser, taskId: string) {
    return this.prisma.$transaction(async (tx) => {
      const task = await this.commandTask(tx, actor, taskId);
      this.requireOfficial(task);
      await this.requireTaskOperator(tx, actor, task);
      if (task.status !== TaskStatus.TODO) {
        throw conflict('Only a TODO task can be started');
      }
      const now = new Date();
      const updated = await this.transition(
        tx,
        actor,
        task,
        { status: TaskStatus.IN_PROGRESS },
        now,
      );
      await this.event(
        tx,
        actor,
        task,
        'STARTED',
        'Bắt đầu thực hiện nhiệm vụ.',
        { status: task.status },
        { status: updated.status },
        now,
      );
      return publicTask(updated);
    });
  }

  async progress(
    actor: AuthenticatedUser,
    taskId: string,
    input: TaskProgressDto,
  ) {
    if (input.isBlocked && !input.blockedReason?.trim()) {
      throw invalid('blockedReason is required when isBlocked is true');
    }
    return this.prisma.$transaction(async (tx) => {
      const task = await this.commandTask(tx, actor, taskId);
      this.requireOfficial(task);
      await this.requireTaskOperator(tx, actor, task);
      if (
        task.status !== TaskStatus.TODO &&
        task.status !== TaskStatus.IN_PROGRESS
      ) {
        throw conflict(
          'Progress can only be updated on TODO or IN_PROGRESS tasks',
        );
      }

      const now = new Date();
      const nextStatus =
        task.status === TaskStatus.TODO && input.progressPercent > 0
          ? TaskStatus.IN_PROGRESS
          : task.status;
      const blockedReason = input.isBlocked
        ? input.blockedReason!.trim()
        : null;
      const changedProgress =
        task.progressPercent !== input.progressPercent ||
        task.status !== nextStatus;
      const changedBlocked =
        task.isBlocked !== input.isBlocked ||
        task.blockedReason !== blockedReason;
      if (!changedProgress && !changedBlocked) return publicTask(task);

      const updated = await this.transition(
        tx,
        actor,
        task,
        {
          status: nextStatus,
          progressPercent: input.progressPercent,
          isBlocked: input.isBlocked,
          blockedReason,
        },
        now,
      );
      if (changedProgress) {
        await this.event(
          tx,
          actor,
          task,
          'PROGRESS_UPDATED',
          `Tiến độ được cập nhật thành ${updated.progressPercent}%.`,
          { status: task.status, progressPercent: task.progressPercent },
          { status: updated.status, progressPercent: updated.progressPercent },
          now,
        );
      }
      if (
        task.isBlocked !== updated.isBlocked ||
        task.blockedReason !== updated.blockedReason
      ) {
        const kind = updated.isBlocked ? 'BLOCKED' : 'UNBLOCKED';
        const eventTime = new Date(now.getTime() + (changedProgress ? 1 : 0));
        const event = await this.event(
          tx,
          actor,
          task,
          kind,
          updated.isBlocked
            ? task.isBlocked
              ? `Đã cập nhật lý do vướng mắc: ${updated.blockedReason}`
              : `Báo vướng mắc: ${updated.blockedReason}`
            : 'Đã gỡ trạng thái vướng mắc.',
          { isBlocked: task.isBlocked, blockedReason: task.blockedReason },
          {
            isBlocked: updated.isBlocked,
            blockedReason: updated.blockedReason,
          },
          eventTime,
        );
        if (updated.isBlocked) {
          const leaders = await this.activeLeaders(tx, actor.id);
          await this.notify(tx, task, actor.id, event.id, eventTime, [
            {
              recipientIds: leaders,
              type: NotificationType.TASK_UPDATED,
              title: 'Nhiệm vụ đang gặp vướng mắc',
              body: `[${task.code}] ${task.title}: ${updated.blockedReason}`,
            },
          ]);
        }
      }
      return publicTask(updated);
    });
  }

  async submissions(
    actor: AuthenticatedUser,
    taskId: string,
    query: TaskPageQueryDto,
  ): Promise<Page<Record<string, unknown>>> {
    return this.prisma.$transaction(
      async (tx) => {
        const task = await this.commandTask(tx, actor, taskId);
        const [items, total] = await Promise.all([
          tx.taskSubmission.findMany({
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
            skip: (query.page - 1) * query.pageSize,
            take: query.pageSize,
          }),
          tx.taskSubmission.count({ where: { taskId } }),
        ]);
        this.requireOfficial(task);
        return {
          items: items.map(({ fileLinks, ...submission }) => ({
            ...submission,
            fileIds: fileLinks.map((link) => link.fileId),
          })),
          total,
          page: query.page,
          pageSize: query.pageSize,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async submit(actor: AuthenticatedUser, taskId: string, input: SubmitTaskDto) {
    const summary = input.summary.trim();
    if (!summary) throw invalid('summary is required');
    return this.prisma.$transaction(async (tx) => {
      const task = await this.commandTask(tx, actor, taskId);
      this.requireOfficial(task);
      if (task.status !== TaskStatus.IN_PROGRESS) {
        throw conflict('Only an IN_PROGRESS task can be submitted');
      }
      if (!(await this.isAssignedWorker(tx, actor, task))) {
        throw forbidden('Only an assigned worker can submit results');
      }

      const fileIds = input.fileIds ?? [];
      if (fileIds.length) {
        const files = await tx.fileObject.findMany({
          where: {
            id: { in: fileIds },
            status: FileStatus.READY,
            links: { some: { taskId, removedAt: null } },
          },
          select: { id: true },
        });
        if (files.length !== fileIds.length) {
          throw invalid(
            'Every submitted file must be READY and linked to this task',
          );
        }
      }

      const now = new Date();
      const updated = await this.transition(
        tx,
        actor,
        task,
        { status: TaskStatus.IN_REVIEW, progressPercent: 100 },
        now,
      );
      const submission = await tx.taskSubmission.create({
        data: {
          taskId,
          submittedById: actor.id,
          summary,
          details: input.details ?? null,
          deliverableUrl: input.deliverableUrl ?? null,
          notes: input.notes ?? null,
          status: SubmissionStatus.PENDING,
          submittedAt: now,
        },
      });
      if (fileIds.length) {
        const moved = await tx.fileLink.updateMany({
          where: {
            fileId: { in: fileIds },
            taskId,
            submissionId: null,
            removedAt: null,
          },
          data: { removedAt: now },
        });
        if (moved.count !== fileIds.length) {
          throw conflict('A submitted file link changed during submission');
        }
        await tx.fileLink.createMany({
          data: fileIds.map((fileId) => ({
            fileId,
            submissionId: submission.id,
            createdAt: now,
          })),
        });
      }
      const event = await this.event(
        tx,
        actor,
        task,
        'SUBMITTED',
        'Kết quả đã được nộp để duyệt.',
        { status: task.status, progressPercent: task.progressPercent },
        {
          status: updated.status,
          progressPercent: updated.progressPercent,
          submissionId: submission.id,
          fileIds,
        },
        now,
      );
      await this.notify(tx, task, actor.id, event.id, now, [
        {
          recipientIds: await this.activeLeaders(tx, actor.id),
          type: NotificationType.SUBMISSION_RECEIVED,
          title: 'Có kết quả chờ duyệt',
          body: `[${task.code}] ${task.title} đã được nộp kết quả.`,
        },
      ]);
      return {
        submission: { ...submission, fileIds },
        task: publicTask(updated),
      };
    });
  }

  async withdraw(
    actor: AuthenticatedUser,
    taskId: string,
    submissionId: string,
    input: WithdrawSubmissionDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const task = await this.commandTask(tx, actor, taskId);
      this.requireOfficial(task);
      if (task.status !== TaskStatus.IN_REVIEW) {
        throw conflict('Only an IN_REVIEW submission can be withdrawn');
      }
      const submission = await tx.taskSubmission.findFirst({
        where: { id: submissionId, taskId },
      });
      if (!submission) throw notFound();
      if (submission.submittedById !== actor.id) {
        throw forbidden('Only the submitter can withdraw this submission');
      }
      const current = await tx.taskSubmission.findFirst({
        where: { taskId, status: SubmissionStatus.PENDING },
      });
      if (!current || current.id !== submissionId) {
        throw conflict('Only the current PENDING submission can be withdrawn');
      }
      const approval = await tx.taskApproval.findUnique({
        where: { submissionId },
        select: { id: true },
      });
      if (approval) throw conflict('A decided submission cannot be withdrawn');

      const now = new Date();
      const reason = input.reason?.trim() || null;
      const updated = await this.transition(
        tx,
        actor,
        task,
        {
          status: TaskStatus.IN_PROGRESS,
          progressPercent:
            task.progressPercent === 100 ? 90 : task.progressPercent,
        },
        now,
      );
      const withdrawn = await tx.taskSubmission.updateMany({
        where: { id: submissionId, taskId, status: SubmissionStatus.PENDING },
        data: {
          status: SubmissionStatus.WITHDRAWN,
          withdrawnAt: now,
          withdrawnReason: reason,
        },
      });
      if (withdrawn.count !== 1) {
        throw conflict('Submission changed before it could be withdrawn');
      }
      const event = await this.event(
        tx,
        actor,
        task,
        'SUBMISSION_WITHDRAWN',
        reason
          ? `Đã thu hồi kết quả: ${reason}`
          : 'Đã thu hồi kết quả để tiếp tục hoàn thiện.',
        {
          status: task.status,
          progressPercent: task.progressPercent,
          submissionId,
          submissionStatus: submission.status,
        },
        {
          status: updated.status,
          progressPercent: updated.progressPercent,
          submissionId,
          submissionStatus: SubmissionStatus.WITHDRAWN,
        },
        now,
      );
      await this.notify(tx, task, actor.id, event.id, now, [
        {
          recipientIds: await this.activeLeaders(tx, actor.id),
          type: NotificationType.SUBMISSION_WITHDRAWN,
          title: 'Kết quả đã được thu hồi',
          body: `[${task.code}] ${task.title} đã được thu hồi${reason ? `: ${reason}` : '.'}`,
        },
      ]);
      const savedSubmission = await tx.taskSubmission.findUniqueOrThrow({
        where: { id: submissionId },
        include: {
          fileLinks: {
            where: { removedAt: null, file: { status: FileStatus.READY } },
            select: { fileId: true },
          },
        },
      });
      const { fileLinks, ...publicSubmission } = savedSubmission;
      return {
        submission: {
          ...publicSubmission,
          fileIds: fileLinks.map((link) => link.fileId),
        },
        task: publicTask(updated),
      };
    });
  }

  async approvals(
    actor: AuthenticatedUser,
    taskId: string,
    query: TaskPageQueryDto,
  ): Promise<Page<unknown>> {
    return this.prisma.$transaction(
      async (tx) => {
        const task = await this.commandTask(tx, actor, taskId);
        this.requireOfficial(task);
        const [items, total] = await Promise.all([
          tx.taskApproval.findMany({
            where: { taskId },
            orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }],
            skip: (query.page - 1) * query.pageSize,
            take: query.pageSize,
          }),
          tx.taskApproval.count({ where: { taskId } }),
        ]);
        return { items, total, page: query.page, pageSize: query.pageSize };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async approve(
    actor: AuthenticatedUser,
    taskId: string,
    input: DecideApprovalDto,
  ) {
    return this.decide(
      actor,
      taskId,
      input.submissionId,
      ApprovalDecision.APPROVED,
      input.reason,
    );
  }

  async returnSubmission(
    actor: AuthenticatedUser,
    taskId: string,
    input: ReturnSubmissionDto,
  ) {
    const reason = input.reason.trim();
    if (!reason) throw invalid('A return reason is required');
    return this.decide(
      actor,
      taskId,
      input.submissionId,
      ApprovalDecision.RETURNED,
      reason,
    );
  }

  async adjust(actor: AuthenticatedUser, taskId: string, input: AdjustTaskDto) {
    const reason = input.reason.trim();
    if (!reason) throw invalid('A reason is required');
    if (input.dueAt !== undefined && input.dueDate !== undefined) {
      throw invalid('Provide either dueAt or dueDate, not both');
    }
    if (
      input.dueAt === undefined &&
      input.dueDate === undefined &&
      input.primaryAssigneeId === undefined &&
      input.priority === undefined
    ) {
      throw invalid('At least one task field must be adjusted');
    }
    return this.prisma.$transaction(async (tx) => {
      const task = await this.commandTask(tx, actor, taskId);
      this.requireLeader(actor);
      this.requireOfficial(task);
      if (
        task.status !== TaskStatus.TODO &&
        task.status !== TaskStatus.IN_PROGRESS &&
        task.status !== TaskStatus.IN_REVIEW
      ) {
        throw conflict('Only a published active task can be adjusted');
      }
      let dueAt = task.dueAt;
      if (input.dueAt !== undefined) dueAt = new Date(input.dueAt);
      if (input.dueDate !== undefined) {
        dueAt = await this.resolveDueDate(tx, input.dueDate);
      }
      let primaryAssigneeId = task.primaryAssigneeId;
      if (input.primaryAssigneeId !== undefined) {
        if (!(await this.lockActiveUser(tx, input.primaryAssigneeId))) {
          throw invalid('The new primary assignee must be ACTIVE');
        }
        primaryAssigneeId = input.primaryAssigneeId;
      }
      if (!dueAt || !primaryAssigneeId) {
        throw invalid(
          'An active OFFICIAL task must have a due date and primary assignee',
        );
      }
      const nextPriority = input.priority ?? task.priority;
      const dueChanged = dueAt.getTime() !== task.dueAt?.getTime();
      const assigneeChanged = primaryAssigneeId !== task.primaryAssigneeId;
      const priorityChanged = nextPriority !== task.priority;
      if (!dueChanged && !assigneeChanged && !priorityChanged) {
        return publicTask(task);
      }

      const now = new Date();
      const before: Record<string, string | null> = {};
      const after: Record<string, string | null> = {};
      const assigneeId = primaryAssigneeId;
      if (!assigneeId) throw invalid('A primary assignee is required');
      if (dueChanged) {
        before.dueAt = task.dueAt?.toISOString() ?? null;
        after.dueAt = dueAt.toISOString();
      }
      if (assigneeChanged) {
        before.primaryAssigneeId = task.primaryAssigneeId;
        after.primaryAssigneeId = assigneeId;
      }
      if (priorityChanged) {
        before.priority = task.priority;
        after.priority = nextPriority;
      }
      const updated = await this.transition(
        tx,
        actor,
        task,
        {
          ...(dueChanged ? { dueAt } : {}),
          ...(assigneeChanged ? { primaryAssigneeId: assigneeId } : {}),
          ...(priorityChanged ? { priority: nextPriority } : {}),
        },
        now,
      );
      const kind = assigneeChanged
        ? 'ASSIGNEE_CHANGED'
        : dueChanged
          ? 'DEADLINE_CHANGED'
          : 'DETAILS_UPDATED';
      const event = await this.event(
        tx,
        actor,
        task,
        kind,
        `Đã điều chỉnh nhiệm vụ. Lý do: ${reason}`,
        before,
        after,
        now,
      );
      const notifications: NotificationGroup[] = [];
      if (assigneeChanged) {
        notifications.push(
          {
            recipientIds: [assigneeId],
            type: NotificationType.TASK_ASSIGNED,
            title: 'Bạn được giao làm chủ trì nhiệm vụ',
            body: `Bạn được phân công chủ trì [${task.code}] ${task.title}. Lý do: ${reason}`,
          },
          {
            recipientIds: task.primaryAssigneeId
              ? [task.primaryAssigneeId]
              : [],
            type: NotificationType.TASK_UPDATED,
            title: 'Thay đổi người chủ trì',
            body: `[${task.code}] ${task.title} đã được chuyển cho người chủ trì khác.`,
          },
        );
      } else {
        notifications.push({
          recipientIds: [assigneeId],
          type: NotificationType.TASK_UPDATED,
          title: 'Nhiệm vụ đã được điều chỉnh',
          body: `[${task.code}] ${task.title} đã được điều chỉnh. Lý do: ${reason}`,
        });
      }
      await this.notify(tx, task, actor.id, event.id, now, notifications);
      return publicTask(updated);
    });
  }

  async cancel(actor: AuthenticatedUser, taskId: string) {
    this.requireLeader(actor);
    return this.archiveTask(actor, taskId, 'cancel');
  }

  async recall(actor: AuthenticatedUser, taskId: string) {
    if (actor.role !== UserRole.MANAGER) throw forbidden('Only the manager can recall an assignment');
    return this.prisma.$transaction(async (tx) => {
      const task = await this.commandTask(tx, actor, taskId);
      this.requireOfficial(task);
      if (
        task.status !== TaskStatus.TODO &&
        task.status !== TaskStatus.IN_PROGRESS &&
        task.status !== TaskStatus.IN_REVIEW
      ) {
        throw conflict('Only an active assignment can be recalled');
      }
      const now = new Date();
      const collaborators = await tx.taskParticipant.findMany({
        where: { taskId, role: ParticipantRole.COLLABORATOR, invitationStatus: 'ACCEPTED' },
        select: { userId: true },
      });
      const recipientIds = [...new Set([task.primaryAssigneeId, ...collaborators.map(({ userId }) => userId)].filter((id): id is string => Boolean(id) && id !== actor.id))];
      const notificationIds = await tx.notification.findMany({ where: { taskId }, select: { id: true } });
      await tx.realtimeOutbox.deleteMany({ where: { OR: [{ taskId }, { notificationId: { in: notificationIds.map(({ id }) => id) } }] } });
      await tx.notification.deleteMany({ where: { taskId } });

      const fileLinks = await tx.fileLink.findMany({
        where: { OR: [{ submission: { is: { taskId } } }, { comment: { is: { taskId } } }] },
        select: { fileId: true },
      });
      const fileIds = [...new Set(fileLinks.map(({ fileId }) => fileId))];
      await tx.fileLink.deleteMany({ where: { OR: [{ submission: { is: { taskId } } }, { comment: { is: { taskId } } }] } });
      await tx.taskApproval.deleteMany({ where: { taskId } });
      await tx.taskSubmission.deleteMany({ where: { taskId } });
      await tx.taskComment.deleteMany({ where: { taskId } });
      await tx.taskDeadlineRequest.deleteMany({ where: { taskId } });
      await tx.taskAssigneeRequest.deleteMany({ where: { taskId } });
      await tx.reminderEvent.deleteMany({ where: { taskId } });
      if (fileIds.length) {
        await tx.fileObject.updateMany({
          where: { id: { in: fileIds }, status: { in: [FileStatus.UPLOADING, FileStatus.READY] }, links: { none: { removedAt: null } } },
          data: { status: FileStatus.REMOVED, removedAt: now, purgeAfter: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000), uploadExpiresAt: null },
        });
      }
      const updated = await this.transition(tx, actor, task, {
        status: TaskStatus.DRAFT,
        assignedAt: null,
        progressPercent: 0,
        completedAt: null,
        completionDueAtSnapshot: null,
        approvedById: null,
        approvedAt: null,
        isBlocked: false,
        blockedReason: null,
      }, now);
      const event = await this.event(tx, actor, task, 'RECALLED', 'Trưởng phòng đã thu hồi công việc về bản nháp.',
        { status: task.status }, { status: TaskStatus.DRAFT }, now);
      if (recipientIds.length) {
        const activeUsers = await tx.user.findMany({ where: { id: { in: recipientIds }, status: UserStatus.ACTIVE }, select: { id: true } });
        await tx.notification.createMany({
          data: activeUsers.map(({ id }) => ({ recipientId: id, taskId: null, type: NotificationType.TASK_UPDATED,
            title: 'Công việc đã được thu hồi', body: `[${task.code}] ${task.title} đã được Trưởng phòng thu hồi về bản nháp.`,
            businessEventId: event.id, createdAt: now })), skipDuplicates: true,
        });
        const notifications = await tx.notification.findMany({ where: { businessEventId: event.id }, select: { id: true, recipientId: true } });
        await tx.realtimeOutbox.createMany({ data: notifications.map(({ id, recipientId }) => ({
          type: RealtimeOutboxType.NOTIFICATION_NEW, idempotencyKey: `notification:${id}`,
          businessEventId: event.id, recipientId, notificationId: id, createdAt: now,
        })), skipDuplicates: true });
      }
      return publicTask(updated);
    });
  }

  async finish(actor: AuthenticatedUser, taskId: string) {
    return this.archiveCompleted(actor, taskId);
  }

  async archiveCompleted(actor: AuthenticatedUser, taskId: string) {
    if (actor.role !== UserRole.MANAGER) {
      throw forbidden('Only the manager can archive a completed task');
    }
    return this.archiveTask(actor, taskId, 'finish');
  }

  private async archiveTask(actor: AuthenticatedUser, taskId: string, mode: 'cancel' | 'finish') {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({
        where: { id: taskId, archivedAt: null },
      });
      if (!task) throw notFound();
      if (task.type === TaskType.PERSONAL) {
        throw forbidden('Personal tasks can only be removed by their owner');
      }
      if (mode === 'finish') {
        if (task.type !== TaskType.OFFICIAL || task.status !== TaskStatus.DONE || !task.approvedAt || !task.approvedById) {
          throw conflict('Only an approved, completed assignment can be archived');
        }
      } else if (
        task.status !== TaskStatus.DRAFT &&
        task.status !== TaskStatus.TODO &&
        task.status !== TaskStatus.IN_PROGRESS &&
        task.status !== TaskStatus.IN_REVIEW
      ) {
        throw conflict('This task cannot be cancelled in its current state');
      }
      const now = new Date();

      const fileIds: string[] = [];
      if (mode === 'cancel') {
        const fileLinks = await tx.fileLink.findMany({
            where: {
              removedAt: null,
              OR: [
                { taskId },
                { submission: { is: { taskId } } },
                { comment: { is: { taskId } } },
              ],
            },
            select: { fileId: true },
          });
        fileIds.push(...new Set(fileLinks.map(({ fileId }) => fileId)));
      }
      const collaborators = await tx.taskParticipant.findMany({
        where: {
          taskId,
          role: ParticipantRole.COLLABORATOR,
          invitationStatus: 'ACCEPTED',
        },
        select: { userId: true },
      });

      const changed = await tx.task.updateMany({
        where: {
          id: task.id,
          archivedAt: null,
          version: task.version,
          status: task.status,
        },
        data: {
          archivedAt: now,
          version: { increment: 1 },
          updatedAt: now,
        },
      });
      if (changed.count !== 1) {
        throw conflict('Task changed while the command was running');
      }

      if (mode === 'cancel') {
        await tx.fileLink.updateMany({
          where: {
            removedAt: null,
            OR: [
              { taskId },
              { submission: { is: { taskId } } },
              { comment: { is: { taskId } } },
            ],
          },
          data: { removedAt: now },
        });
      }

      if (fileIds.length) {
        await tx.fileObject.updateMany({
          where: {
            id: { in: fileIds },
            status: { in: [FileStatus.UPLOADING, FileStatus.READY] },
            links: { none: { removedAt: null } },
          },
          data: {
            status: FileStatus.REMOVED,
            removedAt: now,
            purgeAfter:
              task.status === TaskStatus.DRAFT
                ? now
                : new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
            uploadExpiresAt: null,
          },
        });
      }

      const event = await this.event(
        tx,
        actor,
        task,
        mode === 'finish' ? 'FINISHED' : 'DELETED',
        mode === 'finish'
          ? 'Đã lưu trữ công việc sau khi duyệt hoàn thành.'
          : 'Đã thu hồi và lưu trữ công việc theo xác nhận của lãnh đạo.',
        { status: task.status, archivedAt: null },
        { status: task.status, archivedAt: now.toISOString() },
        now,
      );

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: mode === 'finish' ? 'TASK_FINISHED' : 'TASK_DELETED',
          entity: 'TASK',
          entityId: task.id,
          before: {
            code: task.code,
            title: task.title,
            status: task.status,
            primaryAssigneeId: task.primaryAssigneeId,
          },
          after: { archived: true, archivedAt: now.toISOString() },
          createdAt: now,
        },
      });

      const recipientIds = [
        task.primaryAssigneeId,
        ...collaborators.map(({ userId }) => userId),
      ].filter((id): id is string => Boolean(id) && id !== actor.id);
      if (task.status !== TaskStatus.DRAFT && recipientIds.length) {
        const activeUsers = await tx.user.findMany({
          where: { id: { in: [...new Set(recipientIds)] }, status: UserStatus.ACTIVE },
          select: { id: true },
        });
        await tx.notification.createMany({
          data: activeUsers.map(({ id }) => ({
            recipientId: id,
            taskId: null,
            type: NotificationType.TASK_UPDATED,
            title: mode === 'finish' ? 'Công việc đã được lưu trữ' : 'Công việc đã được thu hồi',
            body: mode === 'finish'
              ? `[${task.code}] ${task.title} đã được Trưởng phòng lưu trữ sau khi duyệt hoàn thành.`
              : `[${task.code}] ${task.title} đã được thu hồi theo xác nhận của lãnh đạo.`,
            businessEventId: event.id,
            createdAt: now,
          })),
          skipDuplicates: true,
        });
        const notifications = await tx.notification.findMany({
          where: { businessEventId: event.id },
          select: { id: true, recipientId: true },
        });
        if (notifications.length) {
          await tx.realtimeOutbox.createMany({
            data: notifications.map(({ id, recipientId }) => ({
              type: RealtimeOutboxType.NOTIFICATION_NEW,
              idempotencyKey: `notification:${id}`,
              businessEventId: event.id,
              taskId: null,
              recipientId,
              notificationId: id,
              createdAt: now,
            })),
            skipDuplicates: true,
          });
        }
      }
      return { success: true, id: task.id, code: task.code };
    });
  }

  async reopen(actor: AuthenticatedUser, taskId: string, input: TaskReasonDto) {
    const reason = input.reason.trim();
    if (!reason) throw invalid('A reopening reason is required');
    return this.prisma.$transaction(async (tx) => {
      const task = await this.commandTask(tx, actor, taskId);
      this.requireLeader(actor);
      this.requireOfficial(task);
      if (
        task.status !== TaskStatus.DONE &&
        task.status !== TaskStatus.CANCELLED
      ) {
        throw conflict('Only a DONE or CANCELLED task can be reopened');
      }
      let nextStatus: TaskStatus;
      let assignedAt = task.assignedAt;
      let assignOnReopen = false;
      if (task.status === TaskStatus.DONE) {
        nextStatus = TaskStatus.IN_PROGRESS;
      } else {
        const started =
          task.progressPercent > 0 ||
          (await tx.taskSubmission.count({ where: { taskId } })) > 0 ||
          (await tx.taskEvent.count({
            where: {
              taskId,
              kind: {
                in: [
                  'STARTED',
                  'PROGRESS_UPDATED',
                  'SUBMITTED',
                  'SUBMISSION_WITHDRAWN',
                  'RETURNED',
                  'APPROVED',
                ],
              },
            },
          })) > 0;
        nextStatus = started ? TaskStatus.IN_PROGRESS : TaskStatus.TODO;
        if (!started) {
          if (
            !task.title.trim() ||
            !task.deliverable.trim() ||
            !task.primaryAssigneeId ||
            !task.dueAt
          ) {
            throw conflict(
              'A cancelled draft needs publish details before it can reopen',
            );
          }
          if (!(await this.lockActiveUser(tx, task.primaryAssigneeId)))
            throw conflict('The primary assignee must be ACTIVE to reopen');
          assignOnReopen = assignedAt === null;
        }
      }

      const now = new Date();
      if (assignOnReopen) assignedAt = now;
      const updated = await this.transition(
        tx,
        actor,
        task,
        {
          status: nextStatus,
          assignedAt,
          completedAt: null,
          approvedById: null,
          approvedAt: null,
          completionDueAtSnapshot: null,
        },
        now,
      );
      const event = await this.event(
        tx,
        actor,
        task,
        'REOPENED',
        `Đã mở lại nhiệm vụ. Lý do: ${reason}`,
        {
          status: task.status,
          assignedAt: task.assignedAt?.toISOString() ?? null,
          completedAt: task.completedAt?.toISOString() ?? null,
          approvedById: task.approvedById,
          approvedAt: task.approvedAt?.toISOString() ?? null,
          completionDueAtSnapshot:
            task.completionDueAtSnapshot?.toISOString() ?? null,
        },
        {
          status: updated.status,
          assignedAt: updated.assignedAt?.toISOString() ?? null,
          completedAt: null,
          approvedById: null,
          approvedAt: null,
          completionDueAtSnapshot: null,
        },
        now,
      );
      await this.notify(tx, task, actor.id, event.id, event.createdAt, [
        {
          recipientIds: task.primaryAssigneeId ? [task.primaryAssigneeId] : [],
          type: NotificationType.TASK_UPDATED,
          title: 'Nhiệm vụ đã được mở lại',
          body: `[${task.code}] ${task.title} đã được mở lại. Lý do: ${reason}`,
        },
      ]);
      return publicTask(updated);
    });
  }

  private async decide(
    actor: AuthenticatedUser,
    taskId: string,
    submissionId: string,
    decision: ApprovalDecision,
    reasonInput?: string,
  ) {
    if (decision === ApprovalDecision.RETURNED && !reasonInput?.trim()) {
      throw invalid('A return reason is required');
    }
    return this.prisma.$transaction(async (tx) => {
      const task = await this.commandTask(tx, actor, taskId);
      this.requireLeader(actor);
      this.requireOfficial(task);
      if (task.status !== TaskStatus.IN_REVIEW) {
        throw conflict('Only an IN_REVIEW task can be decided');
      }
      const submission = await tx.taskSubmission.findFirst({
        where: { id: submissionId, taskId },
      });
      if (!submission) throw notFound();
      const current = await tx.taskSubmission.findFirst({
        where: { taskId, status: SubmissionStatus.PENDING },
      });
      if (
        !current ||
        current.id !== submissionId ||
        submission.status !== SubmissionStatus.PENDING
      ) {
        throw conflict('Only the current PENDING submission can be decided');
      }
      const existingApproval = await tx.taskApproval.findUnique({
        where: { submissionId },
        select: { id: true },
      });
      if (existingApproval)
        throw conflict('This submission already has a decision');

      const now = new Date();
      const reason = reasonInput?.trim() || null;
      const approved = decision === ApprovalDecision.APPROVED;
      const updated = await this.transition(
        tx,
        actor,
        task,
        approved
          ? {
              status: TaskStatus.DONE,
              progressPercent: 100,
              completedAt: now,
              approvedById: actor.id,
              approvedAt: now,
              completionDueAtSnapshot: task.dueAt,
              isBlocked: false,
              blockedReason: null,
            }
          : { status: TaskStatus.IN_PROGRESS },
        now,
      );
      const changed = await tx.taskSubmission.updateMany({
        where: { id: submissionId, taskId, status: SubmissionStatus.PENDING },
        data: { status: decision },
      });
      if (changed.count !== 1) {
        throw conflict('Submission changed before a decision was saved');
      }
      const approval = await tx.taskApproval.create({
        data: {
          taskId,
          submissionId,
          decidedById: actor.id,
          decision,
          reason,
          dueAtSnapshot: approved ? task.dueAt : null,
          decidedAt: now,
        },
      });
      const event = await this.event(
        tx,
        actor,
        task,
        approved ? 'APPROVED' : 'RETURNED',
        approved
          ? reason
            ? `Đã duyệt kết quả: ${reason}`
            : 'Đã duyệt kết quả hoàn thành.'
          : `Đã trả kết quả để bổ sung: ${reason}`,
        {
          status: task.status,
          progressPercent: task.progressPercent,
          submissionId,
          submissionStatus: submission.status,
          completedAt: task.completedAt?.toISOString() ?? null,
          approvedById: task.approvedById,
          approvedAt: task.approvedAt?.toISOString() ?? null,
          completionDueAtSnapshot:
            task.completionDueAtSnapshot?.toISOString() ?? null,
          isBlocked: task.isBlocked,
          blockedReason: task.blockedReason,
        },
        {
          status: updated.status,
          progressPercent: updated.progressPercent,
          submissionId,
          submissionStatus: decision,
          completedAt: updated.completedAt?.toISOString() ?? null,
          approvedById: updated.approvedById,
          approvedAt: updated.approvedAt?.toISOString() ?? null,
          completionDueAtSnapshot:
            updated.completionDueAtSnapshot?.toISOString() ?? null,
          isBlocked: updated.isBlocked,
          blockedReason: updated.blockedReason,
        },
        now,
      );
      await this.notify(tx, task, actor.id, event.id, now, [
        {
          recipientIds: [
            submission.submittedById,
            task.primaryAssigneeId,
          ].filter((id): id is string => Boolean(id)),
          type: approved
            ? NotificationType.SUBMISSION_APPROVED
            : NotificationType.SUBMISSION_RETURNED,
          title: approved ? 'Kết quả đã được duyệt' : 'Kết quả cần bổ sung',
          body: approved
            ? `[${task.code}] ${task.title} đã được duyệt hoàn thành.`
            : `[${task.code}] ${task.title} đã được trả lại.${reason ? ` Lý do: ${reason}` : ''}`,
        },
      ]);
      return { approval, task: publicTask(updated) };
    });
  }

  private async commandTask(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedUser,
    taskId: string,
  ): Promise<Task> {
    const task = await tx.task.findFirst({
      where: { id: taskId, AND: [this.access.readableTaskWhere(actor)] },
    });
    if (!task) throw notFound();
    return task;
  }

  private requireOfficial(task: Task): void {
    if (task.type !== TaskType.OFFICIAL) {
      throw forbidden('This workflow is available for OFFICIAL tasks only');
    }
  }

  private requireLeader(actor: AuthenticatedUser): void {
    if (
      actor.role !== UserRole.MANAGER &&
      actor.role !== UserRole.DEPUTY_MANAGER
    ) {
      throw forbidden('Only MANAGER or DEPUTY_MANAGER can perform this action');
    }
  }

  private async requireTaskOperator(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedUser,
    task: Task,
  ): Promise<void> {
    if (
      !this.access.canOperateOfficial(actor, task) &&
      !(await this.isAssignedWorker(tx, actor, task))
    ) {
      throw forbidden(
        'Only a leader or an assigned worker can perform this action',
      );
    }
  }

  private async isAssignedWorker(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedUser,
    task: Task,
  ): Promise<boolean> {
    if (task.primaryAssigneeId === actor.id) return true;
    return Boolean(
      await tx.taskParticipant.findFirst({
        where: {
          taskId: task.id,
          userId: actor.id,
          role: ParticipantRole.COLLABORATOR,
          invitationStatus: 'ACCEPTED',
        },
        select: { id: true },
      }),
    );
  }

  private async transition(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedUser,
    task: Task,
    data: Prisma.TaskUncheckedUpdateManyInput,
    now: Date,
  ): Promise<Task> {
    const changed = await tx.task.updateMany({
      where: {
        id: task.id,
        version: task.version,
        status: task.status,
        AND: [this.access.readableTaskWhere(actor)],
      },
      data: { ...data, version: { increment: 1 }, updatedAt: now },
    });
    if (changed.count !== 1)
      throw conflict('Task changed while the command was running');
    return tx.task.findUniqueOrThrow({ where: { id: task.id } });
  }

  private async event(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedUser,
    task: Task,
    kind: string,
    note: string,
    before: Prisma.InputJsonObject,
    after: Prisma.InputJsonObject,
    createdAt: Date,
  ) {
    const event = await tx.taskEvent.create({
      data: {
        taskId: task.id,
        actorId: actor.id,
        kind,
        note,
        before,
        after,
        createdAt,
        requestId: this.requestContext.currentRequestId(),
      },
    });
    await tx.realtimeOutbox.create({
      data: {
        type: 'TASK_UPDATED',
        idempotencyKey: `task:${event.id}`,
        businessEventId: event.id,
        taskId: task.id,
        createdAt,
      },
    });
    return event;
  }

  private async activeLeaders(
    tx: Prisma.TransactionClient,
    excludingId: string,
  ): Promise<string[]> {
    const users = await tx.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        role: { in: [UserRole.MANAGER, UserRole.DEPUTY_MANAGER] },
        id: { not: excludingId },
      },
      select: { id: true },
    });
    return users.map((user) => user.id);
  }

  private async lockActiveUser(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<boolean> {
    const active = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM users
      WHERE id = ${userId}::uuid AND status = 'ACTIVE'::"UserStatus"
      FOR SHARE
    `;
    return active.length === 1;
  }

  private async notify(
    tx: Prisma.TransactionClient,
    task: Task,
    actorId: string,
    eventId: string,
    now: Date,
    groups: NotificationGroup[],
  ): Promise<void> {
    const pending = groups.flatMap((group) =>
      group.recipientIds
        .filter((recipientId) => recipientId !== actorId)
        .map((recipientId) => ({ recipientId, group })),
    );
    if (!pending.length) return;
    const active = await tx.user.findMany({
      where: {
        id: { in: [...new Set(pending.map((item) => item.recipientId))] },
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });
    const activeIds = new Set(active.map((user) => user.id));
    const data = pending
      .filter((item) => activeIds.has(item.recipientId))
      .map(({ recipientId, group }) => ({
        recipientId,
        taskId: task.id,
        type: group.type,
        title: group.title,
        body: group.body,
        businessEventId: eventId,
        createdAt: now,
      }));
    if (data.length) {
      await tx.notification.createMany({ data, skipDuplicates: true });
      const persisted = await tx.notification.findMany({
        where: {
          businessEventId: eventId,
          recipientId: { in: data.map((item) => item.recipientId) },
        },
        select: { id: true, recipientId: true },
      });
      if (persisted.length) {
        await tx.realtimeOutbox.createMany({
          data: persisted.map((notification) => ({
            type: 'NOTIFICATION_NEW',
            idempotencyKey: `notification:${notification.id}`,
            businessEventId: eventId,
            taskId: task.id,
            recipientId: notification.recipientId,
            notificationId: notification.id,
            createdAt: now,
          })),
          skipDuplicates: true,
        });
      }
    }
  }

  private async resolveDueDate(
    tx: Prisma.TransactionClient,
    date: string,
  ): Promise<Date> {
    const settings = await tx.appSettings.findUnique({
      where: { id: 1 },
      select: { defaultDueHour: true },
    });
    const hour = String(settings?.defaultDueHour ?? 16).padStart(2, '0');
    return new Date(`${date}T${hour}:00:00+07:00`);
  }
}
