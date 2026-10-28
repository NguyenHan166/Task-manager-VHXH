import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { PrismaClient } from '@prisma/client';
import { OperationsMetricsService } from '../src/modules/observability/operations-metrics.service';
import { renderCsv, renderXlsx } from '../src/modules/reports/report-export';

type FixtureUser = { alias: string; email: string };
type Session = { accessToken: string; user: { id: string; role: string } };
type Stats = {
  totalActivePublished?: number;
  totalOfficialCount?: number;
  todoCount?: number;
  doneCount?: number;
  overdueCount?: number;
  completedOnTimeCount?: number;
};
type TaskReportItem = {
  type: string;
  status: string;
  createdById: string;
};
type TaskReportPage = { items: TaskReportItem[]; total: number };
type KpiReport = { scope: 'DEPT' | 'STAFF'; summary: Stats };
type SettingsView = { reminderBeforeHours: number };
type AuditItem = {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};
type AuditPage = { items: AuditItem[] };
type OperationsSnapshot = {
  memoryBytes: { rss: number };
  cpuUsage: {
    windowMs: number;
    userMicros: number;
    systemMicros: number;
    percentOfOneCore: number;
  };
  databaseConnections: number;
  databaseConnectionLimit: number;
  counters: Record<string, number>;
  kpiQueryLatencyMs: {
    count: number;
    p95RecentWindow: number;
    recentSampleSize: number;
    recentWindowCapacity: number;
  };
};
type ApiReply = {
  status: number;
  data: unknown;
  requestId?: string;
  error?: { code?: string; message?: string };
};

const databaseUrl = process.env.DATABASE_URL;
const demoPassword = process.env.DEMO_SEED_PASSWORD;
if (!databaseUrl || !demoPassword) {
  throw new Error('DATABASE_URL and DEMO_SEED_PASSWORD are required.');
}
const parsedDatabaseUrl = new URL(databaseUrl);
const databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.slice(1));
if (!['localhost', '127.0.0.1', '::1'].includes(parsedDatabaseUrl.hostname)) {
  throw new Error(
    'Phase 07 acceptance only runs against a localhost database.',
  );
}
if (
  process.env.CI !== 'true' &&
  !databaseName.startsWith('office_workspace_phase07_verify')
) {
  throw new Error(
    'Use a disposable database named office_workspace_phase07_verify*; the normal local database is refused.',
  );
}
const fixture = JSON.parse(
  readFileSync(
    resolve(process.cwd(), '../docs/backend-plan/phase-00/kpi-fixture.v1.json'),
    'utf8',
  ),
) as { users: FixtureUser[]; clock: string };
const users = new Map(fixture.users.map((user) => [user.alias, user]));
const prisma = new PrismaClient();
let apiProcess: ChildProcess | null = null;
let baseUrl: URL;
let assertions = 0;

function check(condition: unknown, label: string): asserts condition {
  assert.ok(condition, label);
  assertions += 1;
}

function expect<T>(reply: ApiReply, status: number, label: string): T {
  assert.equal(
    reply.status,
    status,
    `${label}: ${reply.error?.code ?? ''} ${reply.error?.message ?? ''}`,
  );
  assertions += 1;
  return reply.data as T;
}

async function request(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
  requestId?: string,
): Promise<ApiReply> {
  const response = await fetch(new URL(path.replace(/^\//, ''), baseUrl), {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(requestId ? { 'x-request-id': requestId } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: unknown;
    error?: { code?: string; message?: string };
  };
  return {
    status: response.status,
    data: payload.data,
    requestId: response.headers.get('x-request-id') ?? undefined,
    error: payload.error,
  };
}

async function requestBinary(path: string, token: string) {
  const response = await fetch(new URL(path.replace(/^\//, ''), baseUrl), {
    headers: { authorization: `Bearer ${token}` },
  });
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    disposition: response.headers.get('content-disposition') ?? '',
    body: Buffer.from(await response.arrayBuffer()),
  };
}

async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not reserve a local API port.');
  }
  await new Promise<void>((resolveClose, reject) =>
    server.close((error) => (error ? reject(error) : resolveClose())),
  );
  return address.port;
}

async function startApi(): Promise<void> {
  const port = await freePort();
  baseUrl = new URL(`http://127.0.0.1:${port}/api/`);
  apiProcess = spawn(process.execPath, ['dist/main.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      APP_ENV: 'local',
      PORT: String(port),
      SYSTEM_CLOCK_OVERRIDE: fixture.clock,
    },
    stdio: 'ignore',
    windowsHide: true,
  });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (apiProcess.exitCode !== null) {
      throw new Error(
        `Phase 07 API exited during startup (${apiProcess.exitCode}).`,
      );
    }
    try {
      const response = await fetch(new URL('health/ready', baseUrl));
      if (response.ok) return;
    } catch {
      // Wait for the local API to become ready.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error('Phase 07 acceptance API did not become ready.');
}

