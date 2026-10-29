import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, TaskPriority, TaskStatus, TaskType, UserRole, UserStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { BusinessCodeService } from '../../database/business-code.service';
import { PrismaService } from '../../database/prisma.service';
import { RecurrenceRuleInputDto, RecurrenceRulePatchDto } from './collaboration.dto';

const bad = (message: string) => new BadRequestException({ code: 'VALIDATION', message });
const forbidden = () => new ForbiddenException({ code: 'FORBIDDEN', message: 'Only leaders can manage recurrence rules' });
const notFound = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Recurrence rule not found' });

@Injectable()
export class RecurrenceService {
  private readonly logger = new Logger(RecurrenceService.name);
  constructor(private readonly prisma: PrismaService, private readonly codes: BusinessCodeService) {}

  async listRules(actor: AuthenticatedUser) {
    const where: Prisma.RecurrenceRuleWhereInput = actor.role === UserRole.STAFF
      ? { OR: [{ scope: 'ALL' }, { assignees: { some: { userId: actor.id } } }] }
      : {};
    return this.prisma.recurrenceRule.findMany({
      where,
      include: { assignees: { select: { userId: true } } },
      orderBy: [{ nextRunAt: 'asc' }, { id: 'asc' }],
    }).then((rules) => rules.map((rule) => ({ ...rule, assigneeIds: rule.assignees.map((a) => a.userId) })));
  }

