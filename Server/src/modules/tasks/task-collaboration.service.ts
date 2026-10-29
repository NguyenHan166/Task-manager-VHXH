import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InvitationStatus,
  NotificationType,
  ParticipantRole,
  Prisma,
  RequestStatus,
  TaskPriority,
  TaskStatus,
  TaskType,
  UserRole,
  UserStatus,
  type Task,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { TaskAccessPolicy } from '../../common/auth/task-access.policy';
import { RequestContextService } from '../../common/http/request-context.service';
import { BusinessCodeService } from '../../database/business-code.service';
import { PrismaService } from '../../database/prisma.service';
import type { CreateTaskDto, TaskProgressDto, TaskReasonDto, UpdateTaskDto } from './tasks.dto';
import type { AssigneeRequestInputDto, DeadlineRequestInputDto, RequestDecisionDto } from '../collaboration/collaboration.dto';

const bad = (message: string) => new BadRequestException({ code: 'VALIDATION', message });
const conflict = (message: string) => new ConflictException({ code: 'CONFLICT', message });
const forbidden = (message: string) => new ForbiddenException({ code: 'FORBIDDEN', message });
const missing = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Task not found' });
const publicTask = (task: Task) => ({ ...task });
const leader = (actor: AuthenticatedUser) => actor.role !== UserRole.STAFF;

