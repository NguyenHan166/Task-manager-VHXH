import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hash } from 'bcryptjs';
import {
  ApprovalDecision,
  InvitationStatus,
  ParticipantRole,
  PrismaClient,
  ProjectStatus,
  SubmissionStatus,
  TaskPriority,
  TaskStatus,
  TaskType,
  UserRole,
  UserStatus,
} from '@prisma/client';

type FixtureUser = {
  alias: string;
  email: string;
  role: UserRole;
  status: UserStatus;
};
type FixtureProject = { alias: string; owner: string };
type FixtureTask = {
  alias: string;
  code: string;
  type: TaskType;
  status: TaskStatus;
  createdBy: string;
  primaryAssignee: string | null;
  project: string | null;
  priority: TaskPriority;
  progressPercent: number;
  isBlocked: boolean;
  createdAt: string;
  assignedAt: string | null;
  dueAt: string | null;
  completedAt: string | null;
  completionDueAtSnapshot: string | null;
};
type FixtureParticipant = {
  task: string;
  user: string;
  role: ParticipantRole;
  invitationStatus: InvitationStatus;
};
type FixtureSubmission = {
  alias: string;
  task: string;
  by: string;
  at: string;
  status: SubmissionStatus;
};
type FixtureApproval = {
  alias: string;
  task: string;
  submission: string;
  by: string;
  decision: ApprovalDecision;
  at: string;
};
type FixtureRecurrence = {
  rules: {
    alias: string;
    frequency: 'WEEKLY' | 'MONTHLY';
    scope: 'ALL' | 'CUSTOM';
    assignees: string[];
    dueAfterHours: number;
  }[];
  instance: {
    alias: string;
    rule: string;
    periodKey: string;
    tasks: string[];
  };
};
type Fixture = {
  clock: string;
  users: FixtureUser[];
  projects: FixtureProject[];
  tasks: FixtureTask[];
  participants: FixtureParticipant[];
  submissions: FixtureSubmission[];
  approvals: FixtureApproval[];
  recurrence: FixtureRecurrence;
};

const fixture = JSON.parse(
  readFileSync(
    resolve(process.cwd(), '../docs/backend-plan/phase-00/kpi-fixture.v1.json'),
    'utf8',
  ),
) as Fixture;
const names: Record<string, [string, string, string]> = {
  u01: ['Nguyễn Văn An', 'Trưởng phòng', 'Lãnh đạo đơn vị'],
  u06: ['Lê Tuấn Vũ', 'Phó trưởng phòng', 'Lãnh đạo đơn vị'],
  u02: ['Trần Thị Bình', 'Chuyên viên Tổng hợp', 'Tổ Tổng hợp - Kế hoạch'],
  u03: ['Lê Minh Châu', 'Chuyên viên Kỹ thuật', 'Tổ Kỹ thuật - Vận hành'],
  u04: ['Phạm Quốc Dũng', 'Chuyên viên Kế toán', 'Tổ Kế toán - Tài chính'],
  u05: ['Võ Thu Hà', 'Chuyên viên Văn thư', 'Tổ Hành chính - Văn thư'],
};
const titles: Record<string, string> = {
  t01: 'Tổng hợp báo cáo chuyển đổi số',
  t02: 'Chuẩn bị tài liệu tập huấn',
  t03: 'Rà soát quy trình tiếp nhận hồ sơ',
  t04: 'Hoàn thiện số liệu quý',
  t05: 'Báo cáo công tác tháng',
  t06: 'Kiểm kê trang thiết bị',
  t07: 'Dự thảo kế hoạch tuần tới',
  t08: 'Tổng hợp yêu cầu đã hủy',
  t09: 'Rà soát nội dung họp giao ban',
  t10: 'Cùng chuẩn bị nội dung truyền thông',
  t11: 'Góp ý mẫu biểu nội bộ',
  t12: 'Chuẩn bị ghi chú họp cá nhân',
  t13: 'Sắp xếp tài liệu tham khảo',
  t14: 'Báo cáo tiến độ công việc hàng tuần - Kỳ 2026-W44',
  t15: 'Báo cáo tiến độ công việc hàng tuần - Kỳ 2026-W44',
  t16: 'Báo cáo tiến độ công việc hàng tuần - Kỳ 2026-W44',
  t17: 'Báo cáo tiến độ công việc hàng tuần - Kỳ 2026-W44',
};
const recurrenceTitles: Record<string, string> = {
  rr01: 'Báo cáo công tác hằng tháng',
  rr02: 'Báo cáo tiến độ công việc hàng tuần',
};
const recurrenceDescriptions: Record<string, string> = {
  rr01:
    'Tổng hợp kết quả chuyên môn trong tháng và nộp báo cáo kết quả để Lãnh đạo duyệt.',
  rr02:
    'Toàn thể chuyên viên trong phòng nộp tóm tắt các đầu việc đã thực hiện trong tuần, khó khăn vướng mắc và kế hoạch tuần tới.',
};
const projectNames: Record<string, string> = {
  p01: 'Công tác tổng hợp',
  p02: 'Đào tạo và truyền thông',
};
const date = (value: string | null): Date | null =>
  value ? new Date(value) : null;

