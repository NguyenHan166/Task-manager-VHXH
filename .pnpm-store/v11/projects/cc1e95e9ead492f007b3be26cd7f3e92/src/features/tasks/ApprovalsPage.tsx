import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { useSession } from "../auth/SessionContext";
import { workspaceRepository, httpRepository, isMockMode } from "../../shared/repository";
import type {
  Task,
  User,
  TaskSubmission,
  TaskApproval,
  TaskDeadlineRequest,
  TaskAssigneeRequest,
  FileObject,
} from "../../shared/data-contract";
import {
  Breadcrumb,
  PageHeader,
  Button,
  PriorityBadge,
  UserAvatar,
  DataTable,
  EmptyState,
  useToast,
  ConfirmDialog,
  Textarea,
} from "../../components/ui";
import { formatDateTimeVN, formatRelativeVN } from "../../shared/datetime";
import {
  CheckCircle2,
  RotateCcw,
  FileText,
  Clock,
  UserCheck,
  History,
  FileCheck,
  XCircle,
  Paperclip,
} from "lucide-react";

type ApprovalTab = "SUBMISSIONS" | "DEADLINES" | "ASSIGNEES" | "HISTORY";

export function ApprovalsPage() {
  const { currentUser } = useSession();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<ApprovalTab>("SUBMISSIONS");

  // Data states
  const [reviewTasks, setReviewTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [submissions, setSubmissions] = useState<TaskSubmission[]>([]);
  const [approvals, setApprovals] = useState<TaskApproval[]>([]);
  const [deadlineRequests, setDeadlineRequests] = useState<TaskDeadlineRequest[]>([]);
  const [assigneeRequests, setAssigneeRequests] = useState<TaskAssigneeRequest[]>([]);
  const [files, setFiles] = useState<FileObject[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal states for Submission Review
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedSub, setSelectedSub] = useState<TaskSubmission | null>(null);
  const [taskApprovals, setTaskApprovals] = useState<TaskApproval[]>([]);
  const [taskFiles, setTaskFiles] = useState<FileObject[]>([]);
  const [decisionMode, setDecisionMode] = useState<"NONE" | "APPROVE" | "RETURN">("NONE");
  const [approvalNote, setApprovalNote] = useState("");
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);

  // Modal states for Deadline Request
  const [activeDeadlineReq, setActiveDeadlineReq] = useState<TaskDeadlineRequest | null>(null);
  const [deadlineDecision, setDeadlineDecision] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [deadlineReason, setDeadlineReason] = useState("");
  const [isDecidingDeadline, setIsDecidingDeadline] = useState(false);

  // Modal states for Assignee Request
  const [activeAssigneeReq, setActiveAssigneeReq] = useState<TaskAssigneeRequest | null>(null);
  const [assigneeDecision, setAssigneeDecision] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [assigneeReason, setAssigneeReason] = useState("");
  const [isDecidingAssignee, setIsDecidingAssignee] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      if (isMockMode) {
        const [allTasks, allUsers, allSubs, allApps, allDeadlines, allAssignees, allFiles] = await Promise.all([
          workspaceRepository.getTasks(),
          workspaceRepository.getUsers(),
          workspaceRepository.getSubmissions(""),
          workspaceRepository.getApprovals(),
          workspaceRepository.getDeadlineRequests(),
          workspaceRepository.getAssigneeRequests(),
          workspaceRepository.getFiles(),
        ]);
        setReviewTasks(allTasks.filter((task) => task.status === "IN_REVIEW"));
        setUsers(allUsers);
        setSubmissions(allSubs);
        setApprovals(allApps);
        setDeadlineRequests(allDeadlines);
        setAssigneeRequests(allAssignees);
        setFiles(allFiles);
      } else {
        const [allTasks, allUsers, allFiles] = await Promise.all([
          httpRepository.queryAllTasks({ type: "OFFICIAL", sortBy: "UPDATED_AT", sortDirection: "DESC" }),
          workspaceRepository.getUsers(),
          workspaceRepository.getFiles(),
        ]);
        const review = allTasks.filter((task) => task.status === "IN_REVIEW");
        const [subBatches, approvalBatches] = await Promise.all([
          Promise.all(review.map((task) => workspaceRepository.getSubmissions(task.id))),
          Promise.all(allTasks.map((task) => workspaceRepository.getApprovals(task.id))),
        ]);
        setReviewTasks(review);
        setUsers(allUsers);
        setSubmissions(subBatches.flat());
        setApprovals(approvalBatches.flat());
        setDeadlineRequests([]);
        setAssigneeRequests([]);
        setFiles(allFiles);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const unsub = workspaceRepository.subscribe(loadData);
    return unsub;
  }, []);

  // Open dossier modal for a task in review
  const handleOpenDossier = async (task: Task) => {
    setSelectedTask(task);
    setApprovalNote("");
    setDecisionMode("NONE");

    const [subs, apps] = await Promise.all([
      workspaceRepository.getSubmissions(task.id),
      workspaceRepository.getApprovals(task.id),
    ]);
    const links = isMockMode
      ? await workspaceRepository.getFileLinks()
      : (await Promise.all([
          workspaceRepository.getFileLinks("TASK", task.id),
          ...subs.map((submission) => workspaceRepository.getFileLinks("SUBMISSION", submission.id)),
        ])).flat();

    setTaskApprovals(apps);

    const subIds = new Set(subs.map((s) => s.id));
    const linkedFileIds = new Set(
      links
        .filter(
          (l) =>
            (l.entityType === "TASK" && l.entityId === task.id) ||
            (l.entityType === "SUBMISSION" && subIds.has(l.entityId))
        )
        .map((l) => l.fileId)
    );

    setTaskFiles(files.filter((f) => linkedFileIds.has(f.id)));
    setSelectedSub(subs[0] || null);
  };

  // Submit Approval or Return
  const handleExecuteApproval = async () => {
    if (!selectedTask || !selectedSub || !currentUser) return;

    if (decisionMode === "RETURN" && !approvalNote.trim()) {
      showToast("Vui lòng nhập lý do trả lại yêu cầu bổ sung", "warning");
      return;
    }

    setIsSubmittingDecision(true);
    try {
      await workspaceRepository.decideApproval(
        selectedSub.id,
        decisionMode === "APPROVE" ? "APPROVED" : "RETURNED",
        approvalNote.trim() || null,
        currentUser.id
      );

      showToast(
        decisionMode === "APPROVE"
          ? `Đã duyệt hoàn thành công việc ${selectedTask.code}`
          : `Đã trả lại công việc ${selectedTask.code} để bổ sung`,
        decisionMode === "APPROVE" ? "success" : "warning"
      );

      setSelectedTask(null);
      setSelectedSub(null);
      setDecisionMode("NONE");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi xử lý duyệt", "error");
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  // Submit Deadline decision
  const handleExecuteDeadlineDecision = async () => {
    if (!activeDeadlineReq || !currentUser) return;
    if (deadlineDecision === "REJECTED" && !deadlineReason.trim()) {
      showToast("Vui lòng nêu rõ lý do từ chối gia hạn", "warning");
      return;
    }
    setIsDecidingDeadline(true);
    try {
      await workspaceRepository.decideDeadlineRequest(
        activeDeadlineReq.id,
        {
          decision: deadlineDecision,
          reason: deadlineReason.trim() || null,
        },
        currentUser.id
      );

      showToast(
        deadlineDecision === "APPROVED"
          ? "Đã chấp thuận đề nghị gia hạn thời hạn"
          : "Đã từ chối đề nghị gia hạn thời hạn",
        deadlineDecision === "APPROVED" ? "success" : "warning"
      );
      setActiveDeadlineReq(null);
      setDeadlineReason("");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi xử lý đề nghị gia hạn", "error");
    } finally {
      setIsDecidingDeadline(false);
    }
  };

  // Submit Assignee decision
  const handleExecuteAssigneeDecision = async () => {
    if (!activeAssigneeReq || !currentUser) return;
    if (assigneeDecision === "REJECTED" && !assigneeReason.trim()) {
      showToast("Vui lòng nêu rõ lý do từ chối chuyển người chủ trì", "warning");
      return;
    }
    setIsDecidingAssignee(true);
    try {
      await workspaceRepository.decideAssigneeRequest(
        activeAssigneeReq.id,
        {
          decision: assigneeDecision,
          reason: assigneeReason.trim() || null,
        },
        currentUser.id
      );

      showToast(
        assigneeDecision === "APPROVED"
          ? "Đã chấp thuận chuyển người chủ trì công việc"
          : "Đã từ chối đề nghị chuyển người chủ trì",
        assigneeDecision === "APPROVED" ? "success" : "warning"
      );
      setActiveAssigneeReq(null);
      setAssigneeReason("");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi xử lý chuyển người chủ trì", "error");
    } finally {
      setIsDecidingAssignee(false);
    }
  };

  const pendingDeadlines = deadlineRequests.filter((r) => r.status === "PENDING");
  const pendingAssignees = assigneeRequests.filter((r) => r.status === "PENDING");

  // Columns for Submissions in review
  const submissionColumns = [
    {
      key: "code",
      header: "Mã việc",
      width: "110px",
      render: (t: Task) => (
        <span className="font-mono font-bold text-xs bg-slate-100 px-2 py-1 rounded text-text-primary">
          {t.code}
        </span>
      ),
    },
    {
      key: "title",
      header: "Tên công việc & Kết quả nộp",
      render: (t: Task) => {
        const sub = submissions.find((s) => s.taskId === t.id);
        return (
          <div className="space-y-1">
            <Link
              to={`/tasks/${t.id}`}
              className="font-semibold text-text-primary hover:text-brand-700 hover:underline"
            >
              {t.title}
            </Link>
            <div className="text-[11px] text-purple-900 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 inline-flex items-center gap-1.5 line-clamp-1">
              <FileText className="w-3 h-3 text-purple-700 shrink-0" />
              <span>{sub?.summary || t.deliverable}</span>
            </div>
          </div>
        );
      },
    },
    {
      key: "assignee",
      header: "Người nộp (Chủ trì)",
      width: "180px",
      render: (t: Task) => {
        const u = users.find((user) => user.id === t.primaryAssigneeId);
        return (
          <div className="flex items-center gap-2">
            <UserAvatar name={u?.displayName || "—"} size="sm" />
            <div>
              <div className="text-xs font-semibold text-text-primary">{u?.displayName || "Chưa gán"}</div>
              <div className="text-[10px] text-text-muted">{u?.jobTitle}</div>
            </div>
          </div>
        );
      },
    },
    {
      key: "submittedAt",
      header: "Thời điểm nộp",
      width: "150px",
      render: (t: Task) => {
        const sub = submissions.find((s) => s.taskId === t.id);
        if (!sub) return <span className="text-text-muted">—</span>;
        return (
          <div className="text-xs">
            <div className="text-text-primary font-medium">{formatRelativeVN(sub.submittedAt)}</div>
            <div className="text-[10px] text-text-muted">{formatDateTimeVN(sub.submittedAt)}</div>
          </div>
        );
      },
    },
    {
      key: "priority",
      header: "Ưu tiên",
      width: "100px",
      render: (t: Task) => <PriorityBadge priority={t.priority} />,
    },
    {
      key: "actions",
      header: "Thao tác",
      width: "170px",
      align: "right" as const,
      render: (t: Task) => (
        <Button
          variant="primary"
          size="sm"
          onClick={() => handleOpenDossier(t)}
          className="gap-1.5 bg-brand-700 hover:bg-brand-800 text-white"
        >
          <FileCheck className="w-3.5 h-3.5" /> Xem hồ sơ & Duyệt
        </Button>
      ),
    },
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        <Breadcrumb items={[{ label: "Chờ duyệt kết quả" }]} />

        <PageHeader
          title="Trung tâm phê duyệt & Tiếp nhận kết quả"
          subtitle="Xem xét các hồ sơ nộp báo cáo hoàn thành, đề nghị gia hạn và chuyển đổi người chủ trì."
        />

        {/* Navigation Tabs with Badges */}
        <div className="flex items-center gap-2 border-b border-border overflow-x-auto pb-px">
          <button
            onClick={() => setActiveTab("SUBMISSIONS")}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-btn border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === "SUBMISSIONS"
                ? "border-brand-700 text-brand-800 bg-brand-50/50"
                : "border-transparent text-text-secondary hover:text-text-primary hover:bg-slate-50"
            }`}
          >
            <FileCheck className="w-4 h-4 text-purple-700" />
            Hồ sơ kết quả chờ duyệt
            {reviewTasks.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-700 text-white">
                {reviewTasks.length}
              </span>
            )}
          </button>

          {isMockMode && <button
            onClick={() => setActiveTab("DEADLINES")}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-btn border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === "DEADLINES"
                ? "border-brand-700 text-brand-800 bg-brand-50/50"
                : "border-transparent text-text-secondary hover:text-text-primary hover:bg-slate-50"
            }`}
          >
            <Clock className="w-4 h-4 text-amber-700" />
            Đề nghị gia hạn hạn nộp
            {pendingDeadlines.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-600 text-white">
                {pendingDeadlines.length}
              </span>
            )}
          </button>}

          {isMockMode && <button
            onClick={() => setActiveTab("ASSIGNEES")}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-btn border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === "ASSIGNEES"
                ? "border-brand-700 text-brand-800 bg-brand-50/50"
                : "border-transparent text-text-secondary hover:text-text-primary hover:bg-slate-50"
            }`}
          >
            <UserCheck className="w-4 h-4 text-blue-700" />
            Đề nghị chuyển chủ trì
            {pendingAssignees.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white">
                {pendingAssignees.length}
              </span>
            )}
          </button>}

          <button
            onClick={() => setActiveTab("HISTORY")}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-btn border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === "HISTORY"
                ? "border-brand-700 text-brand-800 bg-brand-50/50"
                : "border-transparent text-text-secondary hover:text-text-primary hover:bg-slate-50"
            }`}
          >
            <History className="w-4 h-4 text-slate-600" />
            Lịch sử đã quyết định ({approvals.length})
          </button>
        </div>

        {/* TAB 1: SUBMISSIONS IN REVIEW */}
        {activeTab === "SUBMISSIONS" && (
          <div>
            {reviewTasks.length === 0 && !isLoading ? (
              <EmptyState
                icon={<CheckCircle2 className="w-10 h-10 text-emerald-600" />}
                title="Không có kết quả nào đang chờ duyệt"
                description="Toàn bộ các nhiệm vụ đã được thẩm định hoặc chuyên viên đang tiếp tục triển khai."
              />
            ) : (
              <>
                {/* Desktop View (>= 768px) */}
                <div className="hidden md:block">
                  <DataTable
                    data={reviewTasks}
                    columns={submissionColumns}
                    keyExtractor={(t) => t.id}
                    isLoading={isLoading}
                  />
                </div>

                {/* Mobile View (< 768px) */}
                <div className="block md:hidden space-y-3">
                  {reviewTasks.map((t) => {
                    const sub = submissions.find((s) => s.taskId === t.id);
                    const u = users.find((user) => user.id === t.primaryAssigneeId);

                    return (
                      <div
                        key={t.id}
                        className="p-4 bg-surface rounded-card border border-border shadow-xs space-y-3"
                      >
                        {/* Top: Code & Badges */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-mono font-bold text-xs bg-slate-100 text-text-primary px-2 py-0.5 rounded">
                              {t.code}
                            </span>
                            <PriorityBadge priority={t.priority} />
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                            Chờ duyệt kết quả
                          </span>
                        </div>

                        {/* Title */}
                        <Link
                          to={`/tasks/${t.id}`}
                          className="font-bold text-sm text-text-primary hover:text-brand-700 block leading-snug"
                        >
                          {t.title}
                        </Link>

                        {/* Submitter & Submit Date */}
                        <div className="flex items-center justify-between text-xs text-text-secondary pt-0.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <UserAvatar name={u?.displayName || "—"} size="sm" />
                            <div className="min-w-0">
                              <span className="font-semibold text-text-primary truncate block">
                                {u?.displayName || "Chưa gán"}
                              </span>
                              <span className="text-[10px] text-text-muted truncate block">
                                {u?.jobTitle}
                              </span>
                            </div>
                          </div>

                          {sub && (
                            <div className="text-right shrink-0">
                              <span className="text-text-primary font-medium block">
                                {formatRelativeVN(sub.submittedAt)}
                              </span>
                              <span className="text-[10px] text-text-muted block">
                                {formatDateTimeVN(sub.submittedAt)}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Deliverable / Summary Box */}
                        <div className="bg-purple-50/70 p-2.5 rounded-lg border border-purple-200/80 text-xs space-y-1">
                          <div className="flex items-center gap-1.5 font-semibold text-purple-900 text-[11px]">
                            <FileText className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                            <span>Báo cáo hoàn thành:</span>
                          </div>
                          <p className="text-purple-950 leading-relaxed text-xs">
                            {sub?.summary || t.deliverable || "Chuyên viên đã báo cáo hoàn thành nhiệm vụ."}
                          </p>
                        </div>

                        {/* Action Button */}
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleOpenDossier(t)}
                          className="w-full gap-2 bg-brand-700 hover:bg-brand-800 text-white font-semibold py-2"
                        >
                          <FileCheck className="w-4 h-4" /> Xem hồ sơ & Phê duyệt
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 2: DEADLINE REQUESTS */}
        {isMockMode && activeTab === "DEADLINES" && (
          <div className="space-y-4">
            {pendingDeadlines.length === 0 ? (
              <EmptyState
                icon={<Clock className="w-10 h-10 text-slate-400" />}
                title="Không có yêu cầu gia hạn nào đang chờ xử lý"
                description="Chuyên viên chưa gửi đề xuất gia hạn thời gian nào cho các nhiệm vụ."
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingDeadlines.map((req) => {
                  const t = reviewTasks.find((task) => task.id === req.taskId) || {
                    id: req.taskId,
                    code: "CV",
                    title: "Nhiệm vụ liên quan",
                    dueAt: null,
                  };
                  const requester = users.find((u) => u.id === req.requestedById);
                  return (
                    <div
                      key={req.id}
                      className="p-4 bg-surface rounded-card border border-amber-200 shadow-xs space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-mono text-xs font-bold bg-slate-100 px-2 py-0.5 rounded text-text-primary">
                            {t.code}
                          </span>
                          <h4 className="text-sm font-bold text-text-primary mt-1">{t.title}</h4>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          Chờ duyệt gia hạn
                        </span>
                      </div>

                      <div className="text-xs bg-slate-50 p-3 rounded space-y-1.5 border border-border">
                        <div className="flex justify-between">
                          <span className="text-text-muted">Người đề xuất:</span>
                          <span className="font-semibold text-text-primary">{requester?.displayName || "—"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-muted">Hạn hiện tại:</span>
                          <span className="text-text-primary line-through">{formatDateTimeVN(t.dueAt)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-muted">Hạn đề xuất mới:</span>
                          <span className="font-bold text-amber-700">{formatDateTimeVN(req.proposedDueAt)}</span>
                        </div>
                        <div className="pt-1 border-t border-slate-200">
                          <span className="text-text-muted">Lý do: </span>
                          <span className="italic text-text-primary">"{req.reason}"</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setActiveDeadlineReq(req);
                            setDeadlineDecision("REJECTED");
                            setDeadlineReason("");
                          }}
                          className="text-danger hover:bg-red-50 border-red-200 gap-1"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Từ chối
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            setActiveDeadlineReq(req);
                            setDeadlineDecision("APPROVED");
                            setDeadlineReason("");
                          }}
                          className="bg-emerald-700 hover:bg-emerald-800 text-white gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Chấp thuận
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: ASSIGNEE REQUESTS */}
        {isMockMode && activeTab === "ASSIGNEES" && (
          <div className="space-y-4">
            {pendingAssignees.length === 0 ? (
              <EmptyState
                icon={<UserCheck className="w-10 h-10 text-slate-400" />}
                title="Không có đề nghị đổi chủ trì nào đang chờ xử lý"
                description="Chưa có yêu cầu chuyển nhượng phân công từ phía các chuyên viên."
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingAssignees.map((req) => {
                  const requester = users.find((u) => u.id === req.requestedById);
                  const proposed = users.find((u) => u.id === req.proposedAssigneeId);
                  return (
                    <div
                      key={req.id}
                      className="p-4 bg-surface rounded-card border border-blue-200 shadow-xs space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
                          Đề nghị chuyển chủ trì
                        </span>
                        <span className="text-[11px] text-text-muted">{formatRelativeVN(req.createdAt)}</span>
                      </div>

                      <div className="text-xs bg-slate-50 p-3 rounded space-y-1.5 border border-border">
                        <div className="flex justify-between items-center">
                          <span className="text-text-muted">Chủ trì hiện tại:</span>
                          <span className="font-semibold text-text-primary">{requester?.displayName || "—"}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-text-muted">Đề xuất chuyển sang:</span>
                          <span className="font-bold text-blue-700 flex items-center gap-1.5">
                            <UserAvatar name={proposed?.displayName || "—"} size="sm" />
                            {proposed?.displayName} ({proposed?.jobTitle})
                          </span>
                        </div>
                        <div className="pt-1 border-t border-slate-200">
                          <span className="text-text-muted">Lý do: </span>
                          <span className="italic text-text-primary">"{req.reason}"</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setActiveAssigneeReq(req);
                            setAssigneeDecision("REJECTED");
                            setAssigneeReason("");
                          }}
                          className="text-danger hover:bg-red-50 border-red-200 gap-1"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Từ chối
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            setActiveAssigneeReq(req);
                            setAssigneeDecision("APPROVED");
                            setAssigneeReason("");
                          }}
                          className="bg-blue-700 hover:bg-blue-800 text-white gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Duyệt chuyển giao
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: DECISION HISTORY */}
        {activeTab === "HISTORY" && (
          <div className="space-y-3">
            {approvals.length === 0 ? (
              <EmptyState
                icon={<History className="w-10 h-10 text-slate-400" />}
                title="Chưa có lịch sử phê duyệt"
                description="Các quyết định duyệt hoặc trả lại kết quả sẽ được lưu vết đầy đủ tại đây."
              />
            ) : (
              <div className="bg-surface rounded-card border border-border divide-y divide-border">
                {approvals.map((app) => {
                  const decider = users.find((u) => u.id === app.decidedById);
                  return (
                    <div key={app.id} className="p-4 flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          {app.decision === "APPROVED" ? (
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Đã duyệt hoàn thành
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                              <RotateCcw className="w-3 h-3" /> Đã trả lại yêu cầu bổ sung
                            </span>
                          )}
                          <Link
                            to={`/tasks/${app.taskId}`}
                            className="font-mono text-xs font-semibold text-brand-700 hover:underline"
                          >
                            Xem chi tiết công việc
                          </Link>
                        </div>
                        {app.reason && (
                          <div className="text-xs text-text-secondary bg-slate-50 p-2.5 rounded border border-border mt-1">
                            <strong>Ý kiến nhận xét:</strong> "{app.reason}"
                          </div>
                        )}
                        <div className="text-[11px] text-text-muted flex items-center gap-2">
                          <span>Người quyết định: <strong>{decider?.displayName || "Trưởng phòng"}</strong></span>
                          <span>•</span>
                          <span>Thời điểm: {formatDateTimeVN(app.decidedAt)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* MODAL: SUBMISSION REVIEW DOSSIER */}
        {selectedTask && selectedSub && (
          <ConfirmDialog
            isOpen={!!selectedTask}
            title={`Hồ sơ kết quả: [${selectedTask.code}] ${selectedTask.title}`}
            description="Xem xét nội dung báo cáo và tệp giao nộp của chuyên viên để đưa ra quyết định."
            confirmText={
              decisionMode === "APPROVE"
                ? "Xác nhận duyệt hoàn thành"
                : decisionMode === "RETURN"
                ? "Xác nhận trả lại hồ sơ"
                : "Đóng"
            }
            cancelText={decisionMode !== "NONE" ? "Quay lại" : "Đóng"}
            variant={decisionMode === "RETURN" ? "danger" : "primary"}
            isLoading={isSubmittingDecision}
            onCancel={() => {
              if (decisionMode !== "NONE") {
                setDecisionMode("NONE");
              } else {
                setSelectedTask(null);
                setSelectedSub(null);
              }
            }}
            onConfirm={() => {
              if (decisionMode === "NONE") {
                setSelectedTask(null);
                setSelectedSub(null);
              } else {
                handleExecuteApproval();
              }
            }}
          >
            <div className="space-y-4 py-2 text-xs">
              {/* Submission details */}
              <div className="p-3 bg-purple-50 rounded border border-purple-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-purple-900">Nội dung kết quả bàn giao:</span>
                  <span className="text-[11px] text-purple-700">
                    Nộp {formatRelativeVN(selectedSub.submittedAt)}
                  </span>
                </div>
                <p className="text-text-primary whitespace-pre-wrap leading-relaxed">
                  {selectedSub.summary}
                </p>

                {selectedSub.details && (
                  <div className="pt-2 border-t border-purple-200/80">
                    <span className="font-semibold text-purple-900 block mb-0.5">Chi tiết số liệu đạt được:</span>
                    <p className="text-text-primary whitespace-pre-wrap">{selectedSub.details}</p>
                  </div>
                )}

                {selectedSub.deliverableUrl && (
                  <div className="pt-2 border-t border-purple-200/80 flex items-center gap-1.5">
                    <span className="font-semibold text-purple-900 shrink-0">Link sản phẩm:</span>
                    <a
                      href={selectedSub.deliverableUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-700 underline truncate hover:text-brand-800"
                    >
                      {selectedSub.deliverableUrl}
                    </a>
                  </div>
                )}

                {selectedSub.notes && (
                  <div className="pt-2 border-t border-purple-200/80">
                    <span className="font-semibold text-purple-900 block mb-0.5">Tự đánh giá & Kiến nghị:</span>
                    <p className="text-text-primary whitespace-pre-wrap">{selectedSub.notes}</p>
                  </div>
                )}
              </div>

              {/* Attached files */}
              <div>
                <span className="font-semibold text-text-primary block mb-1">
                  Tệp đính kèm ({taskFiles.length}):
                </span>
                {taskFiles.length === 0 ? (
                  <p className="text-text-muted italic">Không có tệp đính kèm trong đợt nộp này.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {taskFiles.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center gap-2 p-2 rounded border border-border bg-slate-50"
                      >
                        <Paperclip className="w-4 h-4 text-brand-700 shrink-0" />
                        <div className="truncate">
                          <div className="font-medium text-text-primary truncate">{file.originalName}</div>
                          <div className="text-[10px] text-text-muted">
                            {(file.sizeBytes / 1024).toFixed(0)} KB
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Previous approvals/returns history */}
              {taskApprovals.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-border">
                  <span className="font-semibold text-text-primary block">Lịch sử đánh giá trước đó:</span>
                  {taskApprovals.map((app) => (
                    <div
                      key={app.id}
                      className="text-[11px] p-2 rounded bg-amber-50/50 border border-amber-200 space-y-1"
                    >
                      <div className="flex justify-between font-semibold text-amber-900">
                        <span>Đã trả lại ngày {formatDateTimeVN(app.decidedAt)}</span>
                      </div>
                      <p className="italic text-text-primary">"{app.reason}"</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Action Decision Choice */}
              {decisionMode === "NONE" ? (
                <div className="pt-3 border-t border-border flex items-center justify-end gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDecisionMode("RETURN");
                      setApprovalNote("");
                    }}
                    className="text-amber-800 border-amber-300 hover:bg-amber-50 gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-amber-700" /> Trả lại yêu cầu bổ sung
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setDecisionMode("APPROVE");
                      setApprovalNote("");
                    }}
                    className="bg-emerald-700 hover:bg-emerald-800 text-white gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Duyệt hoàn thành
                  </Button>
                </div>
              ) : decisionMode === "APPROVE" ? (
                <div className="pt-3 border-t border-border space-y-2">
                  <div className="font-semibold text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Xác nhận phê duyệt hoàn thành công việc
                  </div>
                  <Textarea
                    label="Nhận xét / Đánh giá kết quả (Tùy chọn)"
                    placeholder="Ghi nhận kết quả thực hiện của chuyên viên..."
                    rows={3}
                    value={approvalNote}
                    onChange={(e) => setApprovalNote(e.target.value)}
                  />
                </div>
              ) : (
                <div className="pt-3 border-t border-border space-y-2">
                  <div className="font-semibold text-danger flex items-center gap-1.5">
                    <RotateCcw className="w-4 h-4 text-danger" /> Trả lại yêu cầu bổ sung kết quả
                  </div>
                  <Textarea
                    label="Lý do trả lại & Yêu cầu chỉnh sửa cụ thể *"
                    placeholder="Nêu rõ các điểm chưa đạt, số liệu cần bổ sung hoặc tài liệu cần chỉnh lý..."
                    rows={3}
                    required
                    value={approvalNote}
                    onChange={(e) => setApprovalNote(e.target.value)}
                  />
                  <p className="text-[11px] text-text-muted">
                    * Công việc sẽ được chuyển về trạng thái <code>IN_PROGRESS</code> và gửi thông báo trực tiếp đến chuyên viên chủ trì.
                  </p>
                </div>
              )}
            </div>
          </ConfirmDialog>
        )}

        {/* MODAL: DEADLINE REQUEST DECISION */}
        {activeDeadlineReq && (
          <ConfirmDialog
            isOpen={!!activeDeadlineReq}
            title={deadlineDecision === "APPROVED" ? "Chấp thuận gia hạn thời hạn" : "Từ chối đề xuất gia hạn"}
            description="Đưa ra quyết định và ghi nhận lý do thông báo đến chuyên viên."
            confirmText={deadlineDecision === "APPROVED" ? "Xác nhận gia hạn" : "Xác nhận từ chối"}
            cancelText="Hủy bỏ"
            variant={deadlineDecision === "APPROVED" ? "primary" : "danger"}
            isLoading={isDecidingDeadline}
            onCancel={() => setActiveDeadlineReq(null)}
            onConfirm={handleExecuteDeadlineDecision}
          >
            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 bg-slate-50 rounded border border-border space-y-1">
                <div>Thời hạn mới đề xuất: <strong>{formatDateTimeVN(activeDeadlineReq.proposedDueAt)}</strong></div>
                <div>Lý do của chuyên viên: <em>"{activeDeadlineReq.reason}"</em></div>
              </div>

              <Textarea
                label={deadlineDecision === "APPROVED" ? "Ghi chú phê duyệt (Tùy chọn)" : "Lý do từ chối cụ thể *"}
                placeholder="Nhập nội dung phản hồi gửi đến chuyên viên..."
                rows={3}
                required={deadlineDecision === "REJECTED"}
                value={deadlineReason}
                onChange={(e) => setDeadlineReason(e.target.value)}
              />
            </div>
          </ConfirmDialog>
        )}

        {/* MODAL: ASSIGNEE REQUEST DECISION */}
        {activeAssigneeReq && (
          <ConfirmDialog
            isOpen={!!activeAssigneeReq}
            title={assigneeDecision === "APPROVED" ? "Chấp thuận chuyển người chủ trì" : "Từ chối chuyển chủ trì"}
            description="Phân công lại quyền hạn chủ trì công việc hoặc bác bỏ đề xuất."
            confirmText={assigneeDecision === "APPROVED" ? "Xác nhận chuyển giao" : "Xác nhận từ chối"}
            cancelText="Hủy bỏ"
            variant={assigneeDecision === "APPROVED" ? "primary" : "danger"}
            isLoading={isDecidingAssignee}
            onCancel={() => setActiveAssigneeReq(null)}
            onConfirm={handleExecuteAssigneeDecision}
          >
            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 bg-slate-50 rounded border border-border space-y-1">
                <div>Lý do đề xuất: <em>"{activeAssigneeReq.reason}"</em></div>
              </div>

              <Textarea
                label="Ý kiến chỉ đạo / Nhận xét (Tùy chọn)"
                placeholder="Nhập thông điệp giao việc bổ sung..."
                rows={3}
                value={assigneeReason}
                onChange={(e) => setAssigneeReason(e.target.value)}
              />
            </div>
          </ConfirmDialog>
        )}
      </div>
    </AppShell>
  );
}
