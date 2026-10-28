import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

type User = { alias: string; email: string; role: string };
type FixtureTask = {
  alias: string;
  code: string;
  type: string;
  status: string;
  createdBy: string;
  primaryAssignee: string;
  project: string | null;
  dueAt: string | null;
};
type Participant = {
  task: string;
  user: string;
  invitationStatus: string;
};
type Fixture = {
  users: User[];
  tasks: FixtureTask[];
  participants: Participant[];
};
type ApiReply = { status: number; data: unknown; error?: { code: string } };
type Task = {
  id: string;
  code: string;
  title: string;
  status: string;
  dueAt: string | null;
  projectId: string | null;
  version: number;
  [key: string]: unknown;
};
type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
type Session = { accessToken: string; user: { id: string } };

const baseUrl = new URL(
  process.env.TASK_CHECK_BASE_URL ??
    `http://127.0.0.1:${process.env.PORT ?? '3000'}/api`,
);
if (!['localhost', '127.0.0.1', '::1'].includes(baseUrl.hostname)) {
  throw new Error('Task checks can only target a localhost API.');
}
const password = process.env.DEMO_SEED_PASSWORD;
if (!password) throw new Error('DEMO_SEED_PASSWORD is required.');
const databaseUrl = process.env.DATABASE_URL;
if (
  !databaseUrl ||
  !['localhost', '127.0.0.1', '::1'].includes(new URL(databaseUrl).hostname)
) {
  throw new Error('Task checks require a disposable localhost database.');
}
const fixture = JSON.parse(
  readFileSync(
    resolve(process.cwd(), '../docs/backend-plan/phase-00/kpi-fixture.v1.json'),
    'utf8',
  ),
) as Fixture;
const seeded = fixture.tasks.filter((task) =>
  /^t(0[1-9]|1[0-3])$/.test(task.alias),
);

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
    error?: { code: string };
  };
  return { status: response.status, data: payload.data, error: payload.error };
}

function expect<T>(reply: ApiReply, status: number, label: string): T {
  assert.equal(reply.status, status, `${label}: ${reply.error?.code ?? ''}`);
  return reply.data as T;
}

function visibleTo(alias: string, task: FixtureTask): boolean {
  if (task.type === 'PERSONAL') return task.createdBy === alias;
  const related =
    task.createdBy === alias ||
    task.primaryAssignee === alias ||
    fixture.participants.some(
      (participant) =>
        participant.task === task.alias &&
        participant.user === alias &&
        participant.invitationStatus === 'ACCEPTED',
    );
  if (task.type === 'TEAM') return related;
  if (task.status === 'DRAFT') return task.createdBy === alias;
  return alias === 'u01' || alias === 'u06' || related;
}

