import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InvitationStatus,
  ParticipantRole,
  Prisma,
  TaskStatus,
  TaskType,
  UserRole,
  UserStatus,
  type User,
} from '@prisma/client';
import { hash } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { UserAccessPolicy } from '../../common/auth/user-access.policy';
import { PrismaService } from '../../database/prisma.service';
import { toSafeUser, type SafeUser } from '../auth/auth.service';
import type {
  CreateUserDto,
  ResetPasswordDto,
  UpdateUserDto,
  UserListQueryDto,
  WorkloadQueryDto,
} from './users.dto';

type DirectoryUser = Pick<
  User,
  | 'id'
  | 'email'
  | 'displayName'
  | 'role'
  | 'jobTitle'
  | 'department'
  | 'phoneNumber'
  | 'avatarUrl'
  | 'createdAt'
> & { username: string };

type Page<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

type CreateUserResult = {
  user: SafeUser;
  temporaryPassword?: string;
};

type UserWorkloadStats = {
  user: SafeUser | DirectoryUser;
  primaryCount: number;
  collabCount: number;
  doneCount: number;
  doneOnTimeCount: number;
  onTimeRate: number;
  overdueCount: number;
};

const directoryProjection = (user: User): DirectoryUser => ({
  id: user.id,
  username: user.email,
  email: user.email,
  displayName: user.displayName,
  role: user.role,
  jobTitle: user.jobTitle,
  department: user.department,
  phoneNumber: user.phoneNumber,
  avatarUrl: user.avatarUrl,
  createdAt: user.createdAt,
});

const notFound = (): NotFoundException =>
  new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' });

