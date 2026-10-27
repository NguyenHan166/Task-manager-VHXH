import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../database/prisma.service';
import { IS_PUBLIC_KEY } from './auth.decorators';
import type { AuthenticatedUser } from './auth.types';
import type { Request } from 'express';

type AccessClaims = { sub: string; sid: string; iat: number; exp: number };

const invalidSession = (): UnauthorizedException =>
  new UnauthorizedException({
    code: 'UNAUTHORIZED',
    message: 'Invalid or expired session',
  });

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.header('authorization');
    if (!authorization?.startsWith('Bearer ')) throw invalidSession();
    const token = authorization.slice('Bearer '.length).trim();
    if (!token) throw invalidSession();

    let claims: AccessClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessClaims>(token, {
        secret: this.config.getOrThrow<string>('ACCESS_TOKEN_SIGNING_KEY'),
        algorithms: ['HS256'],
        issuer: 'office-workspace',
        audience: 'office-workspace-web',
      });
    } catch {
      throw invalidSession();
    }
    if (!claims.sub || !claims.sid) throw invalidSession();

    const session = await this.prisma.authSession.findFirst({
      where: {
        id: claims.sid,
        userId: claims.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            role: true,
            status: true,
            jobTitle: true,
            department: true,
            phoneNumber: true,
            avatarUrl: true,
            createdAt: true,
            lastLoginAt: true,
          },
        },
      },
    });
    if (!session || session.user.status !== 'ACTIVE') throw invalidSession();

    const user: AuthenticatedUser = {
      ...session.user,
      username: session.user.email,
      sessionId: session.id,
    };
    request.authUser = user;
    return true;
  }
}