async function main(): Promise<void> {
  const sessions = new Map<string, Session>();
  for (const user of fixture.users) {
    const session = expect<Session>(
      await request('POST', '/auth/login', undefined, {
        email: user.email,
        password,
      }),
      200,
      `login ${user.alias}`,
    );
    sessions.set(user.alias, session);
  }
  const token = (alias: string): string => sessions.get(alias)!.accessToken;
  const userId = (alias: string): string => sessions.get(alias)!.user.id;

  const byAlias = new Map<string, Task>();
  for (const task of seeded) {
    const owner = task.createdBy;
    const page = expect<Page<Task>>(
      await request('GET', `/tasks?search=${task.code}`, token(owner)),
      200,
      `find ${task.alias}`,
    );
    assert.equal(page.total, 1, `find ${task.alias} total`);
    byAlias.set(task.alias, page.items[0]);
  }

  for (const user of fixture.users) {
    const alias = user.alias;
    const page = expect<Page<Task>>(
      await request('GET', '/tasks?pageSize=100', token(alias)),
      200,
      `list ${alias}`,
    );
    const expected = seeded.filter((task) => visibleTo(alias, task));
    assert.equal(page.total, expected.length, `ACL total ${alias}`);
    assert.deepEqual(
      page.items.map((task) => task.code).sort(),
      expected.map((task) => task.code).sort(),
      `ACL items ${alias}`,
    );
    for (const task of seeded) {
      const id = byAlias.get(task.alias)!.id;
      const status = visibleTo(alias, task) ? 200 : 404;
      const checkDetail =
        alias === task.createdBy ||
        (alias === 'u06' && !visibleTo(alias, task)) ||
        (alias === 'u05' && task.alias === 't10') ||
        (alias === 'u04' && task.alias === 't11');
      if (!checkDetail) continue;
      expect(
        await request('GET', `/tasks/${id}`, token(alias)),
        status,
        `detail ${alias}/${task.alias}`,
      );
      if (status === 404) {
        const search = expect<Page<Task>>(
          await request('GET', `/tasks?search=${task.code}`, token(alias)),
          200,
          `search ${alias}/${task.alias}`,
        );
        assert.equal(search.total, 0, `hidden search ${alias}/${task.alias}`);
        expect(
          await request('GET', `/tasks/${id}/comments`, token(alias)),
          404,
          `hidden comments ${alias}/${task.alias}`,
        );
        expect(
          await request('GET', `/tasks/${id}/events`, token(alias)),
          404,
          `hidden events ${alias}/${task.alias}`,
        );
      }
    }
  }

  const taskId = (alias: string): string => byAlias.get(alias)!.id;
  const detail = expect<{
    task: Task;
    participants: unknown[];
    files: Array<Record<string, unknown>>;
    latestSubmission: { fileIds: string[] };
    historyCounts: Record<string, number>;
  }>(
    await request('GET', `/tasks/${taskId('t02')}`, token('u01')),
    200,
    'detail relations',
  );
  assert.equal(detail.participants.length, 1);
  assert.equal(detail.files.length, 1);
  assert.equal(detail.latestSubmission.fileIds.length, 1);
  assert.equal(detail.historyCounts.submissions, 1);
  assert.ok(!('archivedAt' in detail.task));
  assert.ok(!('objectKey' in detail.files[0]));
  const approvedDetail = expect<{
    files: unknown[];
    latestSubmission: { fileIds: string[] };
    historyCounts: { submissions: number; approvals: number };
  }>(
    await request('GET', `/tasks/${byAlias.get('t05')!.id}`, token('u02')),
    200,
    'approved task relations',
  );
  assert.equal(approvedDetail.historyCounts.submissions, 2);
  assert.equal(approvedDetail.historyCounts.approvals, 2);
  assert.equal(approvedDetail.latestSubmission.fileIds.length, 1);
  assert.equal(approvedDetail.files.length, 1);

  const scoped = async (alias: string, query: string): Promise<Page<Task>> =>
    expect<Page<Task>>(
      await request('GET', `/tasks?${query}`, token(alias)),
      200,
      query,
    );
  assert.equal((await scoped('u02', 'scope=COLLABORATING')).total, 1);
  assert.equal((await scoped('u04', 'scope=WATCHING')).total, 1);
  assert.equal((await scoped('u01', 'type=PERSONAL')).total, 0);
  assert.equal((await scoped('u01', 'status=DRAFT')).total, 1);
  assert.equal((await scoped('u06', 'status=DRAFT')).total, 0);
  assert.equal((await scoped('u01', 'priority=URGENT')).total, 2);
  assert.equal(
    (await scoped('u01', `projectId=${byAlias.get('t01')!.projectId}`)).total,
    3,
  );
  assert.equal(
    (await scoped('u01', `primaryAssigneeId=${userId('u02')}`)).total,
    3,
  );
  assert.equal(
    (
      await scoped(
        'u01',
        'dueFrom=2026-10-29T00%3A00%3A00.000Z&dueTo=2026-10-30T23%3A59%3A59.000Z',
      )
    ).total,
    1,
  );
  const overdue = seeded.filter(
    (task) =>
      visibleTo('u01', task) &&
      ['TODO', 'IN_PROGRESS', 'IN_REVIEW'].includes(task.status) &&
      task.dueAt !== null &&
      new Date(task.dueAt).getTime() < Date.now(),
  );
  assert.equal((await scoped('u01', 'isOverdue=true')).total, overdue.length);
  for (const query of [
    'page=0',
    'pageSize=101',
    'isOverdue=abc',
    'dueFrom=2026-10-29',
    'dueFrom=2026-11-01T00%3A00%3A00.000Z&dueTo=2026-10-01T00%3A00%3A00.000Z',
  ]) {
    expect(await request('GET', `/tasks?${query}`, token('u01')), 400, query);
  }
  const first = await scoped(
    'u01',
    'sortBy=DUE_AT&sortDirection=ASC&pageSize=3&page=1',
  );
  const second = await scoped(
    'u01',
    'sortBy=DUE_AT&sortDirection=ASC&pageSize=3&page=2',
  );
  const combined = [...first.items, ...second.items];
  assert.equal(new Set(combined.map((task) => task.id)).size, 6);
  assert.deepEqual(
    combined.map((task) => task.id),
    (await scoped('u01', 'sortBy=DUE_AT&sortDirection=ASC&pageSize=100')).items
      .slice(0, 6)
      .map((task) => task.id),
  );

  expect(
    await request('POST', '/tasks', token('u02'), {
      type: 'OFFICIAL',
      title: 'Forbidden',
    }),
    403,
    'staff create',
  );
  for (const type of ['TEAM', 'PERSONAL']) {
    expect(
      await request('POST', '/tasks', token('u01'), { type, title: 'P1 gate' }),
      400,
      `${type} create`,
    );
  }
  for (const extra of [
    { status: 'TODO' },
    { createdById: userId('u02') },
    { dueAt: '2026-11-15T09:00:00.000Z', dueDate: '2026-11-15' },
    { collaboratorIds: [userId('u02')], watcherIds: [userId('u02')] },
    { primaryAssigneeId: userId('u02'), collaboratorIds: [userId('u02')] },
    { projectId: byAlias.get('t01')!.projectId },
    { parentTaskId: taskId('t01') },
  ]) {
    expect(
      await request('POST', '/tasks', token('u01'), {
        type: 'OFFICIAL',
        title: 'Invalid',
        ...extra,
      }),
      400,
      'invalid create',
    );
  }
  const created = expect<Task>(
    await request('POST', '/tasks', token('u01'), {
      type: 'OFFICIAL',
      title: 'Phase 03 draft',
      dueDate: '2026-11-15',
      primaryAssigneeId: userId('u02'),
      collaboratorIds: [userId('u03')],
      watcherIds: [userId('u04')],
    }),
    201,
    'create draft',
  );
  assert.equal(created.status, 'DRAFT');
  assert.equal(created.dueAt, '2026-11-15T09:00:00.000Z');
  const createdDetail = expect<{
    participants: Array<{ invitationStatus: string }>;
    historyCounts: { events: number };
  }>(
    await request('GET', `/tasks/${created.id}`, token('u01')),
    200,
    'created detail',
  );
  assert.equal(createdDetail.participants.length, 2);
  assert.ok(
    createdDetail.participants.every((p) => p.invitationStatus === 'ACCEPTED'),
  );
  assert.equal(createdDetail.historyCounts.events, 1);
  for (const alias of ['u02', 'u03', 'u04', 'u06']) {
    expect(
      await request('GET', `/tasks/${created.id}`, token(alias)),
      404,
      `draft hidden ${alias}`,
    );
  }
  const updated = expect<Task>(
    await request('PATCH', `/tasks/${created.id}`, token('u01'), {
      title: 'Updated draft',
      priority: 'HIGH',
    }),
    200,
    'patch draft',
  );
  assert.equal(updated.version, created.version + 1);
  const events = expect<Page<{ kind: string }>>(
    await request('GET', `/tasks/${created.id}/events`, token('u01')),
    200,
    'created events',
  );
  assert.deepEqual(events.items.map((event) => event.kind).sort(), [
    'CREATED',
    'DETAILS_UPDATED',
  ]);
  expect(
    await request('PATCH', `/tasks/${created.id}`, token('u06'), {
      title: 'No',
    }),
    404,
    'other leader draft patch',
  );
  expect(
    await request('PATCH', `/tasks/${taskId('t01')}`, token('u02'), {
      title: 'No',
    }),
    403,
    'staff patch',
  );
  for (const extra of [
    { status: 'DONE' },
    { dueAt: '2026-11-01T00:00:00.000Z' },
    { primaryAssigneeId: userId('u03') },
  ]) {
    expect(
      await request('PATCH', `/tasks/${taskId('t01')}`, token('u01'), extra),
      400,
      'system field patch',
    );
  }
  expect(
    await request('PATCH', `/tasks/${taskId('t01')}`, token('u01'), {
      priority: 'URGENT',
    }),
    400,
    'published priority',
  );
  expect(
    await request('PATCH', `/tasks/${taskId('t05')}`, token('u01'), {
      title: 'No',
    }),
    409,
    'DONE patch',
  );
  expect(
    await request('PATCH', `/tasks/${taskId('t08')}`, token('u01'), {
      title: 'No',
    }),
    409,
    'CANCELLED patch',
  );
  expect(
    await request('PATCH', `/tasks/${taskId('t10')}`, token('u02'), {
      title: 'No',
    }),
    403,
    'TEAM patch gate',
  );
  const published = expect<Task>(
    await request('PATCH', `/tasks/${taskId('t01')}`, token('u06'), {
      description: 'Phase 03 metadata',
    }),
    200,
    'published patch',
  );
  assert.equal(published.version, byAlias.get('t01')!.version + 1);

  const comment = expect<{ id: string; authorId: string; body: string }>(
    await request('POST', `/tasks/${taskId('t01')}/comments`, token('u03'), {
      body: '  Phase 03 comment  ',
    }),
    201,
    'comment by collaborator',
  );
  assert.equal(comment.authorId, userId('u03'));
  assert.equal(comment.body, 'Phase 03 comment');
  assert.equal(
    (await request('GET', `/tasks/${taskId('t01')}/comments`, token('u02')))
      .status,
    200,
  );
  for (const body of ['', '   ', 'x'.repeat(4001)]) {
    expect(
      await request('POST', `/tasks/${taskId('t01')}/comments`, token('u02'), {
        body,
      }),
      400,
      'invalid comment',
    );
  }
  expect(
    await request('POST', `/tasks/${created.id}/comments`, token('u01'), {
      body: 'No',
    }),
    409,
    'draft comment',
  );
  expect(
    await request('POST', `/tasks/${taskId('t05')}/comments`, token('u01'), {
      body: 'No',
    }),
    409,
    'DONE comment',
  );
  expect(
    await request('POST', `/tasks/${taskId('t10')}/comments`, token('u02'), {
      body: 'No',
    }),
    403,
    'TEAM comment gate',
  );
  expect(
    await request('POST', `/tasks/${taskId('t12')}/comments`, token('u01'), {
      body: 'No',
    }),
    404,
    'hidden comment',
  );
  const commentEvents = expect<Page<{ kind: string }>>(
    await request('GET', `/tasks/${taskId('t01')}/events`, token('u02')),
    200,
    'comment event',
  );
  assert.ok(
    commentEvents.items.some((event) => event.kind === 'COMMENT_ADDED'),
  );

  const concurrent = await Promise.all([
    request('POST', '/tasks', token('u01'), {
      type: 'OFFICIAL',
      title: 'Concurrent A',
    }),
    request('POST', '/tasks', token('u06'), {
      type: 'OFFICIAL',
      title: 'Concurrent B',
    }),
  ]);
  const newTasks = concurrent.map((reply, index) =>
    expect<Task>(reply, 201, `concurrent ${index}`),
  );
  assert.equal(new Set(newTasks.map((task) => task.code)).size, 2);
  assert.ok(newTasks.every((task) => /^CV-\d{4}-\d{4,}$/.test(task.code)));
  for (const sortDirection of ['ASC', 'DESC']) {
    const sorted = await scoped(
      'u01',
      `sortBy=DUE_AT&sortDirection=${sortDirection}&pageSize=100`,
    );
    const firstNull = sorted.items.findIndex((task) => task.dueAt === null);
    assert.ok(firstNull >= 0, `null due date exists for ${sortDirection}`);
    assert.ok(
      sorted.items.slice(firstNull).every((task) => task.dueAt === null),
      `null due dates are last for ${sortDirection}`,
    );
  }

  // The Phase 04 journey now verifies comments across real lifecycle changes.
  const prisma = new PrismaClient();
  try {
    const saved = expect<Page<{ id: string }>>(
      await request('GET', `/tasks/${taskId('t01')}/comments`, token('u03')),
      200,
      'comment remains available',
    );
    assert.ok(saved.items.some((item) => item.id === comment.id));
    await prisma.task.update({
      where: { id: newTasks[0].id },
      data: { archivedAt: new Date() },
    });
    expect(
      await request('GET', `/tasks/${newTasks[0].id}`, token('u01')),
      404,
      'archived task hidden',
    );
  } finally {
    await prisma.$disconnect();
  }

  const locked = token('u05');
  expect(
    await request('PATCH', `/users/${userId('u05')}`, token('u01'), {
      status: 'LOCKED',
    }),
    200,
    'lock user',
  );
  expect(await request('GET', '/tasks', locked), 401, 'locked token');
  expect(
    await request('GET', `/tasks/${taskId('t04')}`, locked),
    401,
    'locked detail',
  );
  expect(
    await request('POST', `/tasks/${taskId('t04')}/comments`, locked, {
      body: 'No',
    }),
    401,
    'locked comment',
  );
  expect(
    await request('POST', '/tasks', undefined, {
      type: 'OFFICIAL',
      title: 'No',
    }),
    401,
    'unauthenticated create',
  );
  expect(
    await request('GET', '/tasks/not-a-uuid', token('u01')),
    400,
    'invalid task id',
  );
  expect(
    await request('POST', `/tasks/${taskId('t01')}/publish`, token('u01')),
    409,
    'workflow command is enabled and validates current status',
  );
  expect(
    await request('POST', `/tasks/${taskId('t10')}/complete`, token('u02'), {}),
    404,
    'Phase 09 gate',
  );

  process.stdout.write(
    'PASS Phase 03 task ACL, query, detail, create, edit, comment, concurrency and gates\n',
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(`FAIL Phase 03 task checks: ${String(error)}\n`);
  process.exitCode = 1;
});
