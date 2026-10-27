import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient, TaskStatus } from '@prisma/client';

type Expected = Record<string, number>;
const fixture = JSON.parse(
  readFileSync(
    resolve(process.cwd(), '../docs/backend-plan/phase-00/kpi-fixture.v1.json'),
    'utf8',
  ),
) as {
  clock: string;
  expected: { initial_t01_t09: Expected };
};

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const [
      users,
      projects,
      tasks,
      participants,
      submissions,
      approvals,
      files,
      links,
      settings,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.project.count(),
      prisma.task.count(),
      prisma.taskParticipant.count(),
      prisma.taskSubmission.count(),
      prisma.taskApproval.count(),
      prisma.fileObject.count(),
      prisma.fileLink.count(),
      prisma.appSettings.count(),
    ]);
    const counts = {
      users,
      projects,
      tasks,
      participants,
      submissions,
      approvals,
      files,
      links,
      settings,
    };
    const required = {
      users: 6,
      projects: 2,
      tasks: 13,
      participants: 6,
      submissions: 4,
      approvals: 3,
      files: 2,
      links: 2,
      settings: 1,
    };
    for (const [key, value] of Object.entries(required)) {
      if (counts[key as keyof typeof counts] !== value) {
        throw new Error(
          `${key}: expected ${value}, got ${counts[key as keyof typeof counts]}`,
        );
      }
    }
    const official = await prisma.task.findMany({
      where: { type: 'OFFICIAL' },
    });
    const active = official.filter(
      (task) => !['DRAFT', 'CANCELLED'].includes(task.status),
    );
    const statusCount = (status: TaskStatus): number =>
      active.filter((task) => task.status === status).length;
    const clock = new Date(fixture.clock);
    const actual: Expected = {
      totalOfficialCount: official.length,
      totalActivePublished: active.length,
      todoCount: statusCount('TODO'),
      inProgressCount: statusCount('IN_PROGRESS'),
      inReviewCount: statusCount('IN_REVIEW'),
      doneCount: statusCount('DONE'),
      overdueCount: active.filter(
        (task) =>
          ['TODO', 'IN_PROGRESS', 'IN_REVIEW'].includes(task.status) &&
          task.dueAt &&
          task.dueAt < clock,
      ).length,
      completedOnTimeCount: active.filter(
        (task) =>
          task.status === 'DONE' &&
          task.completedAt &&
          task.completionDueAtSnapshot &&
          task.completedAt <= task.completionDueAtSnapshot,
      ).length,
      draftCount: official.filter((task) => task.status === 'DRAFT').length,
      cancelledCount: official.filter((task) => task.status === 'CANCELLED')
        .length,
    };
    for (const [key, value] of Object.entries(
      fixture.expected.initial_t01_t09,
    )) {
      if (actual[key] !== value)
        throw new Error(`${key}: expected ${value}, got ${actual[key]}`);
    }
    const pendingInvite = await prisma.taskParticipant.count({
      where: { task: { code: 'NH-2026-0001' }, invitationStatus: 'PENDING' },
    });
    if (pendingInvite !== 1)
      throw new Error('TEAM pending invitation fixture missing');
    console.log(JSON.stringify({ counts, kpiAtFixtureClock: actual }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Seed check failed');
  process.exitCode = 1;
});
