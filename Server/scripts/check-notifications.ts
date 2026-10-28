import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import {
  PrismaClient,
  TaskPriority,
  TaskStatus,
  TaskType,
} from '@prisma/client';
import { io, type Socket } from 'socket.io-client';
import type { PrismaService } from '../src/database/prisma.service';
import { RemindersService } from '../src/modules/reminders/reminders.service';
import { OperationsMetricsService } from '../src/modules/observability/operations-metrics.service';

type FixtureUser = { alias: string; email: string };
type Fixture = { users: FixtureUser[] };
type ApiReply = {
  status: number;
  data: unknown;
  error?: { code?: string; message?: string };
};
type Session = { accessToken: string; user: { id: string } };
type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  taskId: string | null;
  task: { id: string; code: string; title: string } | null;
  readAt: string | null;
  createdAt: string;
};
type NotificationPage = {
  items: NotificationItem[];
  unreadCount: number;
  hasMore: boolean;
  latestCursor: string | null;
  nextCursor: string | null;
};

const baseUrl = new URL(
  process.env.NOTIFICATIONS_CHECK_BASE_URL ??
    `http://127.0.0.1:${process.env.PORT ?? '3000'}/api`,
);
if (!['localhost', '127.0.0.1', '::1'].includes(baseUrl.hostname)) {
  throw new Error('Notification checks can only target a localhost API.');
}
const databaseUrl = process.env.DATABASE_URL;
if (
  !databaseUrl ||
  !['localhost', '127.0.0.1', '::1'].includes(new URL(databaseUrl).hostname)
) {
  throw new Error('Notification checks require a localhost database.');
}
const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
if (
  process.env.CI !== 'true' &&
  !databaseName.startsWith('office_workspace_phase06_verify')
) {
  throw new Error(
    'Use a disposable database named office_workspace_phase06_verify*; the normal local database is refused.',
  );
}
const demoPassword = process.env.DEMO_SEED_PASSWORD;
if (!demoPassword) throw new Error('DEMO_SEED_PASSWORD is required.');
const fixture = JSON.parse(
  readFileSync(
    resolve(process.cwd(), '../docs/backend-plan/phase-00/kpi-fixture.v1.json'),
    'utf8',
  ),
) as Fixture;
const users = new Map(fixture.users.map((user) => [user.alias, user]));