@Injectable()
export class TaskCollaborationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TaskAccessPolicy,
    private readonly codes: BusinessCodeService,
    private readonly requestContext: RequestContextService,
  ) {}

  async isP1Task(taskId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, select: { type: true } });
    if (!task) throw missing();
    return task.type !== TaskType.OFFICIAL;
  }

  async create(actor: AuthenticatedUser, input: CreateTaskDto) {
    if (input.type === TaskType.OFFICIAL) return null;
    if (input.parentTaskId) throw bad('Create subtasks through the parent task endpoint');
    if (input.dueAt && input.dueDate) throw bad('Provide either dueAt or dueDate, not both');
    const collaborators = input.collaboratorIds ?? [];
    const watchers = input.watcherIds ?? [];
    const participants = [...collaborators, ...watchers];
    if (new Set(participants).size !== participants.length) throw bad('A user cannot be both collaborator and watcher');
    if (input.type === TaskType.PERSONAL && (participants.length || input.primaryAssigneeId)) throw bad('PERSONAL tasks cannot have participants or another assignee');
    if (participants.includes(actor.id) || (input.primaryAssigneeId && participants.includes(input.primaryAssigneeId))) throw bad('Creator and primary assignee cannot be participants');
    const project = input.projectId ? await this.prisma.project.findUnique({ where: { id: input.projectId } }) : null;
    if (input.projectId && !project) throw bad('Project not found');
    if (project && project.status !== 'ACTIVE') throw conflict('Archived projects cannot receive new tasks');
    if (project && !leader(actor) && project.ownerId !== actor.id) throw forbidden('Only project owner or leaders can add tasks to this project');
    const ids = [...new Set([...participants, ...(input.primaryAssigneeId ? [input.primaryAssigneeId] : [])])];
    const activeUsers = ids.length ? await this.prisma.user.count({ where: { id: { in: ids }, status: UserStatus.ACTIVE } }) : 0;
    if (activeUsers !== ids.length) throw bad('Assignee and participants must be active users');
    const dueAt = await this.resolveDueAt(input);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const code = await this.codes.allocate(tx, input.type === TaskType.TEAM ? 'NH' : 'CN', now);
      const task = await tx.task.create({
        data: {
          code, type: input.type, title: input.title, description: input.description ?? '', deliverable: input.deliverable ?? '',
          status: TaskStatus.TODO, priority: input.priority ?? TaskPriority.NORMAL,
          createdById: actor.id, primaryAssigneeId: input.type === TaskType.TEAM ? input.primaryAssigneeId ?? null : null,
          assignedAt: input.primaryAssigneeId ? now : null, dueAt, projectId: input.projectId ?? null, createdAt: now,
        },
      });
      const participantData = [
        ...collaborators.map((userId) => ({ taskId: task.id, userId, role: ParticipantRole.COLLABORATOR, invitationStatus: InvitationStatus.PENDING, invitedAt: now })),
        ...watchers.map((userId) => ({ taskId: task.id, userId, role: ParticipantRole.WATCHER, invitationStatus: InvitationStatus.PENDING, invitedAt: now })),
      ];
      if (participantData.length) await tx.taskParticipant.createMany({ data: participantData });
      const event = await this.recordEvent(tx, task, actor.id, 'CREATED', { code, type: input.type, status: task.status }, { code, type: input.type, status: task.status, title: task.title }, now);
      if (participantData.length) await this.notify(tx, participantData.map((participant) => participant.userId), task, event.id, now, NotificationType.TEAM_INVITED, 'Bạn được mời tham gia việc nhóm', `Bạn được mời tham gia [${task.code}] ${task.title}.`);
      return publicTask(task);
    });
  }

  async update(actor: AuthenticatedUser, taskId: string, input: UpdateTaskDto) {
    const task = await this.readableTask(actor, taskId);
    if (task.type === TaskType.OFFICIAL) return null;
    if (task.createdById !== actor.id) throw forbidden('Only the creator can edit TEAM/PERSONAL task details');
      if (task.status === TaskStatus.DONE || task.status === TaskStatus.CANCELLED) throw conflict('Completed or cancelled tasks are read-only');
    if (input.projectId !== undefined) {
      if (input.projectId) {
        const project = await this.prisma.project.findUnique({ where: { id: input.projectId } });
        if (!project || project.status !== 'ACTIVE') throw bad('Project must exist and be active');
        if (!leader(actor) && project.ownerId !== actor.id) throw forbidden('Only project owner or leaders can add tasks to this project');
      }
    }
    const { dueAt: _dueAt, primaryAssigneeId: _assignee, ...safe } = input as UpdateTaskDto & { dueAt?: unknown; primaryAssigneeId?: unknown };
    const updated = await this.prisma.task.update({ where: { id: task.id }, data: { ...safe, version: { increment: 1 } } });
    if (updated.projectId !== task.projectId || updated.title !== task.title || updated.description !== task.description || updated.deliverable !== task.deliverable || updated.priority !== task.priority) {
      await this.prisma.$transaction((tx) => this.recordEvent(tx, task, actor.id, 'DETAILS_UPDATED', { projectId: task.projectId, title: task.title }, { projectId: updated.projectId, title: updated.title }));
    }
    return publicTask(updated);
  }

  async pendingInvitations(actor: AuthenticatedUser) {
    return this.prisma.taskParticipant.findMany({
      where: { userId: actor.id, invitationStatus: InvitationStatus.PENDING, task: { type: TaskType.TEAM, archivedAt: null } },
      select: { id: true, role: true, invitedAt: true, task: { select: { id: true, code: true, title: true, creator: { select: { displayName: true } } } } },
      orderBy: [{ invitedAt: 'desc' }, { id: 'desc' }],
    }).then((items) => items.map((item) => ({ ...item, task: { code: item.task.code, title: item.task.title.slice(0, 80), creator: item.task.creator } })));
  }

  async respondInvitationById(actor: AuthenticatedUser, participantId: string, status: 'ACCEPTED' | 'DECLINED') {
    const participant = await this.prisma.taskParticipant.findFirst({ where: { id: participantId, userId: actor.id, invitationStatus: InvitationStatus.PENDING, task: { type: TaskType.TEAM, archivedAt: null } }, select: { taskId: true } });
    if (!participant) throw missing();
    return this.respondInvitation(actor, participant.taskId, participantId, status);
  }

  async respondInvitation(actor: AuthenticatedUser, taskId: string, participantId: string, status: 'ACCEPTED' | 'DECLINED') {
    return this.prisma.$transaction(async (tx) => {
      const participant = await tx.taskParticipant.findFirst({ where: { id: participantId, taskId, userId: actor.id, invitationStatus: InvitationStatus.PENDING, task: { type: TaskType.TEAM, archivedAt: null } }, include: { task: true } });
      if (!participant) throw missing();
      const now = new Date();
      const changed = await tx.taskParticipant.updateMany({ where: { id: participant.id, invitationStatus: InvitationStatus.PENDING }, data: { invitationStatus: status, respondedAt: now } });
      if (changed.count !== 1) throw conflict('Invitation was already answered');
      await this.recordEvent(tx, participant.task, actor.id, 'TEAM_INVITE_RESPONDED', 'Lời mời đã được phản hồi.', { invitationStatus: 'PENDING' }, { participantId, invitationStatus: status }, now);
      return { id: participant.id, role: participant.role, invitationStatus: status, invitedAt: participant.invitedAt, respondedAt: now };
    });
  }

  async start(actor: AuthenticatedUser, taskId: string) {
    return this.commandP1(actor, taskId, async (tx, task) => {
      this.requireOperator(actor, task);
      if (task.status !== TaskStatus.TODO) throw conflict('Only a TODO task can be started');
      const now = new Date();
      const changed = await tx.task.updateMany({ where: { id: task.id, version: task.version, status: TaskStatus.TODO }, data: { status: TaskStatus.IN_PROGRESS, version: { increment: 1 } } });
      if (changed.count !== 1) throw conflict('Task changed during start');
      const updated = await tx.task.findUniqueOrThrow({ where: { id: task.id } });
      await this.recordEvent(tx, task, actor.id, 'STARTED', 'Đã bắt đầu thực hiện.', { status: task.status }, { status: updated.status }, now);
      return publicTask(updated);
    });
  }

  async progress(actor: AuthenticatedUser, taskId: string, input: TaskProgressDto) {
    if (input.isBlocked && !input.blockedReason?.trim()) throw bad('blockedReason is required when isBlocked is true');
    return this.commandP1(actor, taskId, async (tx, task) => {
      this.requireOperator(actor, task);
      if (task.status !== TaskStatus.TODO && task.status !== TaskStatus.IN_PROGRESS) throw conflict('Progress can only be changed on an active task');
      const now = new Date();
      const nextStatus = task.status === TaskStatus.TODO && input.progressPercent > 0 ? TaskStatus.IN_PROGRESS : task.status;
      const updated = await tx.task.update({ where: { id: task.id }, data: { progressPercent: input.progressPercent, isBlocked: input.isBlocked, blockedReason: input.isBlocked ? input.blockedReason!.trim() : null, status: nextStatus, version: { increment: 1 } } });
      await this.recordEvent(tx, task, actor.id, 'PROGRESS_UPDATED', `Tiến độ ${input.progressPercent}%.`, { status: task.status, progressPercent: task.progressPercent, isBlocked: task.isBlocked }, { status: updated.status, progressPercent: updated.progressPercent, isBlocked: updated.isBlocked }, now);
      return publicTask(updated);
    });
  }

  async complete(actor: AuthenticatedUser, taskId: string) {
    return this.commandP1(actor, taskId, async (tx, task) => {
      this.requireOperator(actor, task);
      if (task.status !== TaskStatus.IN_PROGRESS) throw conflict('Only an IN_PROGRESS task can be completed');
      const now = new Date();
      const changed = await tx.task.updateMany({ where: { id: task.id, version: task.version, status: TaskStatus.IN_PROGRESS }, data: { status: TaskStatus.DONE, progressPercent: 100, completedAt: now, completionDueAtSnapshot: task.dueAt, version: { increment: 1 } } });
      if (changed.count !== 1) throw conflict('Task changed during completion');
      const updated = await tx.task.findUniqueOrThrow({ where: { id: task.id } });
      await this.recordEvent(tx, task, actor.id, 'COMPLETED', 'Đã xác nhận hoàn thành.', { status: task.status }, { status: updated.status, completedAt: now.toISOString() }, now);
      return publicTask(updated);
    });
  }

  async cancel(actor: AuthenticatedUser, taskId: string, input: TaskReasonDto) {
    return this.commandP1(actor, taskId, async (tx, task) => {
      if (task.createdById !== actor.id) throw forbidden('Only the creator can cancel this task');
      if (task.status !== TaskStatus.TODO && task.status !== TaskStatus.IN_PROGRESS) throw conflict('This task cannot be cancelled in its current state');
      const now = new Date();
      const updated = await tx.task.update({ where: { id: task.id }, data: { status: TaskStatus.CANCELLED, version: { increment: 1 } } });
      await this.recordEvent(tx, task, actor.id, 'CANCELLED', input.reason, { status: task.status }, { status: updated.status }, now);
      return publicTask(updated);
    });
  }

  async reopen(actor: AuthenticatedUser, taskId: string, input: TaskReasonDto) {
    return this.commandP1(actor, taskId, async (tx, task) => {
      if (task.createdById !== actor.id) throw forbidden('Only the creator can reopen this task');
      if (task.status !== TaskStatus.DONE && task.status !== TaskStatus.CANCELLED) throw conflict('Only a completed or cancelled task can be reopened');
      const nextStatus = task.status === TaskStatus.DONE || task.progressPercent > 0 ? TaskStatus.IN_PROGRESS : TaskStatus.TODO;
      const now = new Date();
      const updated = await tx.task.update({ where: { id: task.id }, data: { status: nextStatus, completedAt: null, completionDueAtSnapshot: null, approvedAt: null, approvedById: null, version: { increment: 1 } } });
      await this.recordEvent(tx, task, actor.id, 'REOPENED', input.reason, { status: task.status }, { status: updated.status }, now);
      return publicTask(updated);
    });
  }

  async deletePersonal(actor: AuthenticatedUser, taskId: string) {
    return this.commandP1(actor, taskId, async (tx, task) => {
      if (task.type !== TaskType.PERSONAL || task.createdById !== actor.id) throw missing();
      if (task.status === TaskStatus.DONE || task.status === TaskStatus.CANCELLED) throw conflict('Only active PERSONAL tasks can be deleted');
      const now = new Date();
      const updated = await tx.task.update({ where: { id: task.id }, data: { archivedAt: now, version: { increment: 1 } } });
      await this.recordEvent(tx, task, actor.id, 'DELETED', 'Đã ẩn nhiệm vụ cá nhân.', { archivedAt: null }, { archivedAt: now.toISOString() }, now);
      return publicTask(updated);
    });
  }

  async convertTeam(actor: AuthenticatedUser, taskId: string, input: { primaryAssigneeId: string; dueAt: string; priority?: TaskPriority }) {
    if (!leader(actor)) throw forbidden('Only leaders can convert TEAM tasks');
    return this.commandP1(actor, taskId, async (tx, task) => {
      if (task.type !== TaskType.TEAM || task.status === TaskStatus.DONE || task.status === TaskStatus.CANCELLED) throw conflict('Only an active TEAM task can be converted');
      const assignee = await tx.user.findFirst({ where: { id: input.primaryAssigneeId, status: UserStatus.ACTIVE }, select: { id: true } });
      if (!assignee) throw bad('The new primary assignee must be active');
      const oldCode = task.code;
      const newCode = await this.codes.allocate(tx, 'CV', new Date());
      const updated = await tx.task.update({ where: { id: task.id }, data: { type: TaskType.OFFICIAL, code: newCode, createdById: actor.id, primaryAssigneeId: assignee.id, assignedAt: new Date(), dueAt: new Date(input.dueAt), priority: input.priority ?? task.priority, status: TaskStatus.DRAFT, version: { increment: 1 } } });
      await this.recordEvent(tx, task, actor.id, 'TYPE_CHANGED', 'Chuyển việc nhóm thành nhiệm vụ chính thức.', { type: TaskType.TEAM, code: oldCode }, { type: TaskType.OFFICIAL, code: newCode, previousTeamCode: oldCode }, new Date());
      return publicTask(updated);
    });
  }

  async createSubtask(actor: AuthenticatedUser, parentId: string, input: { title: string; primaryAssigneeId: string; dueAt?: string | null; priority?: TaskPriority; deliverable?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const parent = await tx.task.findFirst({ where: { id: parentId, AND: [this.access.readableTaskWhere(actor)] } });
      if (!parent) throw missing();
      if ((parent.type !== TaskType.OFFICIAL && parent.type !== TaskType.TEAM) || parent.status === TaskStatus.DONE || parent.status === TaskStatus.CANCELLED) throw conflict('Subtasks require an active OFFICIAL or TEAM parent');
      if (parent.type === TaskType.OFFICIAL && !leader(actor)) throw forbidden('Only leaders can create an OFFICIAL subtask');
      if (parent.type === TaskType.TEAM && parent.createdById !== actor.id && parent.primaryAssigneeId !== actor.id) throw forbidden('Only the TEAM creator or assignee can create a subtask');
      if (parent.parentTaskId) {
        const grandparent = await tx.task.findUnique({ where: { id: parent.parentTaskId }, select: { parentTaskId: true } });
        if (grandparent?.parentTaskId) throw bad('Subtasks are limited to two levels');
      }
      const assignee = await tx.user.findFirst({ where: { id: input.primaryAssigneeId, status: UserStatus.ACTIVE }, select: { id: true } });
      if (!assignee) throw bad('Subtask assignee must be active');
      const dueAt = input.dueAt ? new Date(input.dueAt) : null;
      if (dueAt && parent.dueAt && dueAt > parent.dueAt) throw bad('Subtask dueAt cannot be later than its parent');
      const now = new Date();
      const prefix = parent.type === TaskType.TEAM ? 'NH' : 'CV';
      const code = await this.codes.allocate(tx, prefix, now);
      const task = await tx.task.create({ data: { code, type: parent.type, title: input.title, deliverable: input.deliverable ?? '', status: TaskStatus.TODO, priority: input.priority ?? parent.priority, createdById: actor.id, primaryAssigneeId: assignee.id, assignedAt: now, dueAt, projectId: parent.projectId, parentTaskId: parent.id, createdAt: now } });
      await this.recordEvent(tx, task, actor.id, 'CREATED', 'Tạo việc con.', { parentTaskId: parent.id }, { parentTaskId: parent.id, code }, now);
      return publicTask(task);
    });
  }

  async createDeadlineRequest(actor: AuthenticatedUser, taskId: string, input: DeadlineRequestInputDto) {
    return this.mapConcurrentConflict(this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({ where: { id: taskId, AND: [this.access.readableTaskWhere(actor)] } });
      if (!task) throw missing();
      if (task.type !== TaskType.OFFICIAL || task.primaryAssigneeId !== actor.id || (task.status !== TaskStatus.TODO && task.status !== TaskStatus.IN_PROGRESS)) throw forbidden('Only the primary assignee of an active OFFICIAL task can request a deadline change');
      const proposed = new Date(input.proposedDueAt);
      if (task.dueAt && proposed <= task.dueAt) throw bad('The proposed deadline must be later than the current deadline');
      const pending = await tx.taskDeadlineRequest.findFirst({ where: { taskId, status: RequestStatus.PENDING }, select: { id: true } });
      if (pending) throw conflict('A deadline request is already pending for this task');
      const request = await tx.taskDeadlineRequest.create({ data: { taskId, requestedById: actor.id, proposedDueAt: proposed, reason: input.reason } });
      const event = await this.recordEvent(tx, task, actor.id, 'DEADLINE_REQUESTED', input.reason, { dueAt: task.dueAt?.toISOString() ?? null }, { requestId: request.id, proposedDueAt: proposed.toISOString() });
      const leaders = await tx.user.findMany({ where: { role: { in: [UserRole.MANAGER, UserRole.DEPUTY_MANAGER] }, status: UserStatus.ACTIVE }, select: { id: true } });
      await this.notify(tx, leaders.map((row) => row.id), task, event.id, new Date(), NotificationType.DEADLINE_REQUESTED, 'Đề nghị gia hạn mới', `[${task.code}] ${task.title} đang chờ quyết định gia hạn.`);
      return request;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }), 'A deadline request is already pending for this task');
  }

  async createAssigneeRequest(actor: AuthenticatedUser, taskId: string, input: AssigneeRequestInputDto) {
    return this.mapConcurrentConflict(this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({ where: { id: taskId, AND: [this.access.readableTaskWhere(actor)] } });
      if (!task) throw missing();
      if (task.type !== TaskType.OFFICIAL || task.primaryAssigneeId !== actor.id || (task.status !== TaskStatus.TODO && task.status !== TaskStatus.IN_PROGRESS)) throw forbidden('Only the primary assignee of an active OFFICIAL task can request an assignee change');
      const target = await tx.user.findFirst({ where: { id: input.proposedAssigneeId, status: UserStatus.ACTIVE }, select: { id: true } });
      if (!target) throw bad('The proposed assignee must be active');
      const pending = await tx.taskAssigneeRequest.findFirst({ where: { taskId, status: RequestStatus.PENDING }, select: { id: true } });
      if (pending) throw conflict('An assignee request is already pending for this task');
      const request = await tx.taskAssigneeRequest.create({ data: { taskId, requestedById: actor.id, proposedAssigneeId: target.id, reason: input.reason } });
      const event = await this.recordEvent(tx, task, actor.id, 'ASSIGNEE_REQUESTED', input.reason, { primaryAssigneeId: task.primaryAssigneeId }, { requestId: request.id, proposedAssigneeId: target.id });
      const leaders = await tx.user.findMany({ where: { role: { in: [UserRole.MANAGER, UserRole.DEPUTY_MANAGER] }, status: UserStatus.ACTIVE }, select: { id: true } });
      await this.notify(tx, leaders.map((row) => row.id), task, event.id, new Date(), NotificationType.ASSIGNEE_REQUESTED, 'Đề nghị đổi người chủ trì mới', `[${task.code}] ${task.title} đang chờ quyết định đổi chủ trì.`);
      return request;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }), 'An assignee request is already pending for this task');
  }

  async deadlineRequests(actor: AuthenticatedUser, taskId: string) {
    await this.readableTask(actor, taskId);
    return this.prisma.taskDeadlineRequest.findMany({ where: { taskId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  }

  async assigneeRequests(actor: AuthenticatedUser, taskId: string) {
    await this.readableTask(actor, taskId);
    return this.prisma.taskAssigneeRequest.findMany({ where: { taskId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  }

  async decideDeadline(actor: AuthenticatedUser, taskId: string, requestId: string, input: RequestDecisionDto) {
    if (!leader(actor)) throw forbidden('Only leaders can decide requests');
    return this.mapConcurrentConflict(this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({ where: { id: taskId } });
      if (!task || task.type !== TaskType.OFFICIAL) throw missing();
      const request = await tx.taskDeadlineRequest.findFirst({ where: { id: requestId, taskId, status: RequestStatus.PENDING } });
      if (!request) throw conflict('Request is no longer pending');
      const now = new Date();
      const changed = await tx.taskDeadlineRequest.updateMany({ where: { id: requestId, status: RequestStatus.PENDING }, data: { status: input.decision, decidedById: actor.id, decidedAt: now, decisionReason: input.reason ?? null } });
      if (changed.count !== 1) throw conflict('Request was decided concurrently');
      if (input.decision === 'APPROVED') await tx.task.update({ where: { id: taskId }, data: { dueAt: request.proposedDueAt, version: { increment: 1 } } });
      const event = await this.recordEvent(tx, task, actor.id, 'DEADLINE_REQUEST_DECIDED', input.reason ?? '', { requestId, status: 'PENDING', dueAt: task.dueAt?.toISOString() ?? null }, { status: input.decision, dueAt: input.decision === 'APPROVED' ? request.proposedDueAt.toISOString() : task.dueAt?.toISOString() ?? null });
      if (input.decision === 'APPROVED') await this.recordEvent(tx, task, actor.id, 'DEADLINE_CHANGED', input.reason ?? '', { dueAt: task.dueAt?.toISOString() ?? null }, { dueAt: request.proposedDueAt.toISOString() });
      await this.notify(tx, [request.requestedById], task, event.id, now, NotificationType.REQUEST_DECIDED, 'Đề nghị gia hạn đã được xử lý', `[${task.code}] ${input.decision === 'APPROVED' ? 'đã được gia hạn' : 'không được gia hạn'}.`);
      return { ...request, status: input.decision, decidedById: actor.id, decidedAt: now, decisionReason: input.reason ?? null };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }), 'Deadline request was decided concurrently');
  }

  async decideAssignee(actor: AuthenticatedUser, taskId: string, requestId: string, input: RequestDecisionDto) {
    if (!leader(actor)) throw forbidden('Only leaders can decide requests');
    return this.mapConcurrentConflict(this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({ where: { id: taskId } });
      if (!task || task.type !== TaskType.OFFICIAL) throw missing();
      const request = await tx.taskAssigneeRequest.findFirst({ where: { id: requestId, taskId, status: RequestStatus.PENDING } });
      if (!request) throw conflict('Request is no longer pending');
      const now = new Date();
      const changed = await tx.taskAssigneeRequest.updateMany({ where: { id: requestId, status: RequestStatus.PENDING }, data: { status: input.decision, decidedById: actor.id, decidedAt: now, decisionReason: input.reason ?? null } });
      if (changed.count !== 1) throw conflict('Request was decided concurrently');
      if (input.decision === 'APPROVED') await tx.task.update({ where: { id: taskId }, data: { primaryAssigneeId: request.proposedAssigneeId, assignedAt: now, version: { increment: 1 } } });
      const event = await this.recordEvent(tx, task, actor.id, 'ASSIGNEE_REQUEST_DECIDED', input.reason ?? '', { requestId, status: 'PENDING', primaryAssigneeId: task.primaryAssigneeId }, { status: input.decision, primaryAssigneeId: input.decision === 'APPROVED' ? request.proposedAssigneeId : task.primaryAssigneeId });
      if (input.decision === 'APPROVED') await this.recordEvent(tx, task, actor.id, 'ASSIGNEE_CHANGED', input.reason ?? '', { primaryAssigneeId: task.primaryAssigneeId }, { primaryAssigneeId: request.proposedAssigneeId });
      const recipients = input.decision === 'APPROVED' ? [request.requestedById, request.proposedAssigneeId] : [request.requestedById];
      await this.notify(tx, recipients, task, event.id, now, NotificationType.REQUEST_DECIDED, 'Đề nghị đổi người chủ trì đã được xử lý', `[${task.code}] ${input.decision === 'APPROVED' ? 'đã đổi người chủ trì' : 'không được đổi người chủ trì'}.`);
      return { ...request, status: input.decision, decidedById: actor.id, decidedAt: now, decisionReason: input.reason ?? null };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }), 'Assignee request was decided concurrently');
  }

  private async mapConcurrentConflict<T>(operation: Promise<T>, message: string): Promise<T> {
    try {
      return await operation;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2034')
      ) {
        throw conflict(message);
      }
      throw error;
    }
  }

  private async commandP1<T>(actor: AuthenticatedUser, taskId: string, action: (tx: Prisma.TransactionClient, task: Task) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({ where: { id: taskId, AND: [this.access.readableTaskWhere(actor)] } });
      if (!task) throw missing();
      if (task.type === TaskType.OFFICIAL) throw bad('This command applies only to TEAM/PERSONAL tasks');
      return action(tx, task);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async readableTask(actor: AuthenticatedUser, taskId: string) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, AND: [this.access.readableTaskWhere(actor)] } });
    if (!task) throw missing();
    return task;
  }

  private requireOperator(actor: AuthenticatedUser, task: Task) {
    if (task.type === TaskType.PERSONAL) {
      if (task.createdById !== actor.id) throw forbidden('Only the PERSONAL task creator can operate it');
      return;
    }
    if (task.type !== TaskType.TEAM || (task.createdById !== actor.id && task.primaryAssigneeId !== actor.id)) throw forbidden('Only the TEAM creator or primary assignee can operate it');
  }

  private async resolveDueAt(input: CreateTaskDto): Promise<Date | null> {
    if (input.dueAt) return new Date(input.dueAt);
    if (!input.dueDate) return null;
    const settings = await this.prisma.appSettings.findUnique({ where: { id: 1 }, select: { defaultDueHour: true } });
    return new Date(`${input.dueDate}T${String(settings?.defaultDueHour ?? 16).padStart(2, '0')}:00:00+07:00`);
  }

  private async recordEvent(tx: Prisma.TransactionClient, task: Pick<Task, 'id'>, actorId: string, kind: string, fifth?: string | Prisma.InputJsonValue, sixth?: Prisma.InputJsonValue, seventh?: Prisma.InputJsonValue | Date, eighth?: Date) {
    const note = typeof fifth === 'string' ? fifth : '';
    const before = typeof fifth === 'string' ? sixth : fifth;
    const after = typeof fifth === 'string' ? seventh as Prisma.InputJsonValue | undefined : sixth;
    const at = typeof fifth === 'string' ? eighth ?? new Date() : seventh instanceof Date ? seventh : new Date();
    const event = await tx.taskEvent.create({ data: { taskId: task.id, actorId, kind, note, before: before ?? Prisma.JsonNull, after: after ?? Prisma.JsonNull, requestId: this.requestContext.currentRequestId(), createdAt: at } });
    await tx.realtimeOutbox.create({ data: { type: 'TASK_UPDATED', idempotencyKey: `task:${event.id}`, businessEventId: event.id, taskId: task.id, createdAt: at } });
    return event;
  }

  private async notify(tx: Prisma.TransactionClient, recipients: string[], task: Pick<Task, 'id' | 'code' | 'title'>, eventId: string, at: Date, type: NotificationType, title: string, body: string) {
    const unique = [...new Set(recipients)];
    if (!unique.length) return;
    await tx.notification.createMany({ data: unique.map((recipientId) => ({ recipientId, taskId: task.id, type, title, body, businessEventId: eventId, createdAt: at })), skipDuplicates: true });
    const notifications = await tx.notification.findMany({ where: { businessEventId: eventId, recipientId: { in: unique } }, select: { id: true, recipientId: true, createdAt: true } });
    await tx.realtimeOutbox.createMany({ data: notifications.map((notification) => ({ type: 'NOTIFICATION_NEW' as const, idempotencyKey: `notification:${notification.id}`, businessEventId: eventId, taskId: task.id, recipientId: notification.recipientId, notificationId: notification.id, createdAt: notification.createdAt })), skipDuplicates: true });
  }
}
