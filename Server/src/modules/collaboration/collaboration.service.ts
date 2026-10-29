import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TaskStatus, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { TaskAccessPolicy } from '../../common/auth/task-access.policy';
import { PrismaService } from '../../database/prisma.service';
import { CalendarQueryDto, ProjectInputDto, ProjectPatchDto } from './collaboration.dto';

const bad = (message: string) => new BadRequestException({ code: 'VALIDATION', message });
const forbidden = (message: string) => new ForbiddenException({ code: 'FORBIDDEN', message });
const missing = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Project not found' });
const leader = (actor: AuthenticatedUser) => actor.role !== UserRole.STAFF;

@Injectable()
export class CollaborationService {
  constructor(private readonly prisma: PrismaService, private readonly access: TaskAccessPolicy) {}

  async listProjects(actor: AuthenticatedUser) {
    const where: Prisma.ProjectWhereInput = leader(actor)
      ? {}
      : {
          OR: [
            { ownerId: actor.id },
            { tasks: { some: { AND: [this.access.readableTaskWhere(actor)] } } },
          ],
        };
    const projects = await this.prisma.project.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
    const visibleIds = projects.map((project) => project.id);
    const counts = await this.prisma.task.groupBy({
      by: ['projectId'],
      where: { projectId: { in: visibleIds }, AND: [this.access.readableTaskWhere(actor)] },
      _count: { _all: true },
    });
    const countByProject = new Map(counts.map((row) => [row.projectId, row._count._all]));
    return projects.map((project) => ({ ...project, taskCount: countByProject.get(project.id) ?? 0 }));
  }

  async getProject(actor: AuthenticatedUser, id: string) {
    const project = await this.projectForRead(actor, id);
    const tasks = await this.prisma.task.findMany({
      where: { projectId: id, AND: [this.access.readableTaskWhere(actor)] },
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
    });
    const completed = tasks.filter((task) => task.status === TaskStatus.DONE).length;
    return { ...project, tasks, stats: { total: tasks.length, completed, percent: tasks.length ? Math.round((completed / tasks.length) * 100) : 0 } };
  }

  async createProject(actor: AuthenticatedUser, input: ProjectInputDto) {
    this.requireLeader(actor);
    this.validateRange(input.startAt, input.endAt);
    return this.prisma.project.create({
      data: {
        name: input.name,
        description: input.description ?? '',
        ownerId: actor.id,
        startAt: input.startAt ? new Date(input.startAt) : null,
        endAt: input.endAt ? new Date(input.endAt) : null,
      },
    });
  }

  async updateProject(actor: AuthenticatedUser, id: string, input: ProjectPatchDto) {
    this.requireLeader(actor);
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw missing();
    const startAt = input.startAt === undefined ? project.startAt : input.startAt ? new Date(input.startAt) : null;
    const endAt = input.endAt === undefined ? project.endAt : input.endAt ? new Date(input.endAt) : null;
    this.validateRange(startAt?.toISOString(), endAt?.toISOString());
    return this.prisma.project.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.startAt !== undefined ? { startAt } : {}),
        ...(input.endAt !== undefined ? { endAt } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });
  }

  async archiveProject(actor: AuthenticatedUser, id: string) {
    this.requireLeader(actor);
    const changed = await this.prisma.project.updateMany({ where: { id }, data: { status: 'ARCHIVED' } });
    if (!changed.count) throw missing();
    return { id, status: 'ARCHIVED' as const };
  }

  async calendar(actor: AuthenticatedUser, query: CalendarQueryDto) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (from >= to || to.getTime() - from.getTime() > 93 * 24 * 60 * 60 * 1000) {
      throw bad('Calendar range must be positive and no longer than 93 days');
    }
    if (query.projectId) await this.projectForRead(actor, query.projectId);
    return this.prisma.task.findMany({
      where: {
        AND: [
          this.access.readableTaskWhere(actor),
          { dueAt: { gte: from, lt: to } },
          ...(query.projectId ? [{ projectId: query.projectId }] : []),
        ],
      },
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
    });
  }

  private async projectForRead(actor: AuthenticatedUser, id: string) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw missing();
    if (leader(actor) || project.ownerId === actor.id) return project;
    const visibleTask = await this.prisma.task.findFirst({
      where: { projectId: id, AND: [this.access.readableTaskWhere(actor)] },
      select: { id: true },
    });
    if (!visibleTask) throw missing();
    return project;
  }

  private requireLeader(actor: AuthenticatedUser) {
    if (!leader(actor)) throw forbidden('Only leaders can manage projects');
  }

  private validateRange(start?: string | null, end?: string | null) {
    if (start && end && new Date(start) > new Date(end)) throw bad('Project startAt must be before endAt');
  }
}
