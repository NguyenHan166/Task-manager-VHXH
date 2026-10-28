import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

type FixtureUser = { alias: string; email: string };
type Fixture = { users: FixtureUser[] };
type ApiReply = {
  status: number;
  data: unknown;
  error?: { code?: string; message?: string };
};
type Session = { accessToken: string; user: { id: string } };
type Task = {
  id: string;
  code: string;
  status: string;
  version: number;
  dueAt: string | null;
  primaryAssigneeId: string | null;
  progressPercent: number;
  completedAt: string | null;
  approvedById: string | null;
  approvedAt: string | null;
  completionDueAtSnapshot: string | null;
};
type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
type Submission = {
  id: string;
  submittedById: string;
  status: string;
  withdrawnReason: string | null;
  fileIds: string[];
};

const baseUrl = new URL(
  process.env.TASK_WORKFLOW_CHECK_BASE_URL ??
    `http://127.0.0.1:${process.env.PORT ?? '3000'}/api`,
);
if (!['localhost', '127.0.0.1', '::1'].includes(baseUrl.hostname)) {
  throw new Error('Workflow checks can only target a localhost API.');
}
const databaseUrl = process.env.DATABASE_URL;
if (
  !databaseUrl ||
  !['localhost', '127.0.0.1', '::1'].includes(new URL(databaseUrl).hostname)
) {
  throw new Error('Workflow checks require a localhost database.');
}
const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
if (
  process.env.CI !== 'true' &&
  !databaseName.startsWith('office_workspace_phase04_verify')
) {
  throw new Error(
    'Use a disposable database named office_workspace_phase04_verify*; the normal local database is refused.',
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

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const sessions = new Map<string, Session>();
    for (const alias of ['u01', 'u06', 'u02', 'u03']) {
      const user = users.get(alias);
      assert.ok(user, `fixture user ${alias} exists`);
      const session = expect<Session>(
        await request('POST', '/auth/login', undefined, {
          email: user.email,
          password: demoPassword,
        }),
        200,
        `login ${alias}`,
      );
      sessions.set(alias, session);
    }
    const token = (alias: string): string => sessions.get(alias)!.accessToken;
    const userId = (alias: string): string => sessions.get(alias)!.user.id;

    const createDraft = async (
      title: string,
      assignee: string | null = userId('u02'),
      collaborators: string[] = [],
    ): Promise<Task> =>
      expect<Task>(
        await request('POST', '/tasks', token('u01'), {
          type: 'OFFICIAL',
          title,
          deliverable: 'Kết quả nghiệm thu',
          ...(assignee ? { primaryAssigneeId: assignee } : {}),
          collaboratorIds: collaborators,
          dueDate: '2030-01-15',
        }),
        201,
        `create ${title}`,
      );
    const publish = async (task: Task, leader = 'u01'): Promise<Task> =>
      expect<Task>(
        await request('POST', `/tasks/${task.id}/publish`, token(leader)),
        200,
        `publish ${task.code}`,
      );
    const start = async (task: Task, actor = 'u02'): Promise<Task> =>
      expect<Task>(
        await request('POST', `/tasks/${task.id}/start`, token(actor)),
        200,
        `start ${task.code}`,
      );
    const submit = async (
      task: Task,
      summary: string,
    ): Promise<{ submission: Submission; task: Task }> =>
      expect<{ submission: Submission; task: Task }>(
        await request('POST', `/tasks/${task.id}/submissions`, token('u02'), {
          summary,
          fileIds: [],
        }),
        201,
        `submit ${task.code}`,
      );

    const invalidDraft = await createDraft('Phase 04 invalid draft', null);
    expect(
      await request('POST', `/tasks/${invalidDraft.id}/publish`, token('u01')),
      400,
      'publish requires assignee',
    );
    assert.equal(
      await prisma.taskEvent.count({
        where: { taskId: invalidDraft.id, kind: 'PUBLISHED' },
      }),
      0,
    );
    expect(
      await request('POST', `/tasks/${invalidDraft.id}/cancel`, token('u01'), {
        reason: 'Không triển khai bản nháp thiếu thông tin',
      }),
      200,
      'cancel invalid draft',
    );
    expect(
      await request('POST', `/tasks/${invalidDraft.id}/reopen`, token('u01'), {
        reason: 'Mở lại bản nháp chưa đủ điều kiện',
      }),
      409,
      'cannot reopen invalid draft to TODO',
    );

    const rollbackTask = await createDraft('Phase 04 injected rollback');
    try {
      await prisma.$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS workflow_check_fail_notifications ON notifications
      `);
      await prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION workflow_check_fail_notifications()
        RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'injected workflow notification failure';
        END;
        $$ LANGUAGE plpgsql
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TRIGGER workflow_check_fail_notifications
        BEFORE INSERT ON notifications
        FOR EACH ROW EXECUTE FUNCTION workflow_check_fail_notifications()
      `);
      expect(
        await request(
          'POST',
          `/tasks/${rollbackTask.id}/publish`,
          token('u01'),
        ),
        500,
        'notification failure rolls the whole command back',
      );
    } finally {
      await prisma.$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS workflow_check_fail_notifications ON notifications
      `);
      await prisma.$executeRawUnsafe(`
        DROP FUNCTION IF EXISTS workflow_check_fail_notifications()
      `);
    }
    const rolledBackTask = await prisma.task.findUniqueOrThrow({
      where: { id: rollbackTask.id },
    });
    assert.equal(rolledBackTask.status, 'DRAFT');
    assert.equal(
      await prisma.taskEvent.count({
        where: { taskId: rollbackTask.id, kind: 'PUBLISHED' },
      }),
      0,
    );
    assert.equal(
      await prisma.notification.count({ where: { taskId: rollbackTask.id } }),
      0,
    );

    const journey = await createDraft('Phase 04 main journey', userId('u02'), [
      userId('u03'),
    ]);
    expect(
      await request('POST', `/tasks/${journey.id}/publish`, token('u06')),
      404,
      'other leader cannot publish a draft',
    );
    const published = await publish(journey);
    assert.equal(published.status, 'TODO');
    expect(
      await request('POST', `/tasks/${journey.id}/publish`, token('u01')),
      409,
      'publish replay conflicts without duplicate history',
    );
    assert.equal(
      await prisma.taskEvent.count({
        where: { taskId: journey.id, kind: 'PUBLISHED' },
      }),
      1,
    );
    const publishedEvent = await prisma.taskEvent.findFirstOrThrow({
      where: { taskId: journey.id, kind: 'PUBLISHED' },
    });
    const publishNotices = await prisma.notification.findMany({
      where: { businessEventId: publishedEvent.id },
    });
    assert.equal(publishNotices.length, 1);
    assert.equal(publishNotices[0].recipientId, userId('u02'));
    expect(
      await request('POST', `/tasks/${journey.id}/start`, token('u03')),
      403,
      'collaborator cannot start',
    );
    await start(journey);
    const lifecycleComment = expect<{ id: string }>(
      await request('POST', `/tasks/${journey.id}/comments`, token('u03'), {
        body: 'Theo dõi qua vòng đời nhiệm vụ',
      }),
      201,
      'collaborator comment before completion',
    );
    const fullProgress = expect<Task>(
      await request('POST', `/tasks/${journey.id}/progress`, token('u02'), {
        progressPercent: 100,
        isBlocked: false,
      }),
      200,
      '100 percent progress',
    );
    assert.equal(fullProgress.status, 'IN_PROGRESS');
    assert.equal(
      (
        await request('POST', `/tasks/${journey.id}/progress`, token('u02'), {
          progressPercent: 100,
          isBlocked: false,
        })
      ).status,
      200,
      'same-value progress replay is accepted without duplicate history',
    );
    assert.equal(
      await prisma.taskEvent.count({
        where: { taskId: journey.id, kind: 'PROGRESS_UPDATED' },
      }),
      1,
    );
    expect(
      await request('POST', `/tasks/${journey.id}/progress`, token('u03'), {
        progressPercent: 75,
        isBlocked: false,
      }),
      403,
      'other staff cannot update progress',
    );
    expect(
      await request('POST', `/tasks/${journey.id}/progress`, token('u02'), {
        progressPercent: 100,
        isBlocked: true,
      }),
      400,
      'blocked progress requires reason',
    );
    expect<Task>(
      await request('POST', `/tasks/${journey.id}/progress`, token('u02'), {
        progressPercent: 100,
        isBlocked: true,
        blockedReason: 'Chờ số liệu xác nhận',
      }),
      200,
      'mark blocked',
    );
    const blockedEvent = await prisma.taskEvent.findFirstOrThrow({
      where: { taskId: journey.id, kind: 'BLOCKED' },
    });
    assert.deepEqual(
      (
        await prisma.notification.findMany({
          where: { businessEventId: blockedEvent.id },
          select: { recipientId: true },
        })
      )
        .map((notification) => notification.recipientId)
        .sort(),
      [userId('u01'), userId('u06')].sort(),
      'blocked alert goes to active leaders and excludes its actor',
    );
    expect<Task>(
      await request('POST', `/tasks/${journey.id}/progress`, token('u02'), {
        progressPercent: 100,
        isBlocked: false,
      }),
      200,
      'clear blocked state',
    );
    expect(
      await request('POST', `/tasks/${journey.id}/submissions`, token('u02'), {
        summary: 'Invalid file must roll back',
        fileIds: ['00000000-0000-4000-8000-000000000099'],
      }),
      400,
      'submission rejects unavailable file',
    );
    assert.equal(
      (await prisma.task.findUniqueOrThrow({ where: { id: journey.id } }))
        .status,
      'IN_PROGRESS',
    );
    assert.equal(
      await prisma.taskSubmission.count({ where: { taskId: journey.id } }),
      0,
    );

    expect(
      await request('POST', `/tasks/${journey.id}/submissions`, token('u03'), {
        summary: 'Collaborator cannot submit',
        fileIds: [],
      }),
      403,
      'collaborator cannot submit',
    );
    const firstSubmission = await submit(journey, 'Lần nộp đầu');
    assert.equal(firstSubmission.task.status, 'IN_REVIEW');
    assert.equal(firstSubmission.submission.submittedById, userId('u02'));
    expect(
      await request('POST', `/tasks/${journey.id}/submissions`, token('u02'), {
        summary: 'Duplicate submission',
        fileIds: [],
      }),
      409,
      'submit replay conflicts',
    );
    const submitNotices = await prisma.notification.count({
      where: {
        taskId: journey.id,
        type: 'SUBMISSION_RECEIVED',
      },
    });
    assert.equal(submitNotices, 2, 'submission notifies active leaders');
    const withdrawals = await Promise.all([
      request(
        'POST',
        `/tasks/${journey.id}/submissions/${firstSubmission.submission.id}/withdraw`,
        token('u02'),
        { reason: 'Cần đính chính' },
      ),
      request(
        'POST',
        `/tasks/${journey.id}/submissions/${firstSubmission.submission.id}/withdraw`,
        token('u02'),
        { reason: 'Cần đính chính' },
      ),
    ]);
    assert.deepEqual(
      withdrawals.map((reply) => reply.status).sort(),
      [200, 409],
      'only one concurrent withdrawal succeeds',
    );
    const withdrawn = await prisma.taskSubmission.findUniqueOrThrow({
      where: { id: firstSubmission.submission.id },
    });
    assert.equal(withdrawn.status, 'WITHDRAWN');
    assert.equal(withdrawn.withdrawnReason, 'Cần đính chính');
    const afterWithdraw = await prisma.task.findUniqueOrThrow({
      where: { id: journey.id },
    });
    assert.equal(afterWithdraw.status, 'IN_PROGRESS');
    assert.equal(afterWithdraw.progressPercent, 90);

    const secondSubmission = await submit(journey, 'Lần nộp thứ hai');
    expect(
      await request('POST', `/tasks/${journey.id}/approve`, token('u02'), {
        submissionId: secondSubmission.submission.id,
      }),
      403,
      'staff cannot approve their own submission',
    );
    const adjustedDuringReview = expect<Task>(
      await request('POST', `/tasks/${journey.id}/adjust`, token('u06'), {
        dueDate: '2030-02-15',
        priority: 'HIGH',
        reason: 'Điều chỉnh lịch trong lúc chờ duyệt',
      }),
      200,
      'leader can adjust while IN_REVIEW',
    );
    assert.equal(adjustedDuringReview.status, 'IN_REVIEW');
    assert.equal(
      (
        await prisma.taskSubmission.findUniqueOrThrow({
          where: { id: secondSubmission.submission.id },
        })
      ).status,
      'PENDING',
      'adjustment does not change pending submission',
    );
    expect(
      await request('POST', `/tasks/${journey.id}/return`, token('u06'), {
        submissionId: secondSubmission.submission.id,
        reason: 'Bổ sung căn cứ',
      }),
      200,
      'deputy returns submission',
    );
    const returnApproval = await prisma.taskApproval.findUniqueOrThrow({
      where: { submissionId: secondSubmission.submission.id },
    });
    assert.equal(returnApproval.decision, 'RETURNED');
    assert.equal(returnApproval.reason, 'Bổ sung căn cứ');
    const returnEvent = await prisma.taskEvent.findFirstOrThrow({
      where: { taskId: journey.id, kind: 'RETURNED' },
    });
    const returnNotices = await prisma.notification.findMany({
      where: { businessEventId: returnEvent.id },
      select: { recipientId: true, type: true },
    });
    assert.deepEqual(returnNotices, [
      { recipientId: userId('u02'), type: 'SUBMISSION_RETURNED' },
    ]);
    assert.equal(
      (
        await prisma.taskSubmission.findUniqueOrThrow({
          where: { id: secondSubmission.submission.id },
        })
      ).status,
      'RETURNED',
    );
    const thirdSubmission = await submit(journey, 'Lần nộp sau khi bổ sung');
    assert.notEqual(
      thirdSubmission.submission.id,
      secondSubmission.submission.id,
    );
    const approvalsRace = await Promise.all([
      request('POST', `/tasks/${journey.id}/approve`, token('u01'), {
        submissionId: thirdSubmission.submission.id,
      }),
      request('POST', `/tasks/${journey.id}/approve`, token('u06'), {
        submissionId: thirdSubmission.submission.id,
      }),
    ]);
    assert.deepEqual(
      approvalsRace.map((reply) => reply.status).sort(),
      [200, 409],
      'only one concurrent leader decision succeeds',
    );
    const approvedTask = await prisma.task.findUniqueOrThrow({
      where: { id: journey.id },
    });
    assert.equal(approvedTask.status, 'DONE');
    assert.ok(approvedTask.completedAt);
    assert.ok(approvedTask.approvedById);
    assert.ok(approvedTask.approvedAt);
    assert.equal(
      approvedTask.completionDueAtSnapshot?.toISOString(),
      new Date('2030-02-15T09:00:00.000Z').toISOString(),
      'approval snapshots the current adjusted due date',
    );
    const approvedEvent = await prisma.taskEvent.findFirstOrThrow({
      where: { taskId: journey.id, kind: 'APPROVED' },
    });
    const approvalNotices = await prisma.notification.findMany({
      where: { businessEventId: approvedEvent.id },
      select: { recipientId: true, type: true },
    });
    assert.deepEqual(approvalNotices, [
      { recipientId: userId('u02'), type: 'SUBMISSION_APPROVED' },
    ]);
    assert.equal(
      await prisma.taskApproval.count({ where: { taskId: journey.id } }),
      2,
    );
    assert.equal(
      await prisma.taskSubmission.count({ where: { taskId: journey.id } }),
      3,
    );
    const retainedComments = expect<Page<{ id: string }>>(
      await request('GET', `/tasks/${journey.id}/comments`, token('u03')),
      200,
      'comment history remains readable after completion',
    );
    assert.ok(
      retainedComments.items.some((item) => item.id === lifecycleComment.id),
    );
    expect(
      await request('POST', `/tasks/${journey.id}/progress`, token('u01'), {
        progressPercent: 80,
        isBlocked: false,
      }),
      409,
      'DONE task cannot receive progress updates',
    );
    const approvalPage = expect<Page<{ decision: string }>>(
      await request('GET', `/tasks/${journey.id}/approvals`, token('u01')),
      200,
      'approval history is readable',
    );
    assert.equal(approvalPage.total, 2);
    const submissionPage = expect<Page<Submission>>(
      await request('GET', `/tasks/${journey.id}/submissions`, token('u02')),
      200,
      'submission history is readable',
    );
    assert.equal(submissionPage.total, 3);
    assert.equal(
      submissionPage.items.find(
        (item) => item.id === firstSubmission.submission.id,
      )?.status,
      'WITHDRAWN',
    );
    const reopened = expect<Task>(
      await request('POST', `/tasks/${journey.id}/reopen`, token('u06'), {
        reason: 'Cần cập nhật sau khi hoàn thành',
      }),
      200,
      'reopen DONE task',
    );
    assert.equal(reopened.status, 'IN_PROGRESS');
    assert.equal(reopened.completedAt, null);
    assert.equal(reopened.approvedById, null);
    assert.equal(reopened.approvedAt, null);
    assert.equal(reopened.completionDueAtSnapshot, null);
    assert.equal(
      await prisma.taskApproval.count({ where: { taskId: journey.id } }),
      2,
    );
    const afterReopenSubmission = await submit(journey, 'Lần nộp sau mở lại');
    assert.equal(afterReopenSubmission.task.status, 'IN_REVIEW');
    assert.equal(
      await prisma.taskSubmission.count({ where: { taskId: journey.id } }),
      4,
    );

    const adjustment = await createDraft(
      'Phase 04 adjustment and cancellation',
    );
    const adjustmentPublished = await publish(adjustment, 'u01');
    expect(
      await request('POST', `/tasks/${adjustment.id}/adjust`, token('u02'), {
        dueAt: '2030-03-01T09:00:00.000Z',
        reason: 'Staff không được đổi hạn',
      }),
      403,
      'staff cannot adjust a task',
    );
    expect(
      await request('PATCH', `/tasks/${adjustment.id}`, token('u01'), {
        dueAt: '2030-03-01T09:00:00.000Z',
      }),
      400,
      'generic PATCH cannot change deadline',
    );
    const reassigned = expect<Task>(
      await request('POST', `/tasks/${adjustment.id}/adjust`, token('u06'), {
        primaryAssigneeId: userId('u03'),
        dueAt: '2030-03-01T09:00:00.000Z',
        reason: 'Điều chỉnh chủ trì và thời hạn',
      }),
      200,
      'deputy adjusts and reassigns',
    );
    assert.equal(reassigned.primaryAssigneeId, userId('u03'));
    const reassignmentEvent = await prisma.taskEvent.findFirstOrThrow({
      where: { taskId: adjustment.id, kind: 'ASSIGNEE_CHANGED' },
    });
    const reassignmentNotices = await prisma.notification.findMany({
      where: { businessEventId: reassignmentEvent.id },
      select: { recipientId: true, type: true },
    });
    assert.deepEqual(
      reassignmentNotices
        .map((notice) => `${notice.recipientId}:${notice.type}`)
        .sort(),
      [
        `${userId('u02')}:TASK_UPDATED`,
        `${userId('u03')}:TASK_ASSIGNED`,
      ].sort(),
    );
    expect(
      await request('GET', `/tasks/${adjustment.id}`, token('u02')),
      404,
      'former assignee loses access',
    );
    expect(
      await request('GET', `/tasks/${adjustment.id}`, token('u03')),
      200,
      'new assignee gains access',
    );
    await start(adjustmentPublished, 'u03');
    expect(
      await request('POST', `/tasks/${adjustment.id}/cancel`, token('u01'), {
        reason: '   ',
      }),
      400,
      'cancellation requires a nonblank reason',
    );
    const cancelled = expect<Task>(
      await request('POST', `/tasks/${adjustment.id}/cancel`, token('u01'), {
        reason: 'Tạm dừng công việc',
      }),
      200,
      'cancel in-progress task',
    );
    assert.equal(cancelled.status, 'CANCELLED');
    expect(
      await request('POST', `/tasks/${adjustment.id}/progress`, token('u06'), {
        progressPercent: 50,
        isBlocked: false,
      }),
      409,
      'CANCELLED task cannot receive progress updates',
    );
    const reopenedCancelled = expect<Task>(
      await request('POST', `/tasks/${adjustment.id}/reopen`, token('u01'), {
        reason: 'Tiếp tục triển khai',
      }),
      200,
      'reopen a started cancelled task',
    );
    assert.equal(reopenedCancelled.status, 'IN_PROGRESS');

    const pendingCancel = await createDraft(
      'Phase 04 cancel pending submission',
    );
    const pendingPublished = await publish(pendingCancel);
    await start(pendingPublished);
    const pendingResult = await submit(pendingCancel, 'Sẽ đóng khi hủy task');
    expect(
      await request('POST', `/tasks/${pendingCancel.id}/cancel`, token('u06'), {
        reason: 'Dừng yêu cầu này',
      }),
      200,
      'cancel task in review',
    );
    assert.equal(
      (
        await prisma.taskSubmission.findUniqueOrThrow({
          where: { id: pendingResult.submission.id },
        })
      ).status,
      'WITHDRAWN',
    );
    assert.equal(
      await prisma.taskSubmission.count({
        where: { taskId: pendingCancel.id, status: 'PENDING' },
      }),
      0,
      'cancel closes the pending submission atomically',
    );
    assert.equal(
      await prisma.taskEvent.count({
        where: { taskId: pendingCancel.id, kind: 'SUBMISSION_WITHDRAWN' },
      }),
      1,
    );
    const cancelledEvent = await prisma.taskEvent.findFirstOrThrow({
      where: { taskId: pendingCancel.id, kind: 'CANCELLED' },
    });
    const cancellationNotices = await prisma.notification.findMany({
      where: { businessEventId: cancelledEvent.id },
      select: { recipientId: true, type: true },
    });
    assert.deepEqual(cancellationNotices, [
      { recipientId: userId('u02'), type: 'TASK_UPDATED' },
    ]);

    process.stdout.write(
      'PASS Phase 04 OFFICIAL workflow, ACL, transaction history, notification recipients, retries and concurrent decisions\n',
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`FAIL Phase 04 workflow checks: ${String(error)}\n`);
  process.exitCode = 1;
});