async function main(): Promise<void> {
  if (!['local', 'staging'].includes(process.env.APP_ENV ?? '')) {
    throw new Error('Demo seed is allowed only in local or staging');
  }
  const demoPassword = process.env.DEMO_SEED_PASSWORD;
  if (!demoPassword || demoPassword.length < 16) {
    throw new Error('DEMO_SEED_PASSWORD must contain at least 16 characters');
  }
  const prisma = new PrismaClient();
  try {
    const passwordHash = await hash(demoPassword, 12);
    const clock = new Date(fixture.clock);
    await prisma.$transaction(
      async (tx) => {
        const userIds: Record<string, string> = {};
        for (const user of fixture.users) {
          const [displayName, jobTitle, department] = names[user.alias];
          const saved = await tx.user.upsert({
            where: { email: user.email.toLowerCase() },
            create: {
              email: user.email.toLowerCase(),
              displayName,
              jobTitle,
              department,
              role: user.role,
              status: user.status,
              passwordHash,
              createdAt: clock,
            },
            update: {
              displayName,
              jobTitle,
              department,
              role: user.role,
              status: user.status,
              passwordHash,
            },
          });
          userIds[user.alias] = saved.id;
        }

        await tx.appSettings.upsert({
          where: { id: 1 },
          create: { id: 1 },
          update: {},
        });
        const projectIds: Record<string, string> = {};
        for (const project of fixture.projects) {
          const name = projectNames[project.alias];
          const ownerId = userIds[project.owner];
          const existing = await tx.project.findFirst({
            where: { name, ownerId },
          });
          const saved =
            existing ??
            (await tx.project.create({
              data: {
                name,
                ownerId,
                status: ProjectStatus.ACTIVE,
                createdAt: clock,
              },
            }));
          projectIds[project.alias] = saved.id;
        }

        const taskIds: Record<string, string> = {};
        for (const task of fixture.tasks.filter(
          (item) => Number(item.alias.slice(1)) <= 17,
        )) {
          const approval = fixture.approvals.find(
            (item) => item.task === task.alias && item.decision === 'APPROVED',
          );
          const data = {
            type: task.type,
            title: titles[task.alias],
            description: '',
            deliverable: '',
            status: task.status,
            priority: task.priority,
            progressPercent: task.progressPercent,
            createdById: userIds[task.createdBy],
            primaryAssigneeId: task.primaryAssignee
              ? userIds[task.primaryAssignee]
              : null,
            projectId: task.project ? projectIds[task.project] : null,
            assignedAt: date(task.assignedAt),
            dueAt: date(task.dueAt),
            completedAt: date(task.completedAt),
            completionDueAtSnapshot: date(task.completionDueAtSnapshot),
            approvedById: approval ? userIds[approval.by] : null,
            approvedAt: approval ? date(approval.at) : null,
            isBlocked: task.isBlocked,
            blockedReason: task.isBlocked ? 'Chờ đối chiếu số liệu' : null,
          };
          const saved = await tx.task.upsert({
            where: { code: task.code },
            create: {
              code: task.code,
              ...data,
              createdAt: new Date(task.createdAt),
            },
            update: {},
          });
          taskIds[task.alias] = saved.id;
        }

        for (const participant of fixture.participants) {
          await tx.taskParticipant.upsert({
            where: {
              taskId_userId_role: {
                taskId: taskIds[participant.task],
                userId: userIds[participant.user],
                role: participant.role,
              },
            },
            create: {
              taskId: taskIds[participant.task],
              userId: userIds[participant.user],
              role: participant.role,
              invitationStatus: participant.invitationStatus,
              invitedAt: clock,
              respondedAt:
                participant.invitationStatus === 'PENDING' ? null : clock,
            },
            update: {},
          });
        }

        const submissionIds: Record<string, string> = {};
        for (const submission of fixture.submissions.filter(
          (item) => item.task in taskIds,
        )) {
          const taskId = taskIds[submission.task];
          const submittedAt = new Date(submission.at);
          const existing = await tx.taskSubmission.findFirst({
            where: { taskId, submittedAt },
          });
          const saved =
            existing ??
            (await tx.taskSubmission.create({
              data: {
                taskId,
                submittedById: userIds[submission.by],
                summary: `Kết quả mẫu ${submission.alias}`,
                status: submission.status,
                submittedAt,
              },
            }));
          submissionIds[submission.alias] = saved.id;
        }
        for (const approval of fixture.approvals) {
          await tx.taskApproval.upsert({
            where: { submissionId: submissionIds[approval.submission] },
            create: {
              taskId: taskIds[approval.task],
              submissionId: submissionIds[approval.submission],
              decidedById: userIds[approval.by],
              decision: approval.decision,
              reason:
                approval.decision === 'RETURNED'
                  ? 'Cần bổ sung nội dung'
                  : null,
              dueAtSnapshot: date(
                fixture.tasks.find((task) => task.alias === approval.task)
                  ?.dueAt ?? null,
              ),
              decidedAt: new Date(approval.at),
            },
            update: {},
          });
        }

        const pendingDeadline = await tx.taskDeadlineRequest.findFirst({
          where: { taskId: taskIds.t01, status: 'PENDING' },
          select: { id: true },
        });
        if (!pendingDeadline) {
          await tx.taskDeadlineRequest.create({
            data: {
              taskId: taskIds.t01,
              requestedById: userIds.u02,
              proposedDueAt: new Date(clock.getTime() + 72 * 3_600_000),
              reason: 'Cần thêm thời gian đối chiếu số liệu.',
              createdAt: new Date(clock.getTime() - 3 * 3_600_000),
            },
          });
        }

        const recurrenceRuleIds: Record<string, string> = {};
        for (const rule of fixture.recurrence.rules) {
          const ownerId = userIds.u01;
          const title = recurrenceTitles[rule.alias];
          const nextRunHours = rule.alias === fixture.recurrence.instance.rule ? 168 : 240;
          const createdHours = rule.alias === 'rr01' ? 240 : 120;
          const data = {
            title,
            description: recurrenceDescriptions[rule.alias],
            ownerId,
            scope: rule.scope,
            priority: rule.alias === 'rr02' ? TaskPriority.HIGH : TaskPriority.NORMAL,
            frequency: rule.frequency,
            dueAfterHours: rule.dueAfterHours,
            nextRunAt: new Date(clock.getTime() + nextRunHours * 3_600_000),
            active: true,
          };
          const existing = await tx.recurrenceRule.findFirst({
            where: { ownerId, title },
            select: { id: true },
          });
          const saved = existing
            ? await tx.recurrenceRule.update({ where: { id: existing.id }, data })
            : await tx.recurrenceRule.create({
                data: {
                  ...data,
                  createdAt: new Date(clock.getTime() - createdHours * 3_600_000),
                },
              });
          recurrenceRuleIds[rule.alias] = saved.id;
          await tx.recurrenceRuleAssignee.deleteMany({
            where: { ruleId: saved.id },
          });
          if (rule.scope === 'CUSTOM' && rule.assignees.length) {
            await tx.recurrenceRuleAssignee.createMany({
              data: rule.assignees.map((alias) => ({
                ruleId: saved.id,
                userId: userIds[alias],
              })),
              skipDuplicates: true,
            });
          }
        }

        const instanceRuleId = recurrenceRuleIds[fixture.recurrence.instance.rule];
        const instance = await tx.recurrenceInstance.upsert({
          where: {
            ruleId_periodKey: {
              ruleId: instanceRuleId,
              periodKey: fixture.recurrence.instance.periodKey,
            },
          },
          create: {
            ruleId: instanceRuleId,
            periodKey: fixture.recurrence.instance.periodKey,
            createdAt: new Date(clock.getTime() - 48 * 3_600_000),
          },
          update: {},
        });
        for (const alias of fixture.recurrence.instance.tasks) {
          const task = fixture.tasks.find((item) => item.alias === alias);
          if (!task?.primaryAssignee) {
            throw new Error(`Recurrence fixture task ${alias} has no assignee`);
          }
          const taskId = taskIds[alias];
          const userId = userIds[task.primaryAssignee];
          const submissionId = alias === 't14' ? submissionIds.s05 : undefined;
          await tx.recurrenceInstanceTask.upsert({
            where: { instanceId_userId: { instanceId: instance.id, userId } },
            create: {
              instanceId: instance.id,
              userId,
              taskId,
              ...(submissionId ? { taskSubmissionId: submissionId } : {}),
            },
            update: {
              taskId,
              ...(submissionId ? { taskSubmissionId: submissionId } : {}),
            },
          });
          const generatedEvent = await tx.taskEvent.findFirst({
            where: { taskId, kind: 'RECURRENCE_GENERATED' },
            select: { id: true },
          });
          if (!generatedEvent) {
            await tx.taskEvent.create({
              data: {
                taskId,
                actorId: userIds.u01,
                kind: 'RECURRENCE_GENERATED',
                note: `Sinh từ mẫu định kỳ ${recurrenceTitles[fixture.recurrence.instance.rule]} (${fixture.recurrence.instance.periodKey})`,
                after: {
                  ruleId: instanceRuleId,
                  periodKey: fixture.recurrence.instance.periodKey,
                },
                createdAt: new Date(clock.getTime() - 48 * 3_600_000),
              },
            });
          }
        }

        const directMemberIds = [userIds.u02, userIds.u03].sort();
        const directRoom = await tx.chatRoom.upsert({
          where: { directKey: directMemberIds.join(':') },
          create: {
            kind: 'DIRECT',
            directKey: directMemberIds.join(':'),
            createdAt: new Date(clock.getTime() - 72 * 3_600_000),
          },
          update: {},
        });
        const existingGroup = await tx.chatRoom.findFirst({
          where: { kind: 'GROUP', title: 'Nhóm tập huấn nội bộ' },
          select: { id: true },
        });
        const groupRoom = existingGroup ??
          (await tx.chatRoom.create({
              data: {
                kind: 'GROUP',
                title: 'Nhóm tập huấn nội bộ',
                createdAt: new Date(clock.getTime() - 48 * 3_600_000),
              },
            }));
        const chatMembers = [
          { roomId: directRoom.id, user: 'u02', readHours: -3, joinHours: -72 },
          { roomId: directRoom.id, user: 'u03', readHours: -2, joinHours: -72 },
          { roomId: groupRoom.id, user: 'u01', readHours: -5, joinHours: -48 },
          { roomId: groupRoom.id, user: 'u02', readHours: -5, joinHours: -48 },
          { roomId: groupRoom.id, user: 'u03', readHours: -5, joinHours: -48 },
          { roomId: groupRoom.id, user: 'u04', readHours: -5, joinHours: -48 },
          { roomId: groupRoom.id, user: 'u06', readHours: -5, joinHours: -48 },
        ];
        for (const member of chatMembers) {
          await tx.chatRoomMember.upsert({
            where: {
              roomId_userId: {
                roomId: member.roomId,
                userId: userIds[member.user],
              },
            },
            create: {
              roomId: member.roomId,
              userId: userIds[member.user],
              lastReadAt: new Date(clock.getTime() + member.readHours * 3_600_000),
              joinedAt: new Date(clock.getTime() + member.joinHours * 3_600_000),
            },
            update: {
              lastReadAt: new Date(clock.getTime() + member.readHours * 3_600_000),
            },
          });
        }
        const chatMessages = [
          { roomId: directRoom.id, sender: 'u02', body: 'Châu gửi giúp mình phần tài liệu tập huấn nhé.', hours: -8 },
          { roomId: directRoom.id, sender: 'u03', body: 'Mình đã cập nhật và gửi trong nhiệm vụ.', hours: -3 },
          { roomId: groupRoom.id, sender: 'u01', body: 'Nhóm cập nhật tiến độ chuẩn bị trước cuối ngày.', hours: -12 },
          { roomId: groupRoom.id, sender: 'u04', body: 'Phần hậu cần đã sẵn sàng.', hours: -4 },
        ];
        for (const message of chatMessages) {
          const createdAt = new Date(clock.getTime() + message.hours * 3_600_000);
          const senderId = userIds[message.sender];
          const existing = await tx.chatMessage.findFirst({
            where: { roomId: message.roomId, senderId, body: message.body, createdAt },
            select: { id: true },
          });
          if (!existing) {
            await tx.chatMessage.create({
              data: { roomId: message.roomId, senderId, body: message.body, createdAt },
            });
          }
        }

        const nextByPrefix: Record<string, number> = { CV: 14, NH: 3, CN: 3 };
        for (const [prefix, nextValue] of Object.entries(nextByPrefix)) {
          await tx.businessCodeCounter.upsert({
            where: { prefix_year: { prefix, year: 2026 } },
            create: { prefix, year: 2026, nextValue },
            update: {},
          });
          await tx.businessCodeCounter.updateMany({
            where: { prefix, year: 2026, nextValue: { lt: nextValue } },
            data: { nextValue },
          });
        }
      },
      { timeout: 60_000 },
    );
    console.log('P0/P1 demo fixture seeded at 2026-10-27T09:00:00.000Z.');
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Seed failed');
  process.exitCode = 1;
});
