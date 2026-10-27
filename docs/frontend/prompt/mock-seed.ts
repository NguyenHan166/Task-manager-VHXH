/** Canonical, repeatable demo scenarios. Copy to src/mocks/mock-seed.ts and adjust import path. */
import type { MockDb, Task, User } from "./data-contract";

export function createMockSeed(now = new Date()): MockDb {
  const at = (hoursFromNow: number) => new Date(now.getTime() + hoursFromNow * 3_600_000).toISOString();
  const codeYear = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(now);
  const code = (prefix: "CV" | "NH" | "CN", sequence: number) => `${prefix}-${codeYear}-${String(sequence).padStart(4, "0")}`;
  const users: User[] = [
    { id: "u01", username: "an.nv@agency.gov.vn", displayName: "Nguyễn Văn An", role: "MANAGER", status: "ACTIVE", jobTitle: "Trưởng phòng", email: "an.nv@agency.gov.vn", phoneNumber: "0901.234.501", department: "Lãnh đạo đơn vị", avatarUrl: null, createdAt: at(-720), lastLoginAt: at(-1) },
    { id: "u06", username: "vu.lt@agency.gov.vn", displayName: "Lê Tuấn Vũ", role: "DEPUTY_MANAGER", status: "ACTIVE", jobTitle: "Phó trưởng phòng", email: "vu.lt@agency.gov.vn", phoneNumber: "0901.234.506", department: "Lãnh đạo đơn vị", avatarUrl: null, createdAt: at(-710), lastLoginAt: at(-3) },
    { id: "u02", username: "binh.tt@agency.gov.vn", displayName: "Trần Thị Bình", role: "STAFF", status: "ACTIVE", jobTitle: "Chuyên viên Tổng hợp", email: "binh.tt@agency.gov.vn", phoneNumber: "0901.234.502", department: "Tổ Tổng hợp - Kế hoạch", avatarUrl: null, createdAt: at(-700), lastLoginAt: at(-5) },
    { id: "u03", username: "chau.lm@agency.gov.vn", displayName: "Lê Minh Châu", role: "STAFF", status: "ACTIVE", jobTitle: "Chuyên viên Kỹ thuật", email: "chau.lm@agency.gov.vn", phoneNumber: "0901.234.503", department: "Tổ Kỹ thuật - Vận hành", avatarUrl: null, createdAt: at(-680), lastLoginAt: at(-12) },
    { id: "u04", username: "dung.pq@agency.gov.vn", displayName: "Phạm Quốc Dũng", role: "STAFF", status: "ACTIVE", jobTitle: "Chuyên viên Kế toán", email: "dung.pq@agency.gov.vn", phoneNumber: "0901.234.504", department: "Tổ Kế toán - Tài chính", avatarUrl: null, createdAt: at(-660), lastLoginAt: at(-24) },
    { id: "u05", username: "ha.vt@agency.gov.vn", displayName: "Võ Thu Hà", role: "STAFF", status: "ACTIVE", jobTitle: "Chuyên viên Văn thư", email: "ha.vt@agency.gov.vn", phoneNumber: "0901.234.505", department: "Tổ Hành chính - Văn thư", avatarUrl: null, createdAt: at(-640), lastLoginAt: at(-8) },
  ];

  const task = (
    id: string, code: string, type: Task["type"], title: string,
    status: Task["status"], createdById: string, primaryAssigneeId: string | null,
    dueInHours: number | null, extra: Partial<Task> = {},
  ): Task => ({
    id, code, type, title, status, createdById, primaryAssigneeId,
    description: `Nội dung thực hiện: ${title.toLowerCase()}.`,
    deliverable: type === "OFFICIAL" ? "Nộp báo cáo hoặc tài liệu kết quả để Trưởng phòng duyệt." : "Cập nhật kết quả thực hiện.",
    priority: "NORMAL", progressPercent: 0, projectId: null, parentTaskId: null,
    assignedAt: status === "DRAFT" ? null : at(-120),
    dueAt: dueInHours === null ? null : at(dueInHours),
    completedAt: null, approvedById: null, approvedAt: null,
    isBlocked: false, blockedReason: null,
    createdAt: at(-144), updatedAt: at(-24), archivedAt: null,
    ...extra,
  });

  const tasks: Task[] = [
    task("t01", code("CV", 1), "OFFICIAL", "Tổng hợp báo cáo chuyển đổi số", "IN_PROGRESS", "u01", "u02", 24, { priority: "HIGH", progressPercent: 60, projectId: "p01" }),
    task("t02", code("CV", 2), "OFFICIAL", "Chuẩn bị tài liệu tập huấn", "IN_REVIEW", "u01", "u03", 48, { priority: "HIGH", progressPercent: 100, projectId: "p02" }),
    task("t03", code("CV", 3), "OFFICIAL", "Rà soát quy trình tiếp nhận hồ sơ", "TODO", "u01", "u04", 120, { projectId: "p01" }),
    task("t04", code("CV", 4), "OFFICIAL", "Hoàn thiện số liệu quý", "IN_PROGRESS", "u01", "u05", -24, { priority: "URGENT", progressPercent: 75, isBlocked: true, blockedReason: "Đang chờ số liệu từ đơn vị phối hợp." }),
    task("t05", code("CV", 5), "OFFICIAL", "Báo cáo công tác tháng", "DONE", "u01", "u02", -72, { progressPercent: 100, completedAt: at(-96), approvedById: "u01", approvedAt: at(-96), projectId: "p01" }),
    task("t06", code("CV", 6), "OFFICIAL", "Kiểm kê trang thiết bị", "DONE", "u01", "u03", -72, { progressPercent: 100, completedAt: at(-48), approvedById: "u01", approvedAt: at(-48) }),
    task("t07", code("CV", 7), "OFFICIAL", "Dự thảo kế hoạch tuần tới", "DRAFT", "u01", "u04", 168, { assignedAt: null }),
    task("t08", code("CV", 8), "OFFICIAL", "Tổng hợp yêu cầu đã hủy", "CANCELLED", "u01", "u05", -48, { progressPercent: 20 }),
    task("t09", code("CV", 9), "OFFICIAL", "Rà soát nội dung họp giao ban", "TODO", "u01", "u02", 8, { priority: "URGENT" }),
    task("t10", code("NH", 1), "TEAM", "Cùng chuẩn bị nội dung truyền thông", "IN_PROGRESS", "u02", "u02", 72, { progressPercent: 40, projectId: "p02" }),
    task("t11", code("NH", 2), "TEAM", "Góp ý mẫu biểu nội bộ", "TODO", "u03", "u03", 144),
    task("t12", code("CN", 1), "PERSONAL", "Chuẩn bị ghi chú họp cá nhân", "TODO", "u02", "u02", 30),
    task("t13", code("CN", 2), "PERSONAL", "Sắp xếp tài liệu tham khảo", "DONE", "u03", "u03", -24, { progressPercent: 100, completedAt: at(-30) }),
    task("t14", code("CV", 10), "OFFICIAL", "Báo cáo tiến độ công việc hàng tuần - Kỳ 2026-W44", "IN_REVIEW", "u01", "u02", 48, { priority: "HIGH", progressPercent: 100, deliverable: "Báo cáo định kỳ theo mẫu quy định." }),
    task("t15", code("CV", 11), "OFFICIAL", "Báo cáo tiến độ công việc hàng tuần - Kỳ 2026-W44", "TODO", "u01", "u03", 48, { priority: "HIGH", progressPercent: 0, deliverable: "Báo cáo định kỳ theo mẫu quy định." }),
    task("t16", code("CV", 12), "OFFICIAL", "Báo cáo tiến độ công việc hàng tuần - Kỳ 2026-W44", "TODO", "u01", "u04", 48, { priority: "HIGH", progressPercent: 0, deliverable: "Báo cáo định kỳ theo mẫu quy định." }),
    task("t17", code("CV", 13), "OFFICIAL", "Báo cáo tiến độ công việc hàng tuần - Kỳ 2026-W44", "TODO", "u01", "u05", 48, { priority: "HIGH", progressPercent: 0, deliverable: "Báo cáo định kỳ theo mẫu quy định." }),
  ];

  return {
    schemaVersion: 1,
    users,
    projects: [
      { id: "p01", name: "Chuyển đổi số", description: "Các nhiệm vụ cải tiến quy trình và báo cáo chuyển đổi số.", ownerId: "u01", startAt: at(-240), endAt: at(720), status: "ACTIVE", createdAt: at(-240) },
      { id: "p02", name: "Tập huấn nội bộ", description: "Chuẩn bị chương trình và tài liệu tập huấn.", ownerId: "u01", startAt: at(-120), endAt: at(480), status: "ACTIVE", createdAt: at(-120) },
    ],
    tasks,
    participants: [
      { id: "tp01", taskId: "t01", userId: "u03", role: "COLLABORATOR", invitationStatus: "ACCEPTED", invitedAt: at(-120), respondedAt: at(-119) },
      { id: "tp02", taskId: "t02", userId: "u02", role: "COLLABORATOR", invitationStatus: "ACCEPTED", invitedAt: at(-120), respondedAt: at(-118) },
      { id: "tp03", taskId: "t04", userId: "u04", role: "WATCHER", invitationStatus: "ACCEPTED", invitedAt: at(-120), respondedAt: at(-117) },
      { id: "tp04", taskId: "t10", userId: "u03", role: "COLLABORATOR", invitationStatus: "ACCEPTED", invitedAt: at(-72), respondedAt: at(-71) },
      { id: "tp05", taskId: "t10", userId: "u05", role: "COLLABORATOR", invitationStatus: "PENDING", invitedAt: at(-24), respondedAt: null },
      { id: "tp06", taskId: "t11", userId: "u04", role: "COLLABORATOR", invitationStatus: "DECLINED", invitedAt: at(-48), respondedAt: at(-47) },
    ],
    comments: [
      { id: "c01", taskId: "t01", authorId: "u03", body: "Tôi đã gửi phần số liệu để tổng hợp.", createdAt: at(-12), editedAt: null },
      { id: "c02", taskId: "t01", authorId: "u02", body: "Đã nhận số liệu, đang hoàn thiện bản báo cáo.", createdAt: at(-10), editedAt: null },
      { id: "c03", taskId: "t04", authorId: "u05", body: "Đang chờ đơn vị phối hợp xác nhận số liệu cuối cùng.", createdAt: at(-6), editedAt: null },
    ],
    submissions: [
      { id: "s01", taskId: "t02", submittedById: "u03", summary: "Đã hoàn thành tài liệu và chương trình tập huấn.", submittedAt: at(-4) },
      { id: "s02", taskId: "t05", submittedById: "u02", summary: "Nộp bản báo cáo lần đầu.", submittedAt: at(-112) },
      { id: "s03", taskId: "t05", submittedById: "u02", summary: "Đã bổ sung phụ lục theo yêu cầu.", submittedAt: at(-100) },
      { id: "s04", taskId: "t06", submittedById: "u03", summary: "Hoàn thành biên bản kiểm kê.", submittedAt: at(-50) },
      { id: "s05", taskId: "t14", submittedById: "u02", summary: "Đã tổng hợp tiến độ tuần 44: các đầu việc đúng tiến độ, đề xuất bố trí thêm nhân sự trực.", submittedAt: at(-2), status: "PENDING" },
    ],
    approvals: [
      { id: "a01", taskId: "t05", submissionId: "s02", decidedById: "u01", decision: "RETURNED", reason: "Cần bổ sung phụ lục số liệu.", decidedAt: at(-110) },
      { id: "a02", taskId: "t05", submissionId: "s03", decidedById: "u01", decision: "APPROVED", reason: null, decidedAt: at(-96) },
      { id: "a03", taskId: "t06", submissionId: "s04", decidedById: "u01", decision: "APPROVED", reason: null, decidedAt: at(-48) },
    ],
    deadlineRequests: [
      { id: "dr01", taskId: "t01", requestedById: "u02", proposedDueAt: at(72), reason: "Cần thêm thời gian đối chiếu số liệu.", status: "PENDING", decidedById: null, decidedAt: null, decisionReason: null, createdAt: at(-3) },
    ],
    assigneeRequests: [],
    recurrenceRules: [
      { id: "rr01", title: "Báo cáo công tác hằng tháng", description: "Tổng hợp kết quả chuyên môn trong tháng và nộp báo cáo kết quả để Lãnh đạo duyệt.", ownerId: "u01", scope: "CUSTOM", assigneeIds: ["u02", "u03"], primaryAssigneeId: "u02", priority: "NORMAL", frequency: "MONTHLY", dueAfterHours: 120, nextRunAt: at(240), active: true, createdAt: at(-240) },
      { id: "rr02", title: "Báo cáo tiến độ công việc hàng tuần", description: "Toàn thể chuyên viên trong phòng nộp tóm tắt các đầu việc đã thực hiện trong tuần, khó khăn vướng mắc và kế hoạch tuần tới.", ownerId: "u01", scope: "ALL", assigneeIds: ["u02", "u03", "u04", "u05"], primaryAssigneeId: "u02", priority: "HIGH", frequency: "WEEKLY", dueAfterHours: 48, nextRunAt: at(72), active: true, createdAt: at(-120) },
    ],
    recurrenceInstances: [
      { id: "ri01", ruleId: "rr02", periodKey: "2026-W44", taskId: "t14", taskIds: ["t14", "t15", "t16", "t17"], createdAt: at(-48) },
    ],
    events: [
      { id: "e01", taskId: "t01", actorId: "u01", kind: "PUBLISHED", note: "Giao nhiệm vụ cho Trần Thị Bình.", before: { status: "DRAFT" }, after: { status: "TODO" }, createdAt: at(-120) },
      { id: "e02", taskId: "t01", actorId: "u02", kind: "STARTED", note: "Bắt đầu thực hiện.", before: { status: "TODO" }, after: { status: "IN_PROGRESS" }, createdAt: at(-96) },
      { id: "e03", taskId: "t02", actorId: "u03", kind: "SUBMITTED", note: "Nộp tài liệu tập huấn.", before: { status: "IN_PROGRESS" }, after: { status: "IN_REVIEW" }, createdAt: at(-4) },
      { id: "e04", taskId: "t04", actorId: "u05", kind: "BLOCKED", note: "Chờ số liệu từ đơn vị phối hợp.", before: { isBlocked: false }, after: { isBlocked: true }, createdAt: at(-6) },
      { id: "e05", taskId: "t05", actorId: "u01", kind: "RETURNED", note: "Cần bổ sung phụ lục số liệu.", before: { status: "IN_REVIEW" }, after: { status: "IN_PROGRESS" }, createdAt: at(-110) },
      { id: "e06", taskId: "t05", actorId: "u01", kind: "APPROVED", note: "Đã duyệt báo cáo sau khi bổ sung.", before: { status: "IN_REVIEW" }, after: { status: "DONE" }, createdAt: at(-96) },
      { id: "e07", taskId: "t06", actorId: "u01", kind: "APPROVED", note: "Đã duyệt biên bản kiểm kê.", before: { status: "IN_REVIEW" }, after: { status: "DONE" }, createdAt: at(-48) },
      { id: "e08", taskId: "t08", actorId: "u01", kind: "CANCELLED", note: "Hủy vì yêu cầu không còn hiệu lực.", before: { status: "IN_PROGRESS" }, after: { status: "CANCELLED" }, createdAt: at(-50) },
    ],
    notifications: [
      { id: "n01", recipientId: "u01", type: "SUBMISSION_RECEIVED", title: "Có kết quả chờ duyệt", body: "Lê Minh Châu đã nộp tài liệu tập huấn.", entityType: "TASK", entityId: "t02", createdAt: at(-4), readAt: null },
      { id: "n02", recipientId: "u01", type: "TASK_OVERDUE", title: "Công việc quá hạn", body: "Hoàn thiện số liệu quý đã quá hạn.", entityType: "TASK", entityId: "t04", createdAt: at(-2), readAt: null },
      { id: "n03", recipientId: "u02", type: "TASK_DUE_SOON", title: "Việc sắp đến hạn", body: "Rà soát nội dung họp giao ban sắp đến hạn.", entityType: "TASK", entityId: "t09", createdAt: at(-1), readAt: null },
      { id: "n04", recipientId: "u02", type: "COMMENT_ADDED", title: "Bình luận mới", body: "Lê Minh Châu đã bình luận về báo cáo chuyển đổi số.", entityType: "TASK", entityId: "t01", createdAt: at(-12), readAt: at(-8) },
      { id: "n05", recipientId: "u05", type: "TEAM_INVITED", title: "Lời mời phối hợp", body: "Trần Thị Bình mời bạn tham gia nội dung truyền thông.", entityType: "TASK", entityId: "t10", createdAt: at(-24), readAt: null },
    ],
    files: [
      { id: "f01", originalName: "bao-cao-thang.pdf", mimeType: "application/pdf", sizeBytes: 410000, objectKey: null, uploadedById: "u02", createdAt: at(-100), status: "MOCK_LOCAL" },
      { id: "f02", originalName: "chuong-trinh-tap-huan.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", sizeBytes: 275000, objectKey: null, uploadedById: "u03", createdAt: at(-4), status: "MOCK_LOCAL" },
    ],
    fileLinks: [
      { id: "fl01", fileId: "f01", entityType: "SUBMISSION", entityId: "s03" },
      { id: "fl02", fileId: "f02", entityType: "SUBMISSION", entityId: "s01" },
    ],
    chatRooms: [
      { id: "r01", kind: "DIRECT", title: null, createdAt: at(-72) },
      { id: "r02", kind: "GROUP", title: "Nhóm tập huấn nội bộ", createdAt: at(-48) },
    ],
    chatMembers: [
      { id: "rm01", roomId: "r01", userId: "u02", lastReadAt: at(-3), joinedAt: at(-72) },
      { id: "rm02", roomId: "r01", userId: "u03", lastReadAt: at(-2), joinedAt: at(-72) },
      { id: "rm03", roomId: "r02", userId: "u01", lastReadAt: at(-5), joinedAt: at(-48) },
      { id: "rm04", roomId: "r02", userId: "u02", lastReadAt: at(-5), joinedAt: at(-48) },
      { id: "rm05", roomId: "r02", userId: "u03", lastReadAt: at(-5), joinedAt: at(-48) },
      { id: "rm06", roomId: "r02", userId: "u04", lastReadAt: at(-5), joinedAt: at(-48) },
      { id: "rm07", roomId: "r02", userId: "u06", lastReadAt: at(-5), joinedAt: at(-48) },
    ],
    chatMessages: [
      { id: "m01", roomId: "r01", senderId: "u02", body: "Châu gửi giúp mình phần tài liệu tập huấn nhé.", createdAt: at(-8), editedAt: null, deletedAt: null },
      { id: "m02", roomId: "r01", senderId: "u03", body: "Mình đã cập nhật và gửi trong nhiệm vụ.", createdAt: at(-3), editedAt: null, deletedAt: null },
      { id: "m03", roomId: "r02", senderId: "u01", body: "Nhóm cập nhật tiến độ chuẩn bị trước cuối ngày.", createdAt: at(-12), editedAt: null, deletedAt: null },
      { id: "m04", roomId: "r02", senderId: "u04", body: "Phần hậu cần đã sẵn sàng.", createdAt: at(-4), editedAt: null, deletedAt: null },
    ],
    settings: { workspaceName: "Phòng Chuyên môn", timezone: "Asia/Ho_Chi_Minh", defaultDueHour: 16, reminderBeforeHours: 24, maxFileSizeMb: 20 },
  };
}

/** Expected initial manager KPI (all time): 7 active published OFFICIAL, 2 TODO,
 * 2 IN_PROGRESS, 1 IN_REVIEW, 2 DONE, 1 currently overdue, 1 draft, 1 cancelled.
 * Completed on time: 1 of 2 DONE. Personal and team work are excluded.
 */
