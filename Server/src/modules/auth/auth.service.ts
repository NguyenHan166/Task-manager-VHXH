import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../../common/auth/auth.types';
import type { ChangePasswordDto, OwnProfileDto } from './auth.dto';

export type SafeUser = Omit<User, 'passwordHash' | 'updatedAt'> & {
  username: string;
};
export type AuthResult = {
  accessToken: string;
  expiresInSeconds: number;
  user: SafeUser;
  refreshToken: string;
};

const invalidCredentials = (): UnauthorizedException =>
  new UnauthorizedException({
    code: 'UNAUTHORIZED',
    message: 'Email hoặc mật khẩu không đúng',
  });

const invalidSession = (): UnauthorizedException =>
  new UnauthorizedException({
    code: 'UNAUTHORIZED',
    message: 'Invalid or expired session',
  });

const digestToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export const toSafeUser = (user: User): SafeUser => {
  const safe = Object.fromEntries(
    Object.entries(user).filter(
      ([key]) => key !== 'passwordHash' && key !== 'updatedAt',
    ),
  ) as Omit<User, 'passwordHash' | 'updatedAt'>;
  return { ...safe, username: user.email };
};

@Injectable()
export class AuthService {
  private readonly dummyPasswordHash = hash('not-a-valid-account-password', 12);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(
    email: string,
    password: string,
    userAgent?: string,
  ): Promise<AuthResult> {
    const canonicalEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: canonicalEmail },
    });
    const candidateHash = user?.passwordHash ?? (await this.dummyPasswordHash);
    const passwordMatches = await compare(password, candidateHash);
    if (!user || !passwordMatches || user.status !== 'ACTIVE') {
      await this.writeFailedLoginAudit();
      throw invalidCredentials();
    }

    const now = new Date();
    const refreshToken = randomBytes(32).toString('base64url');
    const session = await this.prisma.$transaction(async (tx) => {
      const authenticated = await tx.user.updateMany({
        where: {
          id: user.id,
          email: canonicalEmail,
          role: user.role,
          status: 'ACTIVE',
          passwordHash: user.passwordHash,
        },
        data: { lastLoginAt: now },
      });
      if (authenticated.count !== 1) throw invalidCredentials();
      const updatedUser = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      const newSession = await tx.authSession.create({
        data: {
          userId: user.id,
          refreshHash: digestToken(refreshToken),
          expiresAt: this.refreshExpiry(now),
          device: userAgent?.slice(0, 200) ?? null,
          createdAt: now,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'LOGIN_SUCCEEDED',
          entity: 'User',
          entityId: user.id,
          after: { result: 'SUCCEEDED' } satisfies Prisma.InputJsonObject,
          createdAt: now,
        },
      });
      return { user: updatedUser, session: newSession };
    });
    return this.issueAuthResult(session.user, session.session.id, refreshToken);
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const oldHash = digestToken(refreshToken);
    const now = new Date();
    const current = await this.prisma.authSession.findUnique({
      where: { refreshHash: oldHash },
      include: { user: true },
    });
    if (
      !current ||
      current.revokedAt ||
      current.expiresAt <= now ||
      current.user.status !== 'ACTIVE'
    ) {
      throw invalidSession();
    }

    const nextRefreshToken = randomBytes(32).toString('base64url');
    const rotated = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "users" WHERE "id" = ${current.userId}::uuid FOR UPDATE
      `);
      const freshUser = await tx.user.findUnique({
        where: { id: current.userId },
      });
      if (!freshUser || freshUser.status !== 'ACTIVE') throw invalidSession();
      const claimed = await tx.authSession.updateMany({
        where: {
          id: current.id,
          refreshHash: oldHash,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { revokedAt: now },
      });
      if (claimed.count !== 1) throw invalidSession();
      const nextSession = await tx.authSession.create({
        data: {
          userId: current.userId,
          refreshHash: digestToken(nextRefreshToken),
          expiresAt: this.refreshExpiry(now),
          rotatedFromId: current.id,
          device: current.device,
          createdAt: now,
        },
      });
      return { user: freshUser, sessionId: nextSession.id };
    });
    return this.issueAuthResult(
      rotated.user,
      rotated.sessionId,
      nextRefreshToken,
    );
  }

  async logout(user: AuthenticatedUser): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "users" WHERE "id" = ${user.id}::uuid FOR UPDATE
      `);
      const sessions = await tx.authSession.findMany({
        where: { userId: user.id },
        select: { id: true, rotatedFromId: true },
      });
      const sessionIds = new Set([user.sessionId]);
      let foundDescendant = true;
      while (foundDescendant) {
        foundDescendant = false;
        for (const session of sessions) {
          if (
            session.rotatedFromId &&
            sessionIds.has(session.rotatedFromId) &&
            !sessionIds.has(session.id)
          ) {
            sessionIds.add(session.id);
            foundDescendant = true;
          }
        }
      }
      await tx.authSession.updateMany({
        where: {
          id: { in: [...sessionIds] },
          userId: user.id,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
    });
  }

  async logoutAll(userId: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "users" WHERE "id" = ${userId}::uuid FOR UPDATE
      `);
      await tx.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
    });
  }

  async updateOwnProfile(
    userId: string,
    input: OwnProfileDto,
  ): Promise<SafeUser> {
    if (!Object.keys(input).length) {
      throw new BadRequestException({
        code: 'VALIDATION',
        message: 'At least one profile field is required',
      });
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: input,
    });
    return toSafeUser(user);
  }

  async changePassword(
    userId: string,
    input: ChangePasswordDto,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await compare(input.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Current password is incorrect',
      });
    }
    const passwordHash = await hash(input.newPassword, 12);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({
        where: {
          id: userId,
          passwordHash: user.passwordHash,
          status: 'ACTIVE',
        },
        data: { passwordHash },
      });
      if (changed.count !== 1) {
        throw new UnauthorizedException({
          code: 'UNAUTHORIZED',
          message: 'Current password is incorrect',
        });
      }
      await tx.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'USER_PASSWORD_CHANGED',
          entity: 'User',
          entityId: userId,
          after: { passwordChanged: true } as Prisma.InputJsonObject,
          createdAt: now,
        },
      });
    });
  }

  private async writeFailedLoginAudit(): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: 'LOGIN_FAILED',
          entity: 'Auth',
          after: { result: 'FAILED', reason: 'INVALID_CREDENTIALS' },
        },
      });
    } catch {
      // Failed credentials keep the same public response if audit storage is unavailable.
    }
  }

  private refreshExpiry(now: Date): Date {
    const days = Number(
      this.config.getOrThrow<string>('REFRESH_TOKEN_TTL_DAYS'),
    );
    return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private async issueAuthResult(
    user: User,
    sessionId: string,
    refreshToken: string,
  ): Promise<AuthResult> {
    const accessToken = await this.jwt.signAsync(
      { sid: sessionId },
      { subject: user.id },
    );
    return {
      accessToken,
      expiresInSeconds: Number(
        this.config.getOrThrow<string>('ACCESS_TOKEN_TTL_SECONDS'),
      ),
      user: toSafeUser(user),
      refreshToken,
    };
  }
}