async function request(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
): Promise<ApiReply> {
  const response = await fetch(
    new URL(path.replace(/^\//, ''), `${baseUrl.href.replace(/\/$/, '')}/`),
    {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
  const payload = (await response.json()) as {
    data?: unknown;
    error?: { code?: string; message?: string };
  };
  return { status: response.status, data: payload.data, error: payload.error };
}

function expect<T>(reply: ApiReply, status: number, label: string): T {
  assert.equal(
    reply.status,
    status,
    `${label}: ${reply.error?.code ?? ''} ${reply.error?.message ?? ''}`,
  );
  return reply.data as T;
}

async function login(alias: string): Promise<Session> {
  const user = users.get(alias);
  assert.ok(user, `fixture user ${alias} exists`);
  return expect<Session>(
    await request('POST', '/auth/login', undefined, {
      email: user.email,
      password: demoPassword,
    }),
    200,
    `login ${alias}`,
  );
}

async function connectSocket(token: string): Promise<Socket> {
  const socket = io(`${baseUrl.origin}/realtime`, {
    auth: { token },
    reconnection: false,
    timeout: 5000,
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('socket connect timeout')),
      7000,
    );
    socket.once('connect', () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
  return socket;
}

async function expectSocketReject(token: string): Promise<void> {
  const socket = io(`${baseUrl.origin}/realtime`, {
    auth: { token },
    reconnection: false,
    timeout: 5000,
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('socket rejection timeout')),
      7000,
    );
    socket.once('connect_error', () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once('connect', () => {
      clearTimeout(timeout);
      reject(new Error('locked account unexpectedly connected to realtime'));
    });
  });
  socket.close();
}

async function nextSocketEvent<T>(
  socket: Socket,
  eventName: string,
  action: () => Promise<void>,
  matches: (payload: T) => boolean = () => true,
): Promise<T> {
  const event = new Promise<T>((resolve, reject) => {
    const listener = (payload: T) => {
      if (!matches(payload)) return;
      clearTimeout(timeout);
      socket.off(eventName, listener);
      resolve(payload);
    };
    const timeout = setTimeout(() => {
      socket.off(eventName, listener);
      reject(new Error(`timed out waiting for ${eventName}`));
    }, 12_000);
    socket.on(eventName, listener);
  });
  await action();
  return event;
}

async function checkRestartMode(mode: string): Promise<boolean> {
  if (mode !== '--prepare-restart' && mode !== '--verify-restart') return false;
  const prisma = new PrismaClient();
  try {
    if (mode === '--prepare-restart') {
      const user = users.get('u02');
      assert.ok(user, 'fixture user u02 exists');
      const recipient = await prisma.user.findUniqueOrThrow({
        where: { email: user.email },
        select: { id: true },
      });
      const key = `phase06-restart:${randomUUID()}`;
      const eventId = randomUUID();
      await prisma.$transaction(async (tx) => {
        const notification = await tx.notification.create({
          data: {
            recipientId: recipient.id,
            taskId: null,
            type: 'TASK_UPDATED',
            title: 'Restart persistence check',
            body: 'The durable notification survived a server restart.',
            businessEventId: eventId,
          },
        });
        await tx.realtimeOutbox.create({
          data: {
            type: 'NOTIFICATION_NEW',
            idempotencyKey: key,
            businessEventId: eventId,
            recipientId: recipient.id,
            notificationId: notification.id,
            nextAttemptAt: new Date(Date.now() + 60_000),
          },
        });
      });
      process.stdout.write(`${key}\n`);
      return true;
    }

    const key = process.env.PHASE06_RESTART_KEY;
    assert.ok(key?.startsWith('phase06-restart:'), 'restart key is supplied');
    const outbox = await prisma.realtimeOutbox.findUniqueOrThrow({
      where: { idempotencyKey: key },
      select: {
        id: true,
        notificationId: true,
        recipientId: true,
        deliveredAt: true,
      },
    });
    assert.equal(
      outbox.deliveredAt,
      null,
      'outbox remained pending through server restart',
    );
    await prisma.realtimeOutbox.update({
      where: { id: outbox.id },
      data: { nextAttemptAt: new Date() },
    });
    const deadline = Date.now() + 15_000;
    let deliveredAt: Date | null = null;
    while (Date.now() < deadline && !deliveredAt) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      deliveredAt = (
        await prisma.realtimeOutbox.findUniqueOrThrow({
          where: { id: outbox.id },
          select: { deliveredAt: true },
        })
      ).deliveredAt;
    }
    assert.ok(
      deliveredAt,
      'restarted publisher delivers the persisted outbox row',
    );
    const recipient = users.get('u02');
    assert.ok(recipient, 'fixture user u02 exists');
    const session = await login('u02');
    const page = expect<NotificationPage>(
      await request('GET', '/notifications?limit=100', session.accessToken),
      200,
      'read persisted notification after server restart',
    );
    assert.ok(page.items.some((item) => item.id === outbox.notificationId));
    process.stdout.write(
      'PASS Phase 06 pending outbox and notification survive a server restart\n',
    );
    return true;
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  if (await checkRestartMode(process.argv[2] ?? '')) return;
  const prisma = new PrismaClient();
  const createdTaskIds: string[] = [];
  try {
    const [manager, deputy, assignee, otherStaff] = await Promise.all([
      login('u01'),
      login('u06'),
      login('u02'),
      login('u03'),
    ]);
    const aliases = ['u01', 'u06', 'u02', 'u03'];
    const sessions = new Map(
      aliases.map((alias, index) => [
        alias,
        [manager, deputy, assignee, otherStaff][index],
      ]),
    );
    const fixtureIds = new Map(
      aliases.map((alias) => [alias, sessions.get(alias)!.user.id]),
    );

    const latestNotification = await prisma.notification.aggregate({
      _max: { createdAt: true },
    });
    const minimumCheckTime = new Date('2031-05-10T10:00:00.000Z').getTime();
    const afterPreviousRun =
      (latestNotification._max.createdAt?.getTime() ?? 0) +
      2 * 24 * 60 * 60_000;
    const checkNow = new Date(Math.max(minimumCheckTime, afterPreviousRun));
    const reminders = new RemindersService(
      prisma as unknown as PrismaService,
      { get: (_key: string, fallback: string) => fallback } as ConfigService,
      {} as never,
      new OperationsMetricsService(),
    );
    const nonce = randomUUID().slice(0, 8);
    const createTask = async (
      suffix: string,
      assignedTo: string,
      dueAt: Date,
      status: TaskStatus = TaskStatus.TODO,
    ) => {
      const task = await prisma.task.create({
        data: {
          code: `PH06-${nonce}-${suffix}`,
          type: TaskType.OFFICIAL,
          title: `Phase 6 ${suffix} ${nonce}`,
          deliverable: 'Acceptance fixture',
          status,
          priority: TaskPriority.NORMAL,
          createdById: fixtureIds.get('u01')!,
          primaryAssigneeId: assignedTo,
          dueAt,
          ...(status === TaskStatus.DONE ? { completedAt: checkNow } : {}),
        },
      });
      createdTaskIds.push(task.id);
      return task;
    };
    const dueSoonTask = await createTask(
      'SOON',
      fixtureIds.get('u02')!,
      new Date(checkNow.getTime() + 12 * 60 * 60_000),
    );
    const dueTask = await createTask(
      'DUE',
      fixtureIds.get('u02')!,
      new Date(checkNow.getTime() - 15 * 60_000),
    );
    const overdueTask = await createTask(
      'OVERDUE',
      fixtureIds.get('u03')!,
      new Date(checkNow.getTime() - 30 * 60 * 60_000),
      TaskStatus.IN_REVIEW,
    );
    const hiddenTask = await createTask(
      'HIDDEN',
      fixtureIds.get('u03')!,
      new Date(checkNow.getTime() + 48 * 60 * 60_000),
      TaskStatus.DRAFT,
    );
    await createTask(
      'CANCELLED',
      fixtureIds.get('u03')!,
      new Date(checkNow.getTime() - 30 * 60 * 60_000),
      TaskStatus.CANCELLED,
    );
    await createTask(
      'DONE',
      fixtureIds.get('u03')!,
      new Date(checkNow.getTime() - 30 * 60 * 60_000),
      TaskStatus.DONE,
    );

    expect(
      await request(
        'POST',
        `/tasks/${dueSoonTask.id}/comments`,
        assignee.accessToken,
        { body: 'Phase 6 recipient matrix comment.' },
      ),
      201,
      'comment creates a task event, notification and outbox row',
    );

    const firstRun = await reminders.runDueReminders(checkNow, createdTaskIds);
    assert.equal(firstRun.dueSoon, 1, 'one due-soon notification is created');
    assert.equal(firstRun.due, 1, 'one due notification is created');
    assert.equal(
      firstRun.overdue,
      1,
      'one assignee overdue notification is created',
    );
    assert.equal(
      firstRun.leaderDigests,
      2,
      'active leaders get one aggregate overdue digest',
    );
    const secondRun = await reminders.runDueReminders(checkNow, createdTaskIds);
    assert.deepEqual(secondRun, {
      dueSoon: 0,
      due: 0,
      overdue: 0,
      leaderDigests: 0,
    });

    const staffPage = expect<NotificationPage>(
      await request('GET', '/notifications?limit=100', assignee.accessToken),
      200,
      'list notifications',
    );
    assert.ok(
      staffPage.items.some(
        (item) =>
          item.type === 'TASK_DUE_SOON' && item.taskId === dueSoonTask.id,
      ),
    );
    assert.ok(
      staffPage.items.some(
        (item) => item.type === 'TASK_DUE' && item.taskId === dueTask.id,
      ),
    );
    const staffOverdue = expect<NotificationPage>(
      await request('GET', '/notifications?limit=100', otherStaff.accessToken),
      200,
      'list overdue notifications',
    );
    const overdueNotice = staffOverdue.items.find(
      (item) => item.taskId === overdueTask.id,
    );
    assert.equal(overdueNotice?.type, 'TASK_OVERDUE');
    const leaderPage = expect<NotificationPage>(
      await request('GET', '/notifications?limit=100', manager.accessToken),
      200,
      'list leader digest',
    );
    const digest = leaderPage.items.find(
      (item) =>
        item.taskId === null && item.createdAt === checkNow.toISOString(),
    );
    assert.equal(digest?.type, 'TASK_OVERDUE');
    assert.match(digest?.body ?? '', /1 công việc chính thức quá hạn/);
    assert.ok(
      leaderPage.items.some(
        (item) =>
          item.type === 'COMMENT_ADDED' && item.taskId === dueSoonTask.id,
      ),
    );
    const unrelatedComments = staffOverdue.items.filter(
      (item) => item.type === 'COMMENT_ADDED' && item.taskId === dueSoonTask.id,
    );
    assert.equal(
      unrelatedComments.length,
      0,
      'unrelated staff receives no comment notification',
    );

    const hiddenEvent = randomUUID();
    const hiddenNotification = await prisma.notification.create({
      data: {
        recipientId: fixtureIds.get('u03')!,
        taskId: hiddenTask.id,
        type: 'TASK_UPDATED',
        title: `SECRET ${hiddenTask.code}`,
        body: `SECRET ${hiddenTask.title}`,
        businessEventId: hiddenEvent,
        createdAt: new Date(checkNow.getTime() + 30_000),
      },
    });
    const hiddenPage = expect<NotificationPage>(
      await request('GET', '/notifications?limit=100', otherStaff.accessToken),
      200,
      'ACL change notification list',
    );
    const sanitized = hiddenPage.items.find(
      (item) => item.id === hiddenNotification.id,
    );
    assert.equal(sanitized?.taskId, null);
    assert.equal(sanitized?.task, null);
    assert.equal(sanitized?.title, 'Cập nhật công việc');
    assert.doesNotMatch(sanitized?.body ?? '', /SECRET/);
    expect(
      await request(
        'POST',
        `/notifications/${hiddenNotification.id}/read`,
        assignee.accessToken,
      ),
      404,
      'read-one rejects a non-recipient',
    );

    const afterCursor = staffPage.latestCursor;
    assert.ok(afterCursor, 'notification list returns the newest cursor');
    const connected = await connectSocket(assignee.accessToken);
    let realtimeNotificationId = '';
    const notificationRealtime = nextSocketEvent<{
      eventId: string;
      entityId: string;
    }>(
      connected,
      'notification:new',
      async () => {
        await prisma.$transaction(async (tx) => {
          const notification = await tx.notification.create({
            data: {
              recipientId: fixtureIds.get('u02')!,
              taskId: dueSoonTask.id,
              type: 'TASK_UPDATED',
              title: 'Realtime check',
              body: 'Fetch through REST after reconnect.',
              businessEventId: randomUUID(),
              createdAt: new Date(checkNow.getTime() + 60_000),
            },
          });
          realtimeNotificationId = notification.id;
          await tx.realtimeOutbox.create({
            data: {
              type: 'NOTIFICATION_NEW',
              idempotencyKey: `notification:${notification.id}`,
              businessEventId: notification.businessEventId,
              taskId: dueSoonTask.id,
              recipientId: notification.recipientId,
              notificationId: notification.id,
              createdAt: notification.createdAt,
            },
          });
        });
      },
      (payload) => payload.entityId === realtimeNotificationId,
    );
    const delivered = await notificationRealtime;
    assert.ok(delivered.eventId);
    connected.disconnect();

    let offlineNotificationId = '';
    let offlineOutboxId = '';
    await prisma.$transaction(async (tx) => {
      const notification = await tx.notification.create({
        data: {
          recipientId: fixtureIds.get('u02')!,
          taskId: dueSoonTask.id,
          type: 'TASK_UPDATED',
          title: 'Offline recovery',
          body: 'Restore this item from the REST cursor.',
          businessEventId: randomUUID(),
          createdAt: new Date(checkNow.getTime() + 120_000),
        },
      });
      offlineNotificationId = notification.id;
      const outbox = await tx.realtimeOutbox.create({
        data: {
          type: 'NOTIFICATION_NEW',
          idempotencyKey: `notification:${notification.id}`,
          businessEventId: notification.businessEventId,
          taskId: dueSoonTask.id,
          recipientId: notification.recipientId,
          notificationId: notification.id,
          createdAt: notification.createdAt,
        },
        select: { id: true },
      });
      offlineOutboxId = outbox.id;
    });
    const offlineDeadline = Date.now() + 12_000;
    let offlineDelivered = false;
    while (Date.now() < offlineDeadline && !offlineDelivered) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const outbox = await prisma.realtimeOutbox.findUniqueOrThrow({
        where: { id: offlineOutboxId },
        select: { deliveredAt: true },
      });
      offlineDelivered = Boolean(outbox.deliveredAt);
    }
    assert.ok(
      offlineDelivered,
      'offline outbox delivery is drained without deleting REST data',
    );

    const reconnected = await connectSocket(assignee.accessToken);
    const joined = await new Promise<{ ok: boolean }>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('task room join timeout')),
        5000,
      );
      reconnected.emit(
        'room:join',
        { taskId: dueSoonTask.id },
        (reply: { ok: boolean }) => {
          clearTimeout(timeout);
          resolve(reply);
        },
      );
    });
    assert.equal(joined.ok, true, 'current assignee joins the task room');
    const taskRealtime = nextSocketEvent<{ entityId: string; version: number }>(
      reconnected,
      'task:updated',
      async () => {
        await prisma.$transaction(async (tx) => {
          const event = await tx.taskEvent.create({
            data: {
              taskId: dueSoonTask.id,
              actorId: fixtureIds.get('u01')!,
              kind: 'PHASE06_REALTIME_CHECK',
              note: 'Realtime acceptance fixture',
            },
          });
          await tx.realtimeOutbox.create({
            data: {
              type: 'TASK_UPDATED',
              idempotencyKey: `task:${event.id}`,
              businessEventId: event.id,
              taskId: event.taskId,
              createdAt: event.createdAt,
            },
          });
        });
      },
    );
    const taskSignal = await taskRealtime;
    assert.equal(taskSignal.entityId, dueSoonTask.id);
    reconnected.disconnect();

    const catchup = expect<NotificationPage>(
      await request(
        'GET',
        `/notifications?after=${encodeURIComponent(afterCursor)}&limit=100`,
        assignee.accessToken,
      ),
      200,
      'reconnect REST cursor catch-up',
    );
    assert.ok(catchup.items.some((item) => item.title === 'Realtime check'));
    assert.ok(catchup.items.some((item) => item.id === offlineNotificationId));

    const deniedJoin = await connectSocket(otherStaff.accessToken);
    const denied = await new Promise<{ ok: boolean; code?: string }>(
      (resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('unauthorized task room join timeout')),
          5000,
        );
        deniedJoin.emit(
          'room:join',
          { taskId: dueSoonTask.id },
          (reply: { ok: boolean; code?: string }) => {
            clearTimeout(timeout);
            resolve(reply);
          },
        );
      },
    );
    assert.equal(
      denied.ok,
      false,
      'unrelated user cannot join another task room',
    );
    deniedJoin.disconnect();

    const lockedSession = await prisma.authSession.findFirstOrThrow({
      where: { userId: fixtureIds.get('u03')!, revokedAt: null },
      select: { id: true },
    });
    await prisma.user.update({
      where: { id: fixtureIds.get('u03')! },
      data: { status: 'LOCKED' },
    });
    try {
      await expectSocketReject(otherStaff.accessToken);
    } finally {
      await prisma.user.update({
        where: { id: fixtureIds.get('u03')! },
        data: { status: 'ACTIVE' },
      });
    }
    assert.ok(
      lockedSession.id,
      'locked user session existed before handshake rejection',
    );

    const readAll = expect<{ updatedCount: number }>(
      await request('POST', '/notifications/read-all', assignee.accessToken),
      200,
      'read all notifications',
    );
    assert.ok(readAll.updatedCount > 0);
    const unread = expect<{ count: number }>(
      await request('GET', '/notifications/unread-count', assignee.accessToken),
      200,
      'unread count',
    );
    assert.equal(unread.count, 0);

    const reminderRows = await prisma.reminderEvent.count({
      where: { taskId: { in: createdTaskIds } },
    });
    assert.equal(
      reminderRows,
      5,
      'DRAFT/DONE/CANCELLED are not reminded and active milestones are unique',
    );
    process.stdout.write(
      'PASS Phase 06 notifications, recipient ACL, outbox delivery, reconnect cursor, locked-user handshake, VN reminders and dedupe\n',
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`FAIL Phase 06 notification checks: ${String(error)}\n`);
  process.exitCode = 1;
});
