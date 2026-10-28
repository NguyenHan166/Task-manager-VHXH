import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InvitationStatus,
  ParticipantRole,
  Prisma,
  TaskStatus,
  TaskType,
  UserRole,
  type User,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { SystemClockService } from '../../common/time/system-clock.service';
import { PrismaService } from '../../database/prisma.service';
import type { DashboardQueryDto, ReportFiltersDto } from './dashboard.dto';

type WorkloadStats = {
  user: Record<string, unknown>;
  primaryCount: number;
  collabCount: number;
  doneCount: number;
  doneOnTimeCount: number;
  onTimeRate: number;
  overdueCount: number;
};

const ACTIVE_STATUSES = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.IN_REVIEW,
];
const PUBLISHED_STATUSES = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.IN_REVIEW,
  TaskStatus.DONE,
];

const invalid = (message: string): BadRequestException =>
  new BadRequestException({ code: 'VALIDATION', message });
const forbidden = (): ForbiddenException =>
  new ForbiddenException({
    code: 'FORBIDDEN',
    message: 'This report scope is not available for your role',
  });

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly clock: SystemClockService,
  ) {}

  async stats(actor: AuthenticatedUser, query: DashboardQueryDto) {
    this.validateFilters(query);
    if (query.scope === 'DEPT') {
      if (
        actor.role !== UserRole.MANAGER &&
        actor.role !== UserRole.DEPUTY_MANAGER
      ) {
        throw forbidden();
      }
      return this.departmentStats(query);
    }
    if (query.primaryAssigneeId && query.primaryAssigneeId !== actor.id) {
      throw forbidden();
    }
    return this.staffStats(actor.id, query);
  }

  async kpiReport(actor: AuthenticatedUser, filters: ReportFiltersDto) {
    this.validateFilters(filters);
    const isLeader =
      actor.role === UserRole.MANAGER || actor.role === UserRole.DEPUTY_MANAGER;
    if (
      !isLeader &&
      filters.primaryAssigneeId &&
      filters.primaryAssigneeId !== actor.id
    ) {
      throw forbidden();
    }

    if (!isLeader) {
      const [summary, workloads] = await Promise.all([
        this.staffStats(actor.id, filters),
        this.workloads(filters, [actor.id], false),
      ]);
      return { scope: 'STAFF' as const, summary, workloads };
    }

    const [summary, users] = await Promise.all([
      this.departmentStats(filters),
      this.prisma.user.findMany({
        where: filters.primaryAssigneeId
          ? { id: filters.primaryAssigneeId }
          : undefined,
        orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
      }),
    ]);
    const workloads = await this.workloads(
      filters,
      users.map((user) => user.id),
      true,
      users,
    );
    return { scope: 'DEPT' as const, summary, workloads };
  }

  private async departmentStats(filters: ReportFiltersDto) {
    const where = this.taskWhere(filters, { type: TaskType.OFFICIAL });
    const groups = await this.prisma.task.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    const counts = new Map(
      groups.map((group) => [group.status, group._count._all]),
    );
    const completedOnTimeCount = await this.rawCount(
      this.rawFilters(filters, TaskType.OFFICIAL),
      Prisma.sql`"status" = 'DONE'::"TaskStatus" AND "completed_at" IS NOT NULL AND "completion_due_at_snapshot" IS NOT NULL AND "completed_at" <= "completion_due_at_snapshot"`,
    );
    const todoCount = counts.get(TaskStatus.TODO) ?? 0;
    const inProgressCount = counts.get(TaskStatus.IN_PROGRESS) ?? 0;
    const inReviewCount = counts.get(TaskStatus.IN_REVIEW) ?? 0;
    const doneCount = counts.get(TaskStatus.DONE) ?? 0;
    return {
      totalActivePublished:
        todoCount + inProgressCount + inReviewCount + doneCount,
      todoCount,
      inProgressCount,
      inReviewCount,
      doneCount,
      overdueCount: await this.prisma.task.count({
        where: {
          AND: [
            where,
            { status: this.filteredStatuses(filters, ACTIVE_STATUSES) },
            { dueAt: { lt: this.clock.now() } },
          ],
        },
      }),
      completedOnTimeCount,
      draftCount: counts.get(TaskStatus.DRAFT) ?? 0,
      cancelledCount: counts.get(TaskStatus.CANCELLED) ?? 0,
      totalOfficialCount: [...counts.values()].reduce(
        (total, value) => total + value,
        0,
      ),
    };
  }

  private async staffStats(userId: string, filters: ReportFiltersDto) {
    const common = this.taskWhere(filters);
    const ownWhere: Prisma.TaskWhereInput = {
      ...common,
      OR: [
        { type: TaskType.OFFICIAL, primaryAssigneeId: userId },
        { type: TaskType.PERSONAL, createdById: userId },
      ],
    };
    const groups = await this.prisma.task.groupBy({
      by: ['status'],
      where: ownWhere,
      _count: { _all: true },
    });
    const counts = new Map(
      groups.map((group) => [group.status, group._count._all]),
    );
    const personalWhere: Prisma.TaskWhereInput = {
      ...common,
      type: TaskType.PERSONAL,
      createdById: userId,
    };
    const ownedDueWhere: Prisma.TaskWhereInput = {
      AND: [
        ownWhere,
        { status: this.filteredStatuses(filters, ACTIVE_STATUSES) },
      ],
    };
    const now = this.clock.now();
    const settings = await this.prisma.appSettings.findUnique({
      where: { id: 1 },
      select: { reminderBeforeHours: true },
    });
    const dueSoonHours =
      settings?.reminderBeforeHours ??
      Number(this.config.get<string>('REMINDER_BEFORE_HOURS', '24'));
    const dueSoonLimit = new Date(now.getTime() + dueSoonHours * 60 * 60_000);
    const collaboratingWhere: Prisma.TaskParticipantWhereInput = {
      userId,
      role: ParticipantRole.COLLABORATOR,
      invitationStatus: InvitationStatus.ACCEPTED,
      task: {
        is: {
          AND: [
            common,
            { type: { in: [TaskType.OFFICIAL, TaskType.TEAM] } },
            { status: { notIn: [TaskStatus.DRAFT, TaskStatus.CANCELLED] } },
            { primaryAssigneeId: { not: userId } },
          ],
        },
      },
    };
    const [overdueCount, dueSoonCount, collaboratingCount, personalCount] =
      await Promise.all([
        this.prisma.task.count({
          where: { ...ownedDueWhere, dueAt: { lt: now } },
        }),
        this.prisma.task.count({
          where: {
            ...ownedDueWhere,
            dueAt: { gte: now, lte: dueSoonLimit },
          },
        }),
        this.prisma.taskParticipant.count({ where: collaboratingWhere }),
        this.prisma.task.count({ where: personalWhere }),
      ]);
    const todoCount = counts.get(TaskStatus.TODO) ?? 0;
    const inProgressCount = counts.get(TaskStatus.IN_PROGRESS) ?? 0;
    const inReviewCount = counts.get(TaskStatus.IN_REVIEW) ?? 0;
    const doneCount = counts.get(TaskStatus.DONE) ?? 0;
    return {
      totalAssigned: PUBLISHED_STATUSES.reduce(
        (total, status) => total + (counts.get(status) ?? 0),
        0,
      ),
      todoCount,
      inProgressCount,
      inReviewCount,
      doneCount,
      overdueCount,
      dueSoonCount,
      collaboratingCount,
      personalCount,
    };
  }

  private async workloads(
    filters: ReportFiltersDto,
    userIds: string[],
    managerView: boolean,
    users?: User[],
  ): Promise<WorkloadStats[]> {
    if (!userIds.length) return [];
    const primaryWhere: Prisma.TaskWhereInput = {
      AND: [
        this.taskWhere(filters, { type: TaskType.OFFICIAL }),
        {
          status: { notIn: [TaskStatus.DRAFT, TaskStatus.CANCELLED] },
          primaryAssigneeId: { in: userIds },
        },
      ],
    };
    const groups = await this.prisma.task.groupBy({
      by: ['primaryAssigneeId', 'status'],
      where: primaryWhere,
      _count: { _all: true },
    });
    const aggregateFilters = this.rawFilters(filters, TaskType.OFFICIAL);
    aggregateFilters.push(
      Prisma.sql`"status" NOT IN ('DRAFT'::"TaskStatus", 'CANCELLED'::"TaskStatus")`,
      Prisma.sql`"primary_assignee_id" IN (${Prisma.join(userIds.map((id) => Prisma.sql`${id}::uuid`))})`,
    );
    const [onTimeRows, overdueRows, collabRows] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{ userId: string; count: bigint }>
      >(Prisma.sql`
        SELECT "primary_assignee_id" AS "userId", count(*) AS "count"
        FROM "tasks"
        WHERE ${Prisma.join(aggregateFilters, ' AND ')}
          AND "status" = 'DONE'::"TaskStatus"
          AND "completed_at" IS NOT NULL
          AND "completion_due_at_snapshot" IS NOT NULL
          AND "completed_at" <= "completion_due_at_snapshot"
        GROUP BY "primary_assignee_id"
      `),
      this.prisma.task.groupBy({
        by: ['primaryAssigneeId'],
        where: {
          AND: [
            primaryWhere,
            { status: this.filteredStatuses(filters, ACTIVE_STATUSES) },
            { dueAt: { lt: this.clock.now() } },
          ],
        },
        _count: { _all: true },
      }),
      this.collaborationAggregates(filters, userIds),
    ]);
    const rowsByUser = new Map<string, Map<TaskStatus, number>>();
    for (const group of groups) {
      if (!group.primaryAssigneeId) continue;
      const values = rowsByUser.get(group.primaryAssigneeId) ?? new Map();
      values.set(group.status, group._count._all);
      rowsByUser.set(group.primaryAssigneeId, values);
    }
    const onTimeByUser = new Map(
      onTimeRows.map((row) => [row.userId, Number(row.count)]),
    );
    const overdueByUser = new Map(
      overdueRows.flatMap((row) =>
        row.primaryAssigneeId
          ? [[row.primaryAssigneeId, row._count._all] as const]
          : [],
      ),
    );
    const collaboratingByUser = new Map(
      collabRows.map((row) => [row.userId, Number(row.count)]),
    );
    const userRecords =
      users ??
      (await this.prisma.user.findMany({
        where: { id: { in: userIds } },
        orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
      }));
    return userRecords.map((user) => {
      const values = rowsByUser.get(user.id);
      const doneCount = values?.get(TaskStatus.DONE) ?? 0;
      const doneOnTimeCount = onTimeByUser.get(user.id) ?? 0;
      return {
        user: managerView ? this.managerUser(user) : this.directoryUser(user),
        primaryCount: [...(values?.values() ?? [])].reduce(
          (total, count) => total + count,
          0,
        ),
        collabCount: collaboratingByUser.get(user.id) ?? 0,
        doneCount,
        doneOnTimeCount,
        onTimeRate:
          doneCount > 0 ? Math.round((doneOnTimeCount / doneCount) * 100) : 0,
        overdueCount: overdueByUser.get(user.id) ?? 0,
      };
    });
  }

  private async collaborationAggregates(
    filters: ReportFiltersDto,
    userIds: string[],
  ): Promise<Array<{ userId: string; count: bigint }>> {
    const clauses = this.rawFilters(filters, undefined, 't');
    clauses.push(
      Prisma.sql`t."type" IN ('OFFICIAL'::"TaskType", 'TEAM'::"TaskType")`,
      Prisma.sql`t."status" NOT IN ('DRAFT'::"TaskStatus", 'CANCELLED'::"TaskStatus")`,
      Prisma.sql`tp."role" = 'COLLABORATOR'::"ParticipantRole"`,
      Prisma.sql`tp."invitation_status" = 'ACCEPTED'::"InvitationStatus"`,
      Prisma.sql`t."primary_assignee_id" IS DISTINCT FROM tp."user_id"`,
      Prisma.sql`tp."user_id" IN (${Prisma.join(userIds.map((id) => Prisma.sql`${id}::uuid`))})`,
    );
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT tp."user_id" AS "userId", count(DISTINCT t."id") AS "count"
      FROM "task_participants" tp
      JOIN "tasks" t ON t."id" = tp."task_id"
      WHERE ${Prisma.join(clauses, ' AND ')}
      GROUP BY tp."user_id"
    `);
  }

  private taskWhere(
    filters: ReportFiltersDto,
    extra: Prisma.TaskWhereInput = {},
  ): Prisma.TaskWhereInput {
    return {
      archivedAt: null,
      ...(filters.fromDate || filters.toDate
        ? {
            createdAt: {
              ...(filters.fromDate ? { gte: new Date(filters.fromDate) } : {}),
              ...(filters.toDate ? { lte: new Date(filters.toDate) } : {}),
            },
          }
        : {}),
      ...(filters.dueFrom || filters.dueTo
        ? {
            dueAt: {
              ...(filters.dueFrom ? { gte: new Date(filters.dueFrom) } : {}),
              ...(filters.dueTo ? { lte: new Date(filters.dueTo) } : {}),
            },
          }
        : {}),
      ...(filters.type && filters.type !== 'ALL' ? { type: filters.type } : {}),
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.primaryAssigneeId
        ? { primaryAssigneeId: filters.primaryAssigneeId }
        : {}),
      ...(filters.priority && filters.priority !== 'ALL'
        ? { priority: filters.priority }
        : {}),
      ...(filters.status && filters.status !== 'ALL'
        ? { status: filters.status }
        : {}),
      ...extra,
    };
  }

  private rawFilters(
    filters: ReportFiltersDto,
    type?: TaskType,
    alias?: 't',
  ): Prisma.Sql[] {
    const column = (name: string) =>
      Prisma.raw(alias ? `${alias}."${name}"` : `"${name}"`);
    const clauses: Prisma.Sql[] = [
      Prisma.sql`${column('archived_at')} IS NULL`,
    ];
    if (type) clauses.push(Prisma.sql`${column('type')} = ${type}::"TaskType"`);
    if (filters.fromDate)
      clauses.push(
        Prisma.sql`${column('created_at')} >= ${new Date(filters.fromDate)}`,
      );
    if (filters.toDate)
      clauses.push(
        Prisma.sql`${column('created_at')} <= ${new Date(filters.toDate)}`,
      );
    if (filters.dueFrom)
      clauses.push(
        Prisma.sql`${column('due_at')} >= ${new Date(filters.dueFrom)}`,
      );
    if (filters.dueTo)
      clauses.push(
        Prisma.sql`${column('due_at')} <= ${new Date(filters.dueTo)}`,
      );
    if (filters.type && filters.type !== 'ALL')
      clauses.push(Prisma.sql`${column('type')} = ${filters.type}::"TaskType"`);
    if (filters.projectId)
      clauses.push(
        Prisma.sql`${column('project_id')} = ${filters.projectId}::uuid`,
      );
    if (filters.primaryAssigneeId)
      clauses.push(
        Prisma.sql`${column('primary_assignee_id')} = ${filters.primaryAssigneeId}::uuid`,
      );
    if (filters.priority && filters.priority !== 'ALL')
      clauses.push(
        Prisma.sql`${column('priority')} = ${filters.priority}::"TaskPriority"`,
      );
    if (filters.status && filters.status !== 'ALL')
      clauses.push(
        Prisma.sql`${column('status')} = ${filters.status}::"TaskStatus"`,
      );
    return clauses;
  }

  private filteredStatuses(
    filters: ReportFiltersDto,
    allowed: TaskStatus[],
  ): Prisma.EnumTaskStatusFilter {
    if (!filters.status || filters.status === 'ALL') return { in: allowed };
    return allowed.includes(filters.status)
      ? { in: [filters.status] }
      : { in: [] };
  }

  private async rawCount(
    clauses: Prisma.Sql[],
    condition: Prisma.Sql,
  ): Promise<number> {
    const [row] = await this.prisma.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`
        SELECT count(*) AS "count" FROM "tasks"
        WHERE ${Prisma.join([...clauses, condition], ' AND ')}
      `,
    );
    return Number(row?.count ?? 0);
  }

  private validateFilters(filters: ReportFiltersDto): void {
    if (
      filters.fromDate &&
      filters.toDate &&
      new Date(filters.fromDate).getTime() > new Date(filters.toDate).getTime()
    ) {
      throw invalid('fromDate must be earlier than or equal to toDate');
    }
    if (
      filters.dueFrom &&
      filters.dueTo &&
      new Date(filters.dueFrom).getTime() > new Date(filters.dueTo).getTime()
    ) {
      throw invalid('dueFrom must be earlier than or equal to dueTo');
    }
  }

  private managerUser(user: User): Record<string, unknown> {
    return {
      id: user.id,
      username: user.email,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
      jobTitle: user.jobTitle,
      department: user.department,
      phoneNumber: user.phoneNumber,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };
  }

  private directoryUser(user: User): Record<string, unknown> {
    return {
      id: user.id,
      username: user.email,
      email: user.email,
      displayName: user.displayName,
      jobTitle: user.jobTitle,
      department: user.department,
      phoneNumber: user.phoneNumber,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
    };
  }
}
