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
  expected: {
    initial_t01_t09: Expected;
    extended_t01_t17: Expected;
  };
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
      readyDemoFiles,
      activeDemoLinks,
      settings,
      recurrenceRules,
      recurrenceInstances,
      recurrenceTaskLinks,
      chatRooms,
      chatMembers,
      chatMessages,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.project.count(),
      prisma.task.count(),
      prisma.taskParticipant.count(),
      prisma.taskSubmission.count(),
      prisma.taskApproval.count(),
      prisma.fileObject.count(),
      prisma.fileLink.count(),
      prisma.fileObject.count({
        where: { objectKey: { startsWith: 'demo/' }, status: 'READY' },
      }),
      prisma.fileLink.count({
        where: {
          removedAt: null,
          file: { is: { objectKey: { startsWith: 'demo/' } } },
        },
      }),
      prisma.appSettings.count(),
      prisma.recurrenceRule.count(),
      prisma.recurrenceInstance.count(),
      prisma.recurrenceInstanceTask.count(),
      prisma.chatRoom.count(),
      prisma.chatRoomMember.count(),
      prisma.chatMessage.count(),
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
      readyDemoFiles,
      activeDemoLinks,
      settings,
      recurrenceRules,
      recurrenceInstances,
      recurrenceTaskLinks,
      chatRooms,
      chatMembers,
      chatMessages,
    };
    const required = {
      users: 6,
      projects: 2,
      tasks: 17,
      participants: 6,
      submissions: 5,
      approvals: 3,
      readyDemoFiles: 0,
      activeDemoLinks: 0,
      settings: 1,
      recurrenceRules: 2,
      recurrenceInstances: 1,
      recurrenceTaskLinks: 4,
      chatRooms: 2,
      chatMembers: 7,
      chatMessages: 4,
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
    const clock = new Date(fixture.clock);
    const metrics = (tasksToCount: typeof official): Expected => {
      const active = tasksToCount.filter(
        (task) => !['DRAFT', 'CANCELLED'].includes(task.status),
      );
      const statusCount = (status: TaskStatus): number =>
        active.filter((task) => task.status === status).length;
      return {
        totalOfficialCount: tasksToCount.length,
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
        draftCount: tasksToCount.filter((task) => task.status === 'DRAFT')
          .length,
        cancelledCount: tasksToCount.filter(
          (task) => task.status === 'CANCELLED',
        ).length,
      };
    };
    const initial = metrics(
      official.filter((task) => /^CV-2026-000[1-9]$/.test(task.code)),
    );
    const extended = metrics(official);
    for (const [key, value] of Object.entries(fixture.expected.initial_t01_t09)) {
      if (initial[key] !== value)
        throw new Error(`initial ${key}: expected ${value}, got ${initial[key]}`);
    }
    for (const [key, value] of Object.entries(
      fixture.expected.extended_t01_t17,
    )) {
      if (extended[key] !== value)
        throw new Error(`extended ${key}: expected ${value}, got ${extended[key]}`);
    }
    const pendingInvite = await prisma.taskParticipant.count({
      where: { task: { code: 'NH-2026-0001' }, invitationStatus: 'PENDING' },
    });
    if (pendingInvite !== 1)
      throw new Error('TEAM pending invitation fixture missing');
    const pendingDeadline = await prisma.taskDeadlineRequest.count({
      where: { task: { code: 'CV-2026-0001' }, status: 'PENDING' },
    });
    if (pendingDeadline !== 1)
      throw new Error('Deadline request fixture missing');
    const recurringInstance = await prisma.recurrenceInstance.findFirst({
      where: {
        periodKey: '2026-W44',
        rule: { is: { title: 'Báo cáo tiến độ công việc hàng tuần' } },
      },
      include: { tasks: true },
    });
    if (recurringInstance?.tasks.length !== 4)
      throw new Error('2026-W44 recurrence instance must contain four tasks');
    console.log(
      JSON.stringify(
        { counts, p0KpiAtFixtureClock: initial, extendedKpiAtFixtureClock: extended },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Seed check failed');
  process.exitCode = 1;
});