  async listInstances(actor: AuthenticatedUser) {
    const items = await this.prisma.recurrenceInstance.findMany({
      where: actor.role === UserRole.STAFF ? { tasks: { some: { userId: actor.id } } } : {},
      include: { tasks: { where: actor.role === UserRole.STAFF ? { userId: actor.id } : undefined, select: { taskId: true, userId: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return items.map((item) => ({ id: item.id, ruleId: item.ruleId, periodKey: item.periodKey, taskId: item.tasks[0]?.taskId ?? '', taskIds: item.tasks.map((row) => row.taskId), createdAt: item.createdAt }));
  }

  async createRule(actor: AuthenticatedUser, input: RecurrenceRuleInputDto) {
    this.requireLeader(actor);
    this.validateAssignees(input.scope, input.assigneeIds ?? []);
    await this.assertActiveStaff(input.scope === 'CUSTOM' ? input.assigneeIds ?? [] : []);
    return this.prisma.recurrenceRule.create({
      data: {
        title: input.title,
        description: input.description ?? '',
        ownerId: actor.id,
        scope: input.scope,
        priority: input.priority,
        frequency: input.frequency,
        dueAfterHours: input.dueAfterHours,
        nextRunAt: new Date(input.nextRunAt),
        assignees: { create: (input.assigneeIds ?? []).map((userId) => ({ userId })) },
      },
      include: { assignees: { select: { userId: true } } },
    }).then((rule) => ({ ...rule, assigneeIds: rule.assignees.map((a) => a.userId) }));
  }

  async updateRule(actor: AuthenticatedUser, id: string, input: RecurrenceRulePatchDto) {
    this.requireLeader(actor);
    const current = await this.prisma.recurrenceRule.findUnique({ where: { id } });
    if (!current) throw notFound();
    const scope = input.scope ?? current.scope;
    const assigneeIds = input.assigneeIds;
    this.validateAssignees(scope, assigneeIds ?? (scope === 'CUSTOM' ? (await this.assigneeIds(id)) : []));
    if (scope === 'CUSTOM') await this.assertActiveStaff(assigneeIds ?? await this.assigneeIds(id));
    return this.prisma.$transaction(async (tx) => {
      if (assigneeIds !== undefined) {
        await tx.recurrenceRuleAssignee.deleteMany({ where: { ruleId: id } });
        if (assigneeIds.length) await tx.recurrenceRuleAssignee.createMany({ data: assigneeIds.map((userId) => ({ ruleId: id, userId })) });
      }
      const rule = await tx.recurrenceRule.update({
        where: { id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          scope,
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
          ...(input.dueAfterHours !== undefined ? { dueAfterHours: input.dueAfterHours } : {}),
          ...(input.nextRunAt !== undefined ? { nextRunAt: new Date(input.nextRunAt) } : {}),
        },
        include: { assignees: { select: { userId: true } } },
      });
      return { ...rule, assigneeIds: rule.assignees.map((a) => a.userId) };
    });
  }

  async deleteRule(actor: AuthenticatedUser, id: string) {
    this.requireLeader(actor);
    const changed = await this.prisma.recurrenceRule.updateMany({ where: { id }, data: { active: false } });
    if (!changed.count) throw notFound();
    return { id, active: false };
  }

  async toggleRule(actor: AuthenticatedUser, id: string, active: boolean) {
    this.requireLeader(actor);
    const changed = await this.prisma.recurrenceRule.updateMany({ where: { id }, data: { active } });
    if (!changed.count) throw notFound();
    return this.prisma.recurrenceRule.findUniqueOrThrow({ where: { id }, include: { assignees: { select: { userId: true } } } }).then((rule) => ({ ...rule, assigneeIds: rule.assignees.map((a) => a.userId) }));
  }

  async generate(actor: AuthenticatedUser, id: string) {
    this.requireLeader(actor);
    const rule = await this.prisma.recurrenceRule.findUnique({ where: { id }, include: { assignees: true } });
    if (!rule) throw notFound();
    if (!rule.active) throw new ConflictException({ code: 'CONFLICT', message: 'Recurrence rule is paused' });
    return this.generatePeriod(rule.id, new Date());
  }

  @Cron('0 * * * *')
  async generateDueRules() {
    const now = new Date();
    const due = await this.prisma.recurrenceRule.findMany({ where: { active: true, nextRunAt: { lte: now } }, select: { id: true }, take: 100 });
    for (const rule of due) {
      try { await this.generatePeriod(rule.id, now); }
      catch (error) { this.logger.warn(`Recurrence rule ${rule.id} was not generated: ${error instanceof Error ? error.message : 'unknown error'}`); }
    }
  }

  private async generatePeriod(ruleId: string, now: Date) {
    return this.mapConcurrentConflict(this.prisma.$transaction(async (tx) => {
      const rule = await tx.recurrenceRule.findUnique({ where: { id: ruleId }, include: { assignees: true } });
      if (!rule) throw notFound();
      if (!rule.active) throw new ConflictException({ code: 'CONFLICT', message: 'Recurrence rule is paused' });
      const periodKey = this.periodKey(rule.nextRunAt, rule.frequency);
      const created = await tx.recurrenceInstance.createMany({ data: [{ ruleId, periodKey }], skipDuplicates: true });
      if (created.count === 0) throw new ConflictException({ code: 'CONFLICT', message: `Period ${periodKey} already generated` });
      const instance = await tx.recurrenceInstance.findUniqueOrThrow({ where: { ruleId_periodKey: { ruleId, periodKey } } });
      const targets = await tx.user.findMany({
        where: {
          status: UserStatus.ACTIVE,
          role: UserRole.STAFF,
          ...(rule.scope === 'CUSTOM' ? { id: { in: rule.assignees.map((a) => a.userId) } } : {}),
        },
        select: { id: true },
        orderBy: { id: 'asc' },
      });
      if (!targets.length) throw new BadRequestException({ code: 'VALIDATION', message: 'No active staff are assigned to this recurrence rule' });
      const createdTasks = [];
      for (const target of targets) {
        const code = await this.codes.allocate(tx, 'CV', now);
        const task = await tx.task.create({
          data: {
            code, type: TaskType.OFFICIAL, title: rule.title, description: rule.description,
            status: TaskStatus.TODO, priority: rule.priority, createdById: rule.ownerId,
            primaryAssigneeId: target.id, assignedAt: now,
            dueAt: new Date(now.getTime() + rule.dueAfterHours * 3_600_000),
          },
        });
        await tx.recurrenceInstanceTask.create({ data: { instanceId: instance.id, userId: target.id, taskId: task.id } });
        await tx.taskEvent.create({ data: { taskId: task.id, actorId: rule.ownerId, kind: 'RECURRENCE_GENERATED', note: `Sinh từ mẫu định kỳ ${rule.title} (${periodKey})`, after: { ruleId, periodKey } } });
        createdTasks.push(task);
      }
      await tx.recurrenceRule.update({ where: { id: ruleId }, data: { nextRunAt: this.nextPeriod(rule.nextRunAt, rule.frequency) } });
      return { instance: { ...instance, taskId: createdTasks[0].id, taskIds: createdTasks.map((task) => task.id) }, tasks: createdTasks, task: createdTasks[0] };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }

  private async mapConcurrentConflict<T>(operation: Promise<T>): Promise<T> {
    try {
      return await operation;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2034')
      ) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'This recurrence period was generated concurrently',
        });
      }
      throw error;
    }
  }

  private async assigneeIds(id: string) {
    const rows = await this.prisma.recurrenceRuleAssignee.findMany({ where: { ruleId: id }, select: { userId: true } });
    return rows.map((row) => row.userId);
  }

  private async assertActiveStaff(ids: string[]) {
    if (!ids.length) return;
    const count = await this.prisma.user.count({ where: { id: { in: ids }, role: UserRole.STAFF, status: UserStatus.ACTIVE } });
    if (count !== new Set(ids).size) throw bad('CUSTOM assignees must be active staff');
  }

  private validateAssignees(scope: string, ids: string[]) {
    if (scope === 'CUSTOM' && !ids.length) throw bad('CUSTOM recurrence requires at least one assignee');
    if (scope === 'ALL' && ids.length) throw bad('ALL recurrence cannot include a custom assignee list');
  }

  private requireLeader(actor: AuthenticatedUser) {
    if (actor.role === UserRole.STAFF) throw forbidden();
  }

  private periodKey(date: Date, frequency: string) {
    const local = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    const year = local.getUTCFullYear();
    const month = String(local.getUTCMonth() + 1).padStart(2, '0');
    if (frequency === 'MONTHLY') return `${year}-${month}`;
    const jan1 = new Date(Date.UTC(year, 0, 1));
    const week = Math.ceil(((local.getTime() - jan1.getTime()) / 86_400_000 + jan1.getUTCDay() + 1) / 7);
    return `${year}-W${String(week).padStart(2, '0')}`;
  }

  private nextPeriod(date: Date, frequency: string) {
    const next = new Date(date);
    if (frequency === 'WEEKLY') next.setUTCDate(next.getUTCDate() + 7);
    else next.setUTCMonth(next.getUTCMonth() + 1);
    return next;
  }
}
