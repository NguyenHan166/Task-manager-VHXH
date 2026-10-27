import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hash } from 'bcryptjs';
import {
  ApprovalDecision,
  FileStatus,
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
type FixtureFile = {
  alias: string;
  owner: string;
  status: FileStatus;
  linkedTo: { type: string; alias: string };
};
type Fixture = {
  clock: string;
  users: FixtureUser[];
  projects: FixtureProject[];
  tasks: FixtureTask[];
  participants: FixtureParticipant[];
  submissions: FixtureSubmission[];
  approvals: FixtureApproval[];
  files: FixtureFile[];
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
          (item) => Number(item.alias.slice(1)) <= 13,
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

        for (const file of fixture.files) {
          const saved = await tx.fileObject.upsert({
            where: { objectKey: `demo/${file.alias}` },
            create: {
              objectKey: `demo/${file.alias}`,
              originalName: `${file.alias}.txt`,
              mimeType: 'text/plain',
              sizeBytes: BigInt(0),
              uploadedById: userIds[file.owner],
              status: file.status,
              createdAt: clock,
            },
            update: {},
          });
          if (file.linkedTo.type === 'SUBMISSION') {
            const submissionId = submissionIds[file.linkedTo.alias];
            const existing = await tx.fileLink.findFirst({
              where: { fileId: saved.id, submissionId },
            });
            if (!existing)
              await tx.fileLink.create({
                data: { fileId: saved.id, submissionId, createdAt: clock },
              });
          }
        }

        const nextByPrefix: Record<string, number> = { CV: 10, NH: 3, CN: 3 };
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
    console.log('P0 demo fixture seeded at 2026-10-27T09:00:00.000Z.');
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Seed failed');
  process.exitCode = 1;
});