const conflict = (message: string): ConflictException =>
  new ConflictException({ code: 'CONFLICT', message });

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: UserAccessPolicy,
  ) {}

  async list(
    actor: AuthenticatedUser,
    query: UserListQueryDto,
  ): Promise<Page<SafeUser | DirectoryUser>> {
    const isManager = actor.role === UserRole.MANAGER;
    if (!isManager && query.status && query.status !== UserStatus.ACTIVE) {
      throw notFound();
    }

    const where: Prisma.UserWhereInput = {
      ...(isManager
        ? query.status
          ? { status: query.status }
          : {}
        : { status: UserStatus.ACTIVE }),
      ...(query.role ? { role: query.role } : {}),
      ...(query.search
        ? {
            OR: [
              { displayName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { jobTitle: { contains: query.search, mode: 'insensitive' } },
              { department: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: users.map((user) =>
        isManager ? toSafeUser(user) : directoryProjection(user),
      ),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getById(
    actor: AuthenticatedUser,
    userId: string,
  ): Promise<SafeUser | DirectoryUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    this.access.assertVisibleUser(actor, user);
    return actor.role === UserRole.MANAGER
      ? toSafeUser(user)
      : directoryProjection(user);
  }

  async create(
    input: CreateUserDto,
    actorId: string,
  ): Promise<CreateUserResult> {
    const generatedPassword = input.initialPassword
      ? undefined
      : this.newTemporaryPassword();
    const password = input.initialPassword ?? generatedPassword!;
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: input.email,
            displayName: input.displayName,
            role: input.role,
            status: UserStatus.ACTIVE,
            passwordHash: await hash(password, 12),
            jobTitle: input.jobTitle,
            department: input.department ?? null,
            phoneNumber: input.phoneNumber ?? null,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'USER_CREATED',
            entity: 'User',
            entityId: created.id,
            after: {
              email: created.email,
              role: created.role,
              status: created.status,
            } satisfies Prisma.InputJsonObject,
          },
        });
        return created;
      });
      return {
        user: toSafeUser(user),
        ...(generatedPassword ? { temporaryPassword: generatedPassword } : {}),
      };
    } catch (error) {
      if (isUniqueViolation(error))
        throw conflict('A user with this email already exists');
      throw error;
    }
  }

  async update(
    actor: AuthenticatedUser,
    userId: string,
    input: UpdateUserDto,
  ): Promise<SafeUser> {
    if (Object.keys(input).length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION',
        message: 'At least one user field is required',
      });
    }
    if (userId === actor.id && input.status === UserStatus.LOCKED) {
      throw conflict('You cannot lock your own account');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Serialize every role/status mutation so concurrent requests cannot remove
        // the last ACTIVE Manager between the count and update.
        if (input.role !== undefined || input.status !== undefined) {
          await tx.$queryRaw(
            Prisma.sql`SELECT pg_advisory_xact_lock(0, 20261027) IS NULL AS "locked"`,
          );
        }

        const before = await tx.user.findUnique({ where: { id: userId } });
        if (!before) throw notFound();
        const updateData: Prisma.UserUpdateInput = {
          ...(input.displayName !== undefined
            ? { displayName: input.displayName }
            : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle } : {}),
          ...(input.department !== undefined
            ? { department: input.department }
            : {}),
          ...(input.phoneNumber !== undefined
            ? { phoneNumber: input.phoneNumber }
            : {}),
        };
        const after = await tx.user.update({
          where: { id: userId },
          data: updateData,
        });

        if (
          before.role === UserRole.MANAGER &&
          before.status === UserStatus.ACTIVE &&
          (after.role !== UserRole.MANAGER ||
            after.status !== UserStatus.ACTIVE)
        ) {
          const activeManagerCount = await tx.user.count({
            where: { role: UserRole.MANAGER, status: UserStatus.ACTIVE },
          });
          if (activeManagerCount < 1) {
            throw conflict('At least one ACTIVE Manager must remain');
          }
        }

        const securityChanged =
          before.role !== after.role ||
          before.status !== after.status ||
          before.email !== after.email;
        if (securityChanged) {
          await tx.authSession.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }

        const beforeAudit = this.auditSnapshot(before);
        const afterAudit = this.auditSnapshot(after);
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action:
              before.status !== after.status
                ? after.status === UserStatus.LOCKED
                  ? 'USER_LOCKED'
                  : 'USER_UNLOCKED'
                : before.role !== after.role
                  ? 'USER_ROLE_CHANGED'
                  : 'USER_PROFILE_UPDATED',
            entity: 'User',
            entityId: userId,
            before: beforeAudit,
            after: afterAudit,
          },
        });
        return toSafeUser(after);
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw conflict('A user with this email already exists');
      throw error;
    }
  }

  async resetPassword(
    userId: string,
    input: ResetPasswordDto,
    actorId: string,
  ): Promise<{ temporaryPassword: string; message: string }> {
    const temporaryPassword = input.newPassword ?? this.newTemporaryPassword();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw notFound();
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: await hash(temporaryPassword, 12) },
      });
      await tx.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'USER_PASSWORD_RESET',
          entity: 'User',
          entityId: userId,
          after: { passwordReset: true } satisfies Prisma.InputJsonObject,
        },
      });
    });
    return {
      temporaryPassword,
      message: 'Provide this password to the user through a secure channel.',
    };
  }

  async workload(
    actor: AuthenticatedUser,
    userId: string,
    query: WorkloadQueryDto,
  ): Promise<UserWorkloadStats> {
    this.access.assertCanReadWorkload(actor, userId);
    if (
      query.fromDate &&
      query.toDate &&
      new Date(query.fromDate).getTime() > new Date(query.toDate).getTime()
    ) {
      throw new BadRequestException({
        code: 'VALIDATION',
        message: 'fromDate must be earlier than or equal to toDate',
      });
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw notFound();

    const createdAt = {
      ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
      ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
    };
    const hasDateFilter = Object.keys(createdAt).length > 0;
    const primaryTasks = await this.prisma.task.findMany({
      where: {
        type: TaskType.OFFICIAL,
        primaryAssigneeId: userId,
        status: { notIn: [TaskStatus.DRAFT, TaskStatus.CANCELLED] },
        ...(hasDateFilter ? { createdAt } : {}),
      },
      select: {
        status: true,
        dueAt: true,
        completedAt: true,
        completionDueAtSnapshot: true,
      },
    });
    const collaborationRows = await this.prisma.taskParticipant.findMany({
      where: {
        userId,
        role: ParticipantRole.COLLABORATOR,
        invitationStatus: InvitationStatus.ACCEPTED,
        task: {
          type: { in: [TaskType.OFFICIAL, TaskType.TEAM] },
          status: { notIn: [TaskStatus.DRAFT, TaskStatus.CANCELLED] },
          ...(hasDateFilter ? { createdAt } : {}),
        },
      },
      select: { taskId: true, task: { select: { primaryAssigneeId: true } } },
    });

    const now = new Date();
    const doneTasks = primaryTasks.filter(
      (task) => task.status === TaskStatus.DONE,
    );
    const doneOnTimeCount = doneTasks.filter(
      (task) =>
        task.completedAt !== null &&
        task.completionDueAtSnapshot !== null &&
        task.completedAt <= task.completionDueAtSnapshot,
    ).length;
    const overdueCount = primaryTasks.filter(
      (task) =>
        (task.status === TaskStatus.TODO ||
          task.status === TaskStatus.IN_PROGRESS ||
          task.status === TaskStatus.IN_REVIEW) &&
        task.dueAt !== null &&
        task.dueAt < now,
    ).length;
    const collabCount = collaborationRows.filter(
      (row) => row.task.primaryAssigneeId !== userId,
    ).length;

    return {
      user:
        actor.role === UserRole.MANAGER
          ? toSafeUser(user)
          : directoryProjection(user),
      primaryCount: primaryTasks.length,
      collabCount,
      doneCount: doneTasks.length,
      doneOnTimeCount,
      onTimeRate:
        doneTasks.length > 0
          ? Math.round((doneOnTimeCount / doneTasks.length) * 100)
          : 0,
      overdueCount,
    };
  }

  private newTemporaryPassword(): string {
    return randomBytes(24).toString('base64url');
  }

  private auditSnapshot(user: User): Prisma.InputJsonObject {
    return {
      email: user.email,
      role: user.role,
      status: user.status,
      displayName: user.displayName,
      jobTitle: user.jobTitle,
      department: user.department,
    } satisfies Prisma.InputJsonObject;
  }
}