async function stopApi(): Promise<void> {
  if (!apiProcess || apiProcess.exitCode !== null) return;
  const child = apiProcess;
  child.kill();
  const stopped = await Promise.race([
    once(child, 'exit').then(() => true),
    new Promise<boolean>((resolveWait) =>
      setTimeout(() => resolveWait(false), 5000),
    ),
  ]);
  if (!stopped) child.kill('SIGKILL');
}

function extractXlsxParts(buffer: Buffer): string[] {
  const parts: string[] = [];
  let offset = 0;
  while (
    offset + 30 <= buffer.length &&
    buffer.readUInt32LE(offset) === 0x04034b50
  ) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const dataStart = offset + 30 + nameLength + extraLength;
    const content = buffer.subarray(dataStart, dataStart + compressedSize);
    parts.push(
      (method === 8 ? inflateRawSync(content) : content).toString('utf8'),
    );
    offset = dataStart + compressedSize;
  }
  return parts;
}

async function main(): Promise<void> {
  const beforeSettings = await prisma.appSettings.findUniqueOrThrow({
    where: { id: 1 },
  });
  await startApi();
  try {
    const sessions = new Map<string, Session>();
    for (const alias of ['u01', 'u06', 'u02', 'u03']) {
      const user = users.get(alias);
      assert.ok(user, `seed fixture user ${alias} exists`);
      const session = expect<Session>(
        await request('POST', 'auth/login', undefined, {
          email: user.email,
          password: demoPassword,
        }),
        200,
        `login ${alias}`,
      );
      sessions.set(alias, session);
    }
    const token = (alias: string): string => sessions.get(alias)!.accessToken;

    const managerStats = expect<Stats>(
      await request('GET', 'dashboard/stats?scope=DEPT', token('u01')),
      200,
      'manager department dashboard',
    );
    assert.equal(managerStats.totalActivePublished, 7);
    assert.equal(managerStats.overdueCount, 1);
    assert.equal(managerStats.doneCount, 2);
    assert.equal(managerStats.completedOnTimeCount, 1);
    assertions += 4;

    const todoStats = expect<Stats>(
      await request(
        'GET',
        'dashboard/stats?scope=DEPT&status=TODO',
        token('u01'),
      ),
      200,
      'department dashboard status filter',
    );
    assert.equal(todoStats.todoCount, 2);
    assert.equal(todoStats.doneCount, 0);
    assert.equal(todoStats.completedOnTimeCount, 0);
    assertions += 3;

    const staffStats = expect<Stats>(
      await request('GET', 'dashboard/stats?scope=STAFF', token('u02')),
      200,
      'staff self dashboard',
    );
    check(
      staffStats.totalOfficialCount === undefined,
      'staff receives staff DTO only',
    );
    expect(
      await request('GET', 'dashboard/stats?scope=DEPT', token('u02')),
      403,
      'staff cannot query department dashboard',
    );

    const kpi = expect<KpiReport>(
      await request('GET', 'reports/kpi', token('u01')),
      200,
      'manager KPI report',
    );
    assert.equal(kpi.scope, 'DEPT');
    assert.equal(kpi.summary.totalActivePublished, 7);
    assert.equal(kpi.summary.overdueCount, 1);
    assert.equal(kpi.summary.completedOnTimeCount, 1);
    assertions += 4;
    const staffKpi = expect<KpiReport>(
      await request('GET', 'reports/kpi', token('u02')),
      200,
      'staff KPI report',
    );
    assert.equal(staffKpi.scope, 'STAFF');
    assertions += 1;

    const reportPage = expect<TaskReportPage>(
      await request('GET', 'reports/tasks?page=1&pageSize=100', token('u01')),
      200,
      'manager task report',
    );
    check(
      reportPage.items.length > 0,
      'department report includes fixture tasks',
    );
    check(
      reportPage.items.every(
        (task) =>
          task.type === 'OFFICIAL' &&
          task.status !== 'DRAFT' &&
          task.status !== 'CANCELLED',
      ),
      'department report contains only published official tasks',
    );
    const staffReport = expect<TaskReportPage>(
      await request('GET', 'reports/tasks?pageSize=100', token('u02')),
      200,
      'staff task report',
    );
    check(
      staffReport.items.every(
        (task) =>
          task.type !== 'PERSONAL' ||
          task.createdById === sessions.get('u02')!.user.id,
      ),
      'staff report does not expose another user personal task',
    );

    const csv = await requestBinary(
      'reports/tasks/export?format=CSV&pageSize=100',
      token('u01'),
    );
    assert.equal(csv.status, 200);
    assert.match(csv.contentType, /text\/csv/);
    assert.match(csv.disposition, /filename=".*\.csv"/);
    const csvText = csv.body.toString('utf8');
    assert.ok(csvText.startsWith('\uFEFF'));
    assert.match(csvText, /Mã công việc/);
    assert.match(csvText, /UTC/);
    assert.match(csvText, /Mẫu số: 2 task DONE/);
    assert.doesNotMatch(csvText, /PERSONAL/);
    assertions += 7;
    const xlsx = await requestBinary(
      'reports/tasks/export?format=XLSX&pageSize=100',
      token('u06'),
    );
    assert.equal(xlsx.status, 200);
    assert.deepEqual(xlsx.body.subarray(0, 2), Buffer.from('PK'));
    assert.match(xlsx.contentType, /spreadsheetml\.sheet/);
    const xlsxParts = extractXlsxParts(xlsx.body);
    check(
      xlsxParts.some((part) => part.includes('Mã công việc')),
      'XLSX contains Vietnamese worksheet content',
    );
    const staffExport = await requestBinary(
      'reports/tasks/export?format=CSV',
      token('u02'),
    );
    assert.equal(
      staffExport.status,
      403,
      'staff cannot export department report',
    );
    assertions += 1;
    const formulaCsv = renderCsv([['=HYPERLINK("https://example.invalid")']]);
    check(
      formulaCsv.toString('utf8').includes("'=HYPERLINK"),
      'CSV formula cells are prefixed as literal text',
    );
    const formulaXlsx = renderXlsx([['=1+1']]);
    check(
      extractXlsxParts(formulaXlsx).every((part) => !part.includes('<f>')),
      'XLSX cells are written as strings rather than formulas',
    );

    const originalSettings = expect<SettingsView>(
      await request('GET', 'settings', token('u01')),
      200,
      'read workspace settings',
    );
    expect(
      await request('PATCH', 'settings', token('u06'), {
        reminderBeforeHours: 2,
      }),
      403,
      'deputy cannot update settings',
    );
    expect(
      await request('PATCH', 'settings', token('u02'), {
        reminderBeforeHours: 2,
      }),
      403,
      'staff cannot update settings',
    );
    const nextReminder = originalSettings.reminderBeforeHours === 1 ? 2 : 1;
    const updatedSettings = expect<SettingsView>(
      await request('PATCH', 'settings', token('u01'), {
        reminderBeforeHours: nextReminder,
      }),
      200,
      'manager updates workspace setting',
    );
    assert.equal(updatedSettings.reminderBeforeHours, nextReminder);
    assertions += 1;

    expect(
      await request('GET', 'audit-logs', token('u06')),
      403,
      'deputy cannot read audit logs',
    );
    expect(
      await request('GET', 'audit-logs', token('u02')),
      403,
      'staff cannot read audit logs',
    );
    const redactionAction = `PHASE07_REDACTION_CHECK_${randomUUID()}`;
    const sensitiveAudit = await prisma.auditLog.create({
      data: {
        actorId: sessions.get('u01')!.user.id,
        action: redactionAction,
        entity: 'Acceptance',
        entityId: sessions.get('u01')!.user.id,
        before: { workspaceName: 'before', passwordHash: 'must-not-leak' },
        after: { workspaceName: 'after', signedUrl: 'must-not-leak' },
      },
    });
    const audit = expect<AuditPage>(
      await request(
        'GET',
        `audit-logs?kind=${redactionAction}&entityId=${sensitiveAudit.entityId}`,
        token('u01'),
      ),
      200,
      'manager reads filtered audit logs',
    );
    assert.equal(audit.items.length, 1);
    assert.deepEqual(audit.items[0]?.before, { workspaceName: 'before' });
    assert.deepEqual(audit.items[0]?.after, { workspaceName: 'after' });
    assertions += 3;
    await assert.rejects(
      prisma.auditLog.update({
        where: { id: sensitiveAudit.id },
        data: { action: 'MUTATED' },
      }),
      'audit log update is rejected by the append-only trigger',
    );
    assertions += 1;
    await assert.rejects(
      prisma.auditLog.delete({ where: { id: sensitiveAudit.id } }),
      'audit log delete is rejected by the append-only trigger',
    );
    assertions += 1;

    expect(
      await request('GET', 'backup', token('u02')),
      403,
      'staff cannot inspect backup status',
    );
    expect(
      await request('GET', 'backup', token('u01')),
      200,
      'manager reads backup metadata only',
    );
    const requestId = `phase07-correlation-${randomUUID()}`;
    const assigneeId = sessions.get('u02')!.user.id;
    const createTaskReply = await request(
      'POST',
      'tasks',
      token('u01'),
      {
        type: 'OFFICIAL',
        title: 'Phase 07 correlation acceptance',
        deliverable: 'Verify request to event and notification correlation',
        primaryAssigneeId: assigneeId,
        dueAt: '2027-01-15T09:00:00.000Z',
      },
      requestId,
    );
    const createdTask = expect<{ id: string }>(
      createTaskReply,
      201,
      'manager creates a task with a correlation request ID',
    );
    check(
      createTaskReply.requestId === requestId,
      'API echoes the correlation request ID',
    );
    check(
      (
        await prisma.taskEvent.findFirst({
          where: { taskId: createdTask.id, requestId },
          select: { kind: true },
        })
      )?.kind === 'CREATED',
      'created task event stores the request ID',
    );
    const publishRequestId = `${requestId}-publish`;
    expect(
      await request(
        'POST',
        `tasks/${createdTask.id}/publish`,
        token('u01'),
        undefined,
        publishRequestId,
      ),
      200,
      'manager publishes a task with a correlation request ID',
    );
    const publishEvent = await prisma.taskEvent.findFirst({
      where: { taskId: createdTask.id, requestId: publishRequestId },
      select: { id: true, kind: true },
    });
    check(
      publishEvent?.kind === 'PUBLISHED',
      'published event stores its request ID',
    );
    check(
      Boolean(
        publishEvent &&
          (await prisma.notification.findFirst({
            where: {
              businessEventId: publishEvent.id,
              recipientId: assigneeId,
            },
            select: { id: true },
          })),
      ),
      'notification links to the correlated published event',
    );
    const badLogin = await request('POST', 'auth/login', undefined, {
      email: 'unknown-phase07@example.invalid',
      password: 'wrong-password-phase07',
    });
    expect(badLogin, 401, 'failed login uses generic unauthorized response');
    const operations = expect<OperationsSnapshot>(
      await request('GET', 'operations/metrics', token('u01')),
      200,
      'manager reads operations snapshot',
    );
    check(
      operations.memoryBytes.rss > 0,
      'operations snapshot has process memory',
    );
    check(
      operations.databaseConnections > 0,
      'operations snapshot has DB connection count',
    );
    check(
      operations.databaseConnectionLimit >= operations.databaseConnections,
      'operations snapshot has DB connection limit',
    );
    check(
      operations.cpuUsage.windowMs > 0 &&
        operations.cpuUsage.userMicros >= 0 &&
        operations.cpuUsage.systemMicros >= 0,
      'operations snapshot has bounded process CPU usage sample',
    );
    check(
      operations.counters.login_failures >= 1,
      'failed login metric is recorded',
    );
    check(
      operations.kpiQueryLatencyMs.recentSampleSize > 0 &&
        operations.kpiQueryLatencyMs.recentSampleSize <=
          operations.kpiQueryLatencyMs.recentWindowCapacity &&
        operations.kpiQueryLatencyMs.p95RecentWindow >= 0,
      'operations snapshot reports bounded-window KPI p95',
    );
    const metricProbe = new OperationsMetricsService();
    for (let value = 1; value <= 100; value += 1) {
      metricProbe.observeKpiQuery(value);
    }
    check(
      metricProbe.snapshot().kpiQueryLatencyMs.p95RecentWindow === 95,
      'KPI p95 uses nearest-rank percentile semantics',
    );
    for (let value = 101; value <= 600; value += 1) {
      metricProbe.observeKpiQuery(value);
    }
    const boundedMetrics = metricProbe.snapshot().kpiQueryLatencyMs;
    check(
      boundedMetrics.recentSampleSize === 512 &&
        boundedMetrics.p95RecentWindow === 575,
      'KPI p95 uses only the bounded recent sample window',
    );

    process.stdout.write(
      `PASS Phase 07 API and export acceptance (${assertions} assertions)\n`,
    );
  } finally {
    await prisma.appSettings.update({
      where: { id: 1 },
      data: { reminderBeforeHours: beforeSettings.reminderBeforeHours },
    });
    await stopApi();
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `FAIL Phase 07 acceptance: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
