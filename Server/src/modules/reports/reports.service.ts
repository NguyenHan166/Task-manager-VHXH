import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  InvitationStatus,
  ParticipantRole,
  Prisma,
  TaskStatus,
  TaskType,
  UserRole,
  type Task,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { TaskAccessPolicy } from '../../common/auth/task-access.policy';
import { PrismaService } from '../../database/prisma.service';
import { SystemClockService } from '../../common/time/system-clock.service';
import { DashboardService } from '../dashboard/dashboard.service';
import type { ReportTasksQueryDto } from '../dashboard/dashboard.dto';
import { renderCsv, renderXlsx, type ExportRow } from './report-export';

const MAX_EXPORT_ROWS = 5_000;
const ACTIVE_STATUSES: TaskStatus[] = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.IN_REVIEW,
];

const invalid = (message: string): BadRequestException =>
  new BadRequestException({ code: 'VALIDATION', message });
const forbidden = (): ForbiddenException =>
  new ForbiddenException({
    code: 'FORBIDDEN',
    message: 'Task reports are not available for your role',
  });

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

const vietnameseDate = (date: Date): string =>
  new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(date);

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TaskAccessPolicy,
    private readonly dashboard: DashboardService,
    private readonly clock: SystemClockService,
  ) {}

  kpi(actor: AuthenticatedUser, filters: ReportTasksQueryDto) {
    return this.dashboard.kpiReport(actor, filters);
  }

  async tasks(actor: AuthenticatedUser, query: ReportTasksQueryDto) {
    this.validateQuery(query);
    const where = this.taskWhere(actor, query);
    const [rows, total] = await this.prisma.$transaction(
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
      items: rows.map(publicTask),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async exportTasks(
    actor: AuthenticatedUser,
    query: ReportTasksQueryDto & { format: 'CSV' | 'XLSX' },
  ): Promise<{ body: Buffer; contentType: string; filename: string }> {
    if (
      actor.role !== UserRole.MANAGER &&
      actor.role !== UserRole.DEPUTY_MANAGER
    ) {
      throw forbidden();
    }
    this.validateQuery(query);
    const rows = await this.prisma.task.findMany({
      where: this.taskWhere(actor, query),
      orderBy: this.orderBy(query),
      take: MAX_EXPORT_ROWS + 1,
      include: {
        primaryAssignee: { select: { displayName: true } },
        project: { select: { name: true } },
      },
    });
    if (rows.length > MAX_EXPORT_ROWS) {
      throw invalid(`Export is limited to ${MAX_EXPORT_ROWS} tasks`);
    }
    const generatedAt = new Date();
    const doneCount = rows.filter(
      (task) => task.status === TaskStatus.DONE,
    ).length;
    const completedOnTimeCount = rows.filter(
      (task) =>
        task.status === TaskStatus.DONE &&
        task.completedAt !== null &&
        task.completionDueAtSnapshot !== null &&
        task.completedAt <= task.completionDueAtSnapshot,
    ).length;
    const overdueCount = rows.filter(
      (task) =>
        ACTIVE_STATUSES.includes(task.status) &&
        task.dueAt !== null &&
        task.dueAt < generatedAt,
    ).length;
    const statusCounts = new Map<TaskStatus, number>();
    for (const task of rows) {
      statusCounts.set(task.status, (statusCounts.get(task.status) ?? 0) + 1);
    }
    const tableRows: ExportRow[] = [
      [
        'Mã công việc',
        'Tên công việc',
        'Trạng thái',
        'Ưu tiên',
        'Người chủ trì',
        'Hạn (UTC)',
        'Hạn (Việt Nam)',
        'Hoàn thành (UTC)',
        'Dự án',
        'Ngày tạo (UTC)',
      ],
      ...rows.map((task) => [
        task.code,
        task.title,
        task.status,
        task.priority,
        task.primaryAssignee?.displayName ?? '',
        task.dueAt?.toISOString() ?? '',
        task.dueAt ? vietnameseDate(task.dueAt) : '',
        task.completedAt?.toISOString() ?? '',
        task.project?.name ?? '',
        task.createdAt.toISOString(),
      ]),
    ];
    const filters = this.filterSummary(query);
    const documentRows: ExportRow[] = [
      ['Báo cáo danh sách công việc'],
      ['Người xuất', actor.displayName],
      ['Mốc tạo UTC', generatedAt.toISOString()],
      ['Mốc tạo Việt Nam', vietnameseDate(generatedAt)],
      ['Phạm vi', 'OFFICIAL đã phát hành trong toàn phòng'],
      ['Bộ lọc', filters],
      ['Số dòng công việc theo bộ lọc', rows.length],
      [],
      ['Tóm tắt KPI của chính tập dòng xuất'],
      ['Chỉ số', 'Giá trị', 'Mẫu số / định nghĩa'],
      [
        'OFFICIAL đã phát hành trong tập xuất',
        rows.length,
        'Dòng sau toàn bộ filter; loại DRAFT/CANCELLED',
      ],
      [
        'Đang chờ xử lý',
        statusCounts.get(TaskStatus.TODO) ?? 0,
        'OFFICIAL có trạng thái TODO',
      ],
      [
        'Đang thực hiện',
        statusCounts.get(TaskStatus.IN_PROGRESS) ?? 0,
        'OFFICIAL có trạng thái IN_PROGRESS',
      ],
      [
        'Đang chờ duyệt',
        statusCounts.get(TaskStatus.IN_REVIEW) ?? 0,
        'OFFICIAL có trạng thái IN_REVIEW',
      ],
      ['Đã hoàn thành', doneCount, 'OFFICIAL có trạng thái DONE'],
      [
        'Quá hạn',
        overdueCount,
        'TODO/IN_PROGRESS/IN_REVIEW với dueAt < thời điểm xuất',
      ],
      [
        'Hoàn thành đúng hạn',
        completedOnTimeCount,
        'DONE với completedAt <= completionDueAtSnapshot',
      ],
      [
        'Tỷ lệ hoàn thành đúng hạn (%)',
        doneCount > 0
          ? Math.round((completedOnTimeCount / doneCount) * 100)
          : '—',
        `Mẫu số: ${doneCount} task DONE trong cùng tập xuất`,
      ],
      [],
      ...tableRows,
    ];
    const stamp = generatedAt
      .toISOString()
      .replaceAll(/[-:]/g, '')
      .replace('T', '-')
      .slice(0, 15);
    const extension = query.format === 'CSV' ? 'csv' : 'xlsx';
    const filename = `bao-cao-cong-viec-${stamp}.${extension}`;
    return query.format === 'CSV'
      ? {
          body: renderCsv(documentRows),
          contentType: 'text/csv; charset=utf-8',
          filename,
        }
      : {
          body: renderXlsx(documentRows),
          contentType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          filename,
        };
  }

  private taskWhere(
    actor: AuthenticatedUser,
    query: ReportTasksQueryDto,
  ): Prisma.TaskWhereInput {
    const filters: Prisma.TaskWhereInput[] = [
      this.access.readableTaskWhere(actor),
      { archivedAt: null },
    ];
    if (
      actor.role === UserRole.MANAGER ||
      actor.role === UserRole.DEPUTY_MANAGER
    ) {
      // Department reporting is deliberately OFFICIAL-only: no personal or draft task can leak.
      filters.push({
        type: TaskType.OFFICIAL,
        status: { notIn: [TaskStatus.DRAFT, TaskStatus.CANCELLED] },
      });
    }
    if (query.fromDate || query.toDate) {
      filters.push({
        createdAt: {
          ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
          ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
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
        dueAt: { lt: this.clock.now() },
        status: {
          in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.IN_REVIEW],
        },
      });
    }
    if (query.scope === 'OWNED') {
      filters.push({
        OR: [{ createdById: actor.id }, { primaryAssigneeId: actor.id }],
      });
    } else if (query.scope === 'COLLABORATING') {
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
    } else if (query.scope === 'WATCHING') {
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
    return { AND: filters };
  }

  private orderBy(
    query: ReportTasksQueryDto,
  ): Prisma.TaskOrderByWithRelationInput[] {
    const direction: Prisma.SortOrder =
      query.sortDirection === 'ASC' ? 'asc' : 'desc';
    switch (query.sortBy) {
      case 'DUE_AT':
        return [{ dueAt: { sort: direction, nulls: 'last' } }, { id: 'asc' }];
      case 'PRIORITY':
        return [{ priority: direction }, { id: 'asc' }];
      case 'CREATED_AT':
        return [{ createdAt: direction }, { id: 'asc' }];
      default:
        return [{ updatedAt: direction }, { id: 'asc' }];
    }
  }

  private validateQuery(query: ReportTasksQueryDto): void {
    if (
      query.fromDate &&
      query.toDate &&
      new Date(query.fromDate).getTime() > new Date(query.toDate).getTime()
    ) {
      throw invalid('fromDate must be earlier than or equal to toDate');
    }
    if (
      query.dueFrom &&
      query.dueTo &&
      new Date(query.dueFrom).getTime() > new Date(query.dueTo).getTime()
    ) {
      throw invalid('dueFrom must be earlier than or equal to dueTo');
    }
  }

  private filterSummary(query: ReportTasksQueryDto): string {
    const labels: string[] = [];
    if (query.fromDate) labels.push(`tạo từ ${query.fromDate}`);
    if (query.toDate) labels.push(`tạo đến ${query.toDate}`);
    if (query.projectId) labels.push(`dự án ${query.projectId}`);
    if (query.primaryAssigneeId)
      labels.push(`chủ trì ${query.primaryAssigneeId}`);
    if (query.status && query.status !== 'ALL')
      labels.push(`trạng thái ${query.status}`);
    if (query.priority && query.priority !== 'ALL')
      labels.push(`ưu tiên ${query.priority}`);
    if (query.dueFrom) labels.push(`hạn từ ${query.dueFrom}`);
    if (query.dueTo) labels.push(`hạn đến ${query.dueTo}`);
    if (query.search) labels.push(`tìm kiếm ${query.search}`);
    return labels.length ? labels.join('; ') : 'Không lọc';
  }
}
