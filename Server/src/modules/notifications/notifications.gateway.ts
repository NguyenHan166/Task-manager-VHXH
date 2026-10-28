import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { UserStatus } from '@prisma/client';
import type { Namespace, Socket } from 'socket.io';
import { TaskAccessPolicy } from '../../common/auth/task-access.policy';
import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../database/prisma.service';
import { OperationsMetricsService } from '../observability/operations-metrics.service';

type AccessClaims = { sub: string; sid: string; iat: number; exp: number };
type SocketIdentity = {
  actor: AuthenticatedUser;
  sessionId: string;
  expiresAt: number;
};
type AuthenticatedSocket = Socket & { data: { identity?: SocketIdentity } };
type TaskRoomPayload = { taskId?: unknown };
type SocketNext = (error?: Error) => void;

const userRoom = (userId: string): string => `user_${userId}`;
const taskRoom = (taskId: string): string => `task_${taskId}`;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    credentials: true,
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allowed?: boolean) => void,
    ) => {
      const allowed = (process.env.FRONTEND_ORIGINS ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      callback(null, !origin || allowed.includes(origin));
    },
  },
})
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private namespace?: Namespace;
  private readonly sessionTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly access: TaskAccessPolicy,
    private readonly metrics: OperationsMetricsService,
  ) {}

  afterInit(namespace: Namespace): void {
    this.namespace = namespace;
    namespace.use((socket, next) => {
      void this.authenticate(
        socket as AuthenticatedSocket,
        next as unknown as SocketNext,
      );
    });
  }

  handleConnection(client: AuthenticatedSocket): void {
    const timer = setInterval(() => {
      void this.validateSession(client);
    }, 30_000);
    timer.unref();
    this.sessionTimers.set(client.id, timer);
  }

  handleDisconnect(client: Socket): void {
    const timer = this.sessionTimers.get(client.id);
    if (timer) clearInterval(timer);
    this.sessionTimers.delete(client.id);
    this.metrics.increment('socket_disconnects');
  }

  @SubscribeMessage('room:join')
  async joinTaskRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: TaskRoomPayload,
  ) {
    const identity = client.data.identity;
    if (!(await this.validateSession(client)) || !identity) {
      return { ok: false, code: 'UNAUTHORIZED' };
    }
    if (
      typeof payload?.taskId !== 'string' ||
      !uuidPattern.test(payload.taskId)
    ) {
      return { ok: false, code: 'VALIDATION' };
    }
    const task = await this.prisma.task.findFirst({
      where: {
        id: payload.taskId,
        AND: [this.access.readableTaskWhere(identity.actor)],
      },
      select: {
        id: true,
        type: true,
        status: true,
        createdById: true,
        primaryAssigneeId: true,
        archivedAt: true,
        participants: {
          select: {
            userId: true,
            invitationStatus: true,
            role: true,
          },
        },
      },
    });
    if (!task || !this.access.canRead(identity.actor, task)) {
      return { ok: false, code: 'NOT_FOUND' };
    }
    await client.join(taskRoom(task.id));
    return { ok: true, room: taskRoom(task.id) };
  }

  @SubscribeMessage('room:leave')
  async leaveTaskRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: TaskRoomPayload,
  ) {
    if (!(await this.validateSession(client))) {
      return { ok: false, code: 'UNAUTHORIZED' };
    }
    if (
      typeof payload?.taskId !== 'string' ||
      !uuidPattern.test(payload.taskId)
    ) {
      return { ok: false, code: 'VALIDATION' };
    }
    await client.leave(taskRoom(payload.taskId));
    return { ok: true };
  }

  async publishNotification(
    recipientId: string,
    notificationId: string,
    eventId: string,
    occurredAt: Date,
  ): Promise<void> {
    if (!this.namespace) return;
    const sockets = await this.namespace
      .in(userRoom(recipientId))
      .fetchSockets();
    const payload = {
      eventId,
      occurredAt: occurredAt.toISOString(),
      entityId: notificationId,
    };
    for (const socket of sockets) {
      const remote = socket as typeof socket & {
        data: { identity?: SocketIdentity };
      };
      const identity = remote.data.identity;
      const actor = identity ? await this.activeActor(identity) : null;
      if (!identity || !actor || actor.id !== recipientId) {
        remote.disconnect(true);
        continue;
      }
      identity.actor = actor;
      remote.emit('notification:new', payload);
    }
  }

  async publishTaskUpdated(
    taskId: string,
    eventId: string,
    occurredAt: Date,
  ): Promise<void> {
    if (!this.namespace) return;
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        version: true,
        type: true,
        status: true,
        createdById: true,
        primaryAssigneeId: true,
        archivedAt: true,
        participants: {
          select: {
            userId: true,
            invitationStatus: true,
            role: true,
          },
        },
      },
    });
    const sockets = await this.namespace.in(taskRoom(taskId)).fetchSockets();
    const payload = {
      eventId,
      occurredAt: occurredAt.toISOString(),
      entityId: taskId,
      version: task?.version ?? null,
    };
    for (const socket of sockets) {
      const remote = socket as typeof socket & {
        data: { identity?: SocketIdentity };
      };
      const identity = remote.data.identity;
      const actor = identity ? await this.activeActor(identity) : null;
      if (!task || !identity || !actor) {
        await remote.leave(taskRoom(taskId));
        if (identity && !actor) remote.disconnect(true);
        continue;
      }
      identity.actor = actor;
      if (!this.access.canRead(actor, task)) {
        await remote.leave(taskRoom(taskId));
        continue;
      }
      remote.emit('task:updated', payload);
    }
  }

  private async authenticate(
    socket: AuthenticatedSocket,
    next: SocketNext,
  ): Promise<void> {
    const auth = socket.handshake.auth as { token?: unknown } | undefined;
    const authorization = socket.handshake.headers.authorization;
    const token =
      typeof auth?.token === 'string'
        ? auth.token.trim()
        : typeof authorization === 'string' &&
            authorization.startsWith('Bearer ')
          ? authorization.slice('Bearer '.length).trim()
          : '';
    if (!token) {
      next(new Error('unauthorized'));
      return;
    }

    try {
      const claims = await this.jwt.verifyAsync<AccessClaims>(token, {
        secret: this.config.getOrThrow<string>('ACCESS_TOKEN_SIGNING_KEY'),
        algorithms: ['HS256'],
        issuer: 'office-workspace',
        audience: 'office-workspace-web',
      });
      if (!claims.sub || !claims.sid || !claims.exp) {
        next(new Error('unauthorized'));
        return;
      }
      const session = await this.prisma.authSession.findFirst({
        where: {
          id: claims.sid,
          userId: claims.sub,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          user: { status: UserStatus.ACTIVE },
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
      if (!session || session.user.status !== UserStatus.ACTIVE) {
        next(new Error('unauthorized'));
        return;
      }
      const actor: AuthenticatedUser = {
        ...session.user,
        username: session.user.email,
        sessionId: session.id,
      };
      socket.data.identity = {
        actor,
        sessionId: session.id,
        expiresAt: claims.exp * 1000,
      };
      await socket.join(userRoom(actor.id));
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  }

  private async validateSession(client: AuthenticatedSocket): Promise<boolean> {
    const identity = client.data.identity;
    const actor = identity ? await this.activeActor(identity) : null;
    if (!identity || !actor) {
      client.disconnect(true);
      return false;
    }
    identity.actor = actor;
    return true;
  }

  private async activeActor(
    identity: SocketIdentity,
  ): Promise<AuthenticatedUser | null> {
    if (identity.expiresAt <= Date.now()) return null;
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: identity.sessionId,
        userId: identity.actor.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { status: UserStatus.ACTIVE },
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
    if (!session || session.user.status !== UserStatus.ACTIVE) return null;
    return {
      ...session.user,
      username: session.user.email,
      sessionId: session.id,
    };
  }
}
