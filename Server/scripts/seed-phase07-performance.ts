import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PrismaClient,
  TaskPriority,
  TaskStatus,
  TaskType,
} from '@prisma/client';

const MAX_TASKS = 50_000;
const BATCH_SIZE = 1_000;
const PERF_CODE_PREFIX = 'PERF07-';
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const parsedDatabaseUrl = new URL(databaseUrl);
const databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.slice(1));
if (
  !['localhost', '127.0.0.1', '::1'].includes(parsedDatabaseUrl.hostname) ||
  !databaseName.startsWith('office_workspace_phase07_perf_verify')
) {
  throw new Error(
    'Performance fixture seeding is restricted to a localhost database named office_workspace_phase07_perf_verify*.',
  );
}

const taskCountArgument = process.argv.find((argument) =>
  argument.startsWith('--tasks='),
);
const taskCount = taskCountArgument
  ? Number(taskCountArgument.slice('--tasks='.length))
  : 10_000;
if (
  !Number.isSafeInteger(taskCount) ||
  taskCount < 1 ||
  taskCount > MAX_TASKS
) {
  throw new Error(`--tasks must be an integer between 1 and ${MAX_TASKS}.`);
}

const fixture = JSON.parse(
  readFileSync(
    resolve(process.cwd(), '../docs/backend-plan/phase-00/kpi-fixture.v1.json'),
    'utf8',
  ),
) as { users: Array<{ alias: string; email: string }>; clock: string };

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const emails = new Map(
      fixture.users.map((user) => [user.alias, user.email.toLowerCase()]),
    );
    const requiredAliases = ['u01', 'u02', 'u03', 'u04', 'u05'];
    const users = await prisma.user.findMany({
      where: {
        email: { in: requiredAliases.map((alias) => emails.get(alias)!) },
      },
      select: { id: true, email: true },
    });
    const usersByEmail = new Map(users.map((user) => [user.email, user.id]));
    const managerId = usersByEmail.get(emails.get('u01')!);
    const staffIds = ['u02', 'u03', 'u04', 'u05']
      .map((alias) => usersByEmail.get(emails.get(alias)!))
      .filter((id): id is string => Boolean(id));
    if (!managerId || staffIds.length !== 4) {
      throw new Error('Seed the P0 fixture before adding performance tasks.');
    }

    const projects = await prisma.project.findMany({
      where: { ownerId: managerId },
      select: { id: true },
    });
    const projectIds = projects.map((project) => project.id);
    const baseDate = new Date(fixture.clock);
    const dayMs = 24 * 60 * 60 * 1_000;
    const statuses = [
      TaskStatus.TODO,
      TaskStatus.IN_PROGRESS,
      TaskStatus.IN_REVIEW,
      TaskStatus.DONE,
      TaskStatus.DRAFT,
      TaskStatus.CANCELLED,
    ];

    const previous = await prisma.task.deleteMany({
      where: { code: { startsWith: PERF_CODE_PREFIX } },
    });

    for (let start = 0; start < taskCount; start += BATCH_SIZE) {
      const size = Math.min(BATCH_SIZE, taskCount - start);
      const rows = Array.from({ length: size }, (_, offset) => {
        const index = start + offset;
        const status = statuses[index % statuses.length];
        const createdAt = new Date(baseDate.getTime() - (index % 721) * dayMs);
        const dueAt = new Date(
          baseDate.getTime() + ((index % 61) - 30) * dayMs,
        );
        const completedAt =
          status === TaskStatus.DONE
            ? new Date(dueAt.getTime() + (index % 2 === 0 ? -1 : 1) * dayMs)
            : null;
        const activeStatus =
          status === TaskStatus.TODO ||
          status === TaskStatus.IN_PROGRESS ||
          status === TaskStatus.IN_REVIEW;
        const blocked = activeStatus && index % 97 === 0;

        return {
          id: randomUUID(),
          code: `${PERF_CODE_PREFIX}${String(index + 1).padStart(6, '0')}`,
          type: TaskType.OFFICIAL,
          title: `Synthetic Phase 7 performance task ${index + 1}`,
          description: '',
          deliverable: '',
          status,
          priority: [
            TaskPriority.LOW,
            TaskPriority.NORMAL,
            TaskPriority.HIGH,
            TaskPriority.URGENT,
          ][index % 4],
          progressPercent:
            status === TaskStatus.DONE
              ? 100
              : status === TaskStatus.IN_PROGRESS
                ? 50
                : 0,
          createdById: managerId,
          primaryAssigneeId: staffIds[index % staffIds.length],
          projectId: projectIds.length
            ? projectIds[index % projectIds.length]
            : null,
          assignedAt: createdAt,
          dueAt,
          completedAt,
          completionDueAtSnapshot: status === TaskStatus.DONE ? dueAt : null,
          approvedById: completedAt ? managerId : null,
          approvedAt: completedAt,
          isBlocked: blocked,
          blockedReason: blocked ? 'Synthetic performance fixture' : null,
          createdAt,
          updatedAt: createdAt,
        };
      });

      await prisma.task.createMany({ data: rows });
    }

    const inserted = await prisma.task.count({
      where: { code: { startsWith: PERF_CODE_PREFIX } },
    });
    process.stdout.write(
      `${JSON.stringify({ database: databaseName, removedPreviousFixtureRows: previous.count, inserted, maxAllowed: MAX_TASKS })}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Performance fixture seed failed.'}\n`,
  );
  process.exitCode = 1;
});
