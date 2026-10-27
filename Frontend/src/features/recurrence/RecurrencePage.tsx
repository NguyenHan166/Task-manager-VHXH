import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { useSession } from "../auth/SessionContext";
import { mockRepository } from "../../mocks/mock-repository";
import type {
    RecurrenceRule,
    RecurrenceInstance,
    Task,
    TaskSubmission,
    TaskPriority,
    Id,
} from "../../shared/data-contract";
import {
    Breadcrumb,
    PageHeader,
    Button,
    Card,
    CardContent,
    ConfirmDialog,
    PriorityBadge,
    UserAvatar,
    EmptyState,
    useToast,
} from "../../components/ui";
import { formatDateTimeVN } from "../../shared/datetime";
import {
    Repeat,
    PlusCircle,
    Play,
    CheckCircle2,
    Calendar,
    Edit2,
    Trash2,
    Users,
    Building2,
    Clock,
    Send,
    ExternalLink,
    AlertCircle,
    FileCheck,
} from "lucide-react";

export function RecurrencePage() {
    const { currentUser, isLeader, isStaff, users } = useSession();
    const { showToast } = useToast();

    const [rules, setRules] = useState<RecurrenceRule[]>([]);
    const [instances, setInstances] = useState<RecurrenceInstance[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [submissions, setSubmissions] = useState<TaskSubmission[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState<string | null>(null);

    // Filter tab for rules
    const [filterTab, setFilterTab] = useState<"ALL" | "ACTIVE" | "PAUSED">("ALL");

    // Modal Create Rule
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [createTitle, setCreateTitle] = useState("");
    const [createDescription, setCreateDescription] = useState("");
    const [createPriority, setCreatePriority] = useState<TaskPriority>("HIGH");
    const [createFrequency, setCreateFrequency] = useState<"WEEKLY" | "MONTHLY">("WEEKLY");
    const [createScope, setCreateScope] = useState<"ALL" | "CUSTOM">("ALL");
    const [createAssigneeIds, setCreateAssigneeIds] = useState<Id[]>([]);
    const [createDueAfterHours, setCreateDueAfterHours] = useState(48);

    // Modal Edit Rule
    const [editingRule, setEditingRule] = useState<RecurrenceRule | null>(null);
    const [editTitle, setEditTitle] = useState("");
    const [editDescription, setEditDescription] = useState("");
    const [editPriority, setEditPriority] = useState<TaskPriority>("NORMAL");
    const [editFrequency, setEditFrequency] = useState<"WEEKLY" | "MONTHLY">("MONTHLY");
    const [editScope, setEditScope] = useState<"ALL" | "CUSTOM">("ALL");
    const [editAssigneeIds, setEditAssigneeIds] = useState<Id[]>([]);
    const [editDueAfterHours, setEditDueAfterHours] = useState(72);
    const [isSavingEdit, setIsSavingEdit] = useState(false);

    // Modal Delete Rule
    const [ruleToDelete, setRuleToDelete] = useState<RecurrenceRule | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Modal Report Submission (Staff trực tiếp báo cáo)
    const [reportingTask, setReportingTask] = useState<Task | null>(null);
    const [reportingRule, setReportingRule] = useState<RecurrenceRule | null>(null);
    const [reportSummary, setReportSummary] = useState("");
    const [reportDetails, setReportDetails] = useState("");
    const [reportDeliverableUrl, setReportDeliverableUrl] = useState("");
    const [reportNotes, setReportNotes] = useState("");
    const [isSubmittingReport, setIsSubmittingReport] = useState(false);
    const [reportError, setReportError] = useState("");

    // Modal View Submitted Report
    const [viewingTask, setViewingTask] = useState<Task | null>(null);
    const [viewingSubmission, setViewingSubmission] = useState<TaskSubmission | null>(null);

    // Only staff users in department for assignment
    const staffUsers = useMemo(() => {
        return users.filter((u) => u.status === "ACTIVE" && u.role === "STAFF");
    }, [users]);

    const loadData = async () => {
        try {
            const [rList, iList, tList, sList] = await Promise.all([
                mockRepository.getRecurrenceRules(),
                mockRepository.getRecurrenceInstances(),
                mockRepository.getTasks(),
                mockRepository.getSubmissions(),
            ]);
            setRules(rList);
            setInstances(iList);
            setTasks(tList);
            setSubmissions(sList);
        } catch {
            showToast("Không thể tải danh sách dữ liệu định kỳ", "error");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        const unsub = mockRepository.subscribe(loadData);
        return unsub;
    }, []);

    // Visible rules based on permissions
    const visibleRules = useMemo(() => {
        let list = rules;

        // If staff, only show rules assigned to ALL or where staff is in assigneeIds
        if (isStaff && currentUser) {
            list = list.filter((r) => {
                if (r.scope === "ALL") return true;
                if (r.assigneeIds && r.assigneeIds.includes(currentUser.id)) return true;
                if (r.primaryAssigneeId === currentUser.id) return true;
                return false;
            });
        }

        if (filterTab === "ACTIVE") {
            list = list.filter((r) => r.active);
        } else if (filterTab === "PAUSED") {
            list = list.filter((r) => !r.active);
        }

        return list;
    }, [rules, isStaff, currentUser, filterTab]);

    // Handle Toggle Active
    const handleToggleActive = async (rule: RecurrenceRule) => {
        try {
            await mockRepository.toggleRecurrenceRule(rule.id, !rule.active);
            showToast(
                rule.active
                    ? `Đã tạm dừng mẫu "${rule.title}"`
                    : `Đã kích hoạt mẫu "${rule.title}"`,
                "success",
            );
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Thao tác thất bại";
            showToast(msg, "error");
        }
    };

    // Handle Manual Generate Next Run
    const handleGenerateNext = async (rule: RecurrenceRule) => {
        if (!currentUser) return;
        setIsGenerating(rule.id);
        try {
            const res = await mockRepository.generateRecurrenceNext(
                rule.id,
                currentUser.id,
            );
            const count = res.tasks?.length || 1;
            showToast(
                `Đã phát hành kỳ [${res.instance.periodKey}] thành công cho ${count} thành viên!`,
                "success",
            );
            await loadData();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Thao tác thất bại";
            showToast(msg, "error");
        } finally {
            setIsGenerating(null);
        }
    };

    // Open Create Modal
    const handleOpenCreateModal = () => {
        setCreateTitle("");
        setCreateDescription("");
        setCreatePriority("HIGH");
        setCreateFrequency("WEEKLY");
        setCreateScope("ALL");
        setCreateAssigneeIds(staffUsers.map((u) => u.id));
        setCreateDueAfterHours(48);
        setIsCreateModalOpen(true);
    };

    // Submit Create Rule
    const handleCreateRule = async () => {
        if (!currentUser) return;
        if (!createTitle.trim()) {
            showToast("Vui lòng nhập tên mẫu công việc định kỳ", "error");
            return;
        }

        try {
            const now = new Date();
            const nextRun = new Date(
                now.getTime() + (createFrequency === "WEEKLY" ? 7 : 30) * 86400000,
            );

            const assignees =
                createScope === "ALL"
                    ? staffUsers.map((u) => u.id)
                    : createAssigneeIds.length > 0
                    ? createAssigneeIds
                    : [staffUsers[0]?.id || currentUser.id];

            await mockRepository.createRecurrenceRule({
                title: createTitle.trim(),
                description: createDescription.trim(),
                ownerId: currentUser.id,
                scope: createScope,
                assigneeIds: assignees,
                primaryAssigneeId: assignees[0] || currentUser.id,
                priority: createPriority,
                frequency: createFrequency,
                dueAfterHours: Number(createDueAfterHours) || 48,
                nextRunAt: nextRun.toISOString(),
                active: true,
            });

            showToast("Đã tạo mẫu nhiệm vụ định kỳ mới thành công", "success");
            setIsCreateModalOpen(false);
            await loadData();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Không thể tạo quy tắc";
            showToast(msg, "error");
        }
    };

    // Open Edit Modal
    const handleOpenEditModal = (rule: RecurrenceRule) => {
        setEditingRule(rule);
        setEditTitle(rule.title);
        setEditDescription(rule.description || "");
        setEditPriority(rule.priority);
        setEditFrequency(rule.frequency);
        setEditScope(rule.scope || "ALL");
        setEditAssigneeIds(
            rule.assigneeIds && rule.assigneeIds.length > 0
                ? rule.assigneeIds
                : staffUsers.map((u) => u.id),
        );
        setEditDueAfterHours(rule.dueAfterHours || 48);
    };

    // Submit Edit Rule
    const handleSaveEditRule = async () => {
        if (!editingRule || !currentUser) return;
        if (!editTitle.trim()) {
            showToast("Vui lòng nhập tên mẫu công việc định kỳ", "error");
            return;
        }

        setIsSavingEdit(true);
        try {
            const assignees =
                editScope === "ALL"
                    ? staffUsers.map((u) => u.id)
                    : editAssigneeIds.length > 0
                    ? editAssigneeIds
                    : [staffUsers[0]?.id || currentUser.id];

            await mockRepository.updateRecurrenceRule(editingRule.id, {
                title: editTitle.trim(),
                description: editDescription.trim(),
                scope: editScope,
                assigneeIds: assignees,
                primaryAssigneeId: assignees[0] || currentUser.id,
                priority: editPriority,
                frequency: editFrequency,
                dueAfterHours: Number(editDueAfterHours) || 48,
            });

            showToast(`Đã cập nhật mẫu "${editTitle.trim()}"`, "success");
            setEditingRule(null);
            await loadData();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Không thể cập nhật";
            showToast(msg, "error");
        } finally {
            setIsSavingEdit(false);
        }
    };

    // Submit Delete Rule
    const handleConfirmDeleteRule = async () => {
        if (!ruleToDelete) return;
        setIsDeleting(true);
        try {
            await mockRepository.deleteRecurrenceRule(ruleToDelete.id);
            showToast(`Đã xóa mẫu định kỳ "${ruleToDelete.title}"`, "success");
            setRuleToDelete(null);
            await loadData();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Không thể xóa";
            showToast(msg, "error");
        } finally {
            setIsDeleting(false);
        }
    };

    // Open Report Submission Modal (Staff)
    const handleOpenReportModal = (task: Task, rule: RecurrenceRule) => {
        setReportingTask(task);
        setReportingRule(rule);
        setReportSummary("");
        setReportDetails("");
        setReportDeliverableUrl("");
        setReportNotes("");
        setReportError("");
    };

    // Submit Report (Staff nộp báo cáo kết quả kỳ định kỳ)
    const handleSubmitReport = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!reportingTask || !currentUser) return;

        if (!reportSummary.trim()) {
            setReportError("Vui lòng nhập tóm tắt kết quả báo cáo thực hiện");
            return;
        }

        setIsSubmittingReport(true);
        setReportError("");
        try {
            await mockRepository.submitRecurrenceReport(
                reportingTask.id,
                {
                    summary: reportSummary.trim(),
                    details: reportDetails.trim() || undefined,
                    deliverableUrl: reportDeliverableUrl.trim() || undefined,
                    notes: reportNotes.trim() || undefined,
                    fileIds: [],
                },
                currentUser.id,
            );

            showToast(
                `Đã nộp báo cáo kỳ định kỳ thành công! Kết quả đang chờ Lãnh đạo phê duyệt.`,
                "success",
            );
            setReportingTask(null);
            setReportingRule(null);
            await loadData();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Lỗi khi nộp báo cáo";
            setReportError(msg);
        } finally {
            setIsSubmittingReport(false);
        }
    };

    // View submitted details
    const handleViewSubmission = (task: Task) => {
        const sub = submissions
            .filter((s) => s.taskId === task.id)
            .sort(
                (a, b) =>
                    new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
            )[0];
        setViewingTask(task);
        setViewingSubmission(sub || null);
    };

    // Compute upcoming period key preview for display
    const computeNextPeriodPreview = (rule: RecurrenceRule) => {
        const nextDate = new Date(rule.nextRunAt || Date.now());
        const year = nextDate.getFullYear();
        const month = String(nextDate.getMonth() + 1).padStart(2, "0");
        const oneJan = new Date(nextDate.getFullYear(), 0, 1);
        const numberOfDays = Math.floor(
            (nextDate.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000),
        );
        const weekNumber = Math.ceil((nextDate.getDay() + 1 + numberOfDays) / 7);
        return rule.frequency === "WEEKLY"
            ? `${year}-W${String(weekNumber).padStart(2, "0")}`
            : `${year}-${month}`;
    };

    // Render helper for assignee scope badge
    const renderScopeBadge = (rule: RecurrenceRule) => {
        if (rule.scope === "ALL") {
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    <Building2 className="w-3 h-3 text-emerald-600" /> Cả phòng ({staffUsers.length} chuyên viên)
                </span>
            );
        }

        const count = rule.assigneeIds?.length || (rule.primaryAssigneeId ? 1 : 0);
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                <Users className="w-3 h-3 text-blue-600" /> {count} chuyên viên cụ thể
            </span>
        );
    };

    return (
        <AppShell>
            <div className="space-y-6">
                <Breadcrumb
                    items={[
                        { label: "Tổng quan", href: "/dashboard" },
                        { label: "Nhiệm vụ định kỳ" },
                    ]}
                />

                <PageHeader
                    title="Nhiệm vụ định kỳ (Recurrence Tasks)"
                    subtitle={
                        isLeader
                            ? "Cấu hình tự động phát hành nhiệm vụ định kỳ theo tuần hoặc tháng. Giao việc cho cả phòng hoặc danh sách chuyên viên cụ thể và theo dõi tiến độ nộp báo cáo."
                            : "Danh sách nhiệm vụ định kỳ của đơn vị. Bạn có thể trực tiếp nộp báo cáo kết quả cho từng kỳ tại đây."
                    }
                    badge={
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-100 text-brand-800 border border-brand-200">
                            {isLeader ? "Quản trị & Điều hành" : "Không gian Chuyên viên"}
                        </span>
                    }
                    actions={
                        isLeader ? (
                            <Button
                                variant="primary"
                                size="sm"
                                className="gap-1.5 shadow-sm font-medium"
                                onClick={handleOpenCreateModal}
                            >
                                <PlusCircle className="w-4 h-4" /> Tạo mẫu định kỳ mới
                            </Button>
                        ) : undefined
                    }
                />

                {/* Filter Tabs for Leader */}
                <div className="flex items-center justify-between border-b border-border pb-2 text-xs">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setFilterTab("ALL")}
                            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                                filterTab === "ALL"
                                    ? "bg-brand-50 text-brand-700 font-bold"
                                    : "text-text-secondary hover:bg-slate-100"
                            }`}
                        >
                            Tất cả ({rules.length})
                        </button>
                        <button
                            onClick={() => setFilterTab("ACTIVE")}
                            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                                filterTab === "ACTIVE"
                                    ? "bg-emerald-50 text-emerald-800 font-bold"
                                    : "text-text-secondary hover:bg-slate-100"
                            }`}
                        >
                            Đang hiệu lực ({rules.filter((r) => r.active).length})
                        </button>
                        <button
                            onClick={() => setFilterTab("PAUSED")}
                            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                                filterTab === "PAUSED"
                                    ? "bg-slate-200 text-slate-800 font-bold"
                                    : "text-text-secondary hover:bg-slate-100"
                            }`}
                        >
                            Đã tạm dừng ({rules.filter((r) => !r.active).length})
                        </button>
                    </div>

                    <div className="text-text-muted text-[11px]">
                        Hiển thị {visibleRules.length} mẫu nhiệm vụ
                    </div>
                </div>

                {visibleRules.length === 0 && !isLoading ? (
                    <EmptyState
                        title="Chưa có mẫu nhiệm vụ định kỳ nào"
                        description={
                            isLeader
                                ? "Tạo mẫu công việc lặp lại để phòng ban tự động hóa quy trình nộp báo cáo định kỳ hàng tháng/hàng tuần."
                                : "Hiện chưa có nhiệm vụ định kỳ nào được phân công cho bạn."
                        }
                        icon={<Repeat className="w-8 h-8 text-slate-400" />}
                        action={
                            isLeader ? (
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={handleOpenCreateModal}
                                >
                                    <PlusCircle className="w-3.5 h-3.5 mr-1" /> Tạo mẫu đầu tiên
                                </Button>
                            ) : undefined
                        }
                    />
                ) : (
                    <div className="space-y-6">
                        {visibleRules.map((rule) => {
                            const ruleInstances = instances.filter(
                                (inst) => inst.ruleId === rule.id,
                            );
                            const nextPeriod = computeNextPeriodPreview(rule);

                            // Find target assignees of this rule
                            const assignedUserIds =
                                rule.scope === "ALL"
                                    ? staffUsers.map((u) => u.id)
                                    : rule.assigneeIds && rule.assigneeIds.length > 0
                                    ? rule.assigneeIds
                                    : rule.primaryAssigneeId
                                    ? [rule.primaryAssigneeId]
                                    : [];

                            const assignedMembers = users.filter((u) =>
                                assignedUserIds.includes(u.id),
                            );

                            // Find tasks created for this rule's instances
                            const ruleTaskIds = new Set<string>();
                            ruleInstances.forEach((inst) => {
                                if (inst.taskId) ruleTaskIds.add(inst.taskId);
                                if (inst.taskIds) inst.taskIds.forEach((tid) => ruleTaskIds.add(tid));
                            });

                            const ruleTasks = tasks.filter((t) => ruleTaskIds.has(t.id));

                            // If staff, find current user's task in this rule
                            const myTasksInRule = isStaff && currentUser
                                ? ruleTasks.filter((t) => t.primaryAssigneeId === currentUser.id)
                                : [];

                            const latestMyTask = myTasksInRule[myTasksInRule.length - 1] || null;

                            return (
                                <Card
                                    key={rule.id}
                                    className="overflow-hidden border-border/80 shadow-xs"
                                >
                                    {/* Card Header */}
                                    <div className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border/60 bg-surface">
                                        <div className="space-y-1.5 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-mono text-xs font-bold text-text-muted bg-slate-100 px-2 py-0.5 rounded">
                                                    {rule.id}
                                                </span>
                                                <h2 className="text-base font-bold text-text-primary">
                                                    {rule.title}
                                                </h2>
                                                <span
                                                    className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
                                                        rule.frequency === "WEEKLY"
                                                            ? "bg-purple-50 text-purple-700 border-purple-200"
                                                            : "bg-blue-50 text-blue-700 border-blue-200"
                                                    }`}
                                                >
                                                    {rule.frequency === "WEEKLY" ? "Lặp hàng tuần" : "Lặp hàng tháng"}
                                                </span>
                                                <PriorityBadge priority={rule.priority} />
                                                {renderScopeBadge(rule)}
                                                <span
                                                    className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                                                        rule.active
                                                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                                            : "bg-slate-100 text-slate-500 border border-slate-200"
                                                    }`}
                                                >
                                                    {rule.active ? "Đang hiệu lực" : "Tạm dừng"}
                                                </span>
                                            </div>
                                            <p className="text-xs text-text-secondary leading-relaxed max-w-3xl">
                                                {rule.description || "Không có ghi chú mô tả"}
                                            </p>
                                        </div>

                                        {/* Action buttons (CRUD for Leader, or Report for Staff) */}
                                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                                            {isLeader && (
                                                <>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleOpenEditModal(rule)}
                                                        className="h-8 px-2.5 text-xs gap-1 text-slate-700 hover:bg-slate-100"
                                                        title="Chỉnh sửa mẫu định kỳ"
                                                    >
                                                        <Edit2 className="w-3.5 h-3.5 text-brand-700" /> Sửa
                                                    </Button>

                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleToggleActive(rule)}
                                                        className="h-8 px-2.5 text-xs text-slate-700"
                                                    >
                                                        {rule.active ? "Tạm dừng" : "Kích hoạt"}
                                                    </Button>

                                                    <Button
                                                        variant="primary"
                                                        size="sm"
                                                        className="h-8 px-3 text-xs gap-1.5 shadow-sm"
                                                        disabled={!rule.active || isGenerating === rule.id}
                                                        onClick={() => handleGenerateNext(rule)}
                                                        title="Phát hành ngay kỳ tiếp theo cho tất cả chuyên viên"
                                                    >
                                                        <Play className="w-3 h-3" />
                                                        {isGenerating === rule.id ? "Đang sinh..." : "Phát hành kỳ tới"}
                                                    </Button>

                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => setRuleToDelete(rule)}
                                                        className="h-8 px-2 text-xs text-danger hover:bg-red-50 hover:border-danger"
                                                        title="Xóa mẫu định kỳ"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </Button>
                                                </>
                                            )}

                                            {/* Staff quick report button if they have a task needing report */}
                                            {isStaff && latestMyTask && (
                                                <>
                                                    {latestMyTask.status === "TODO" ||
                                                    latestMyTask.status === "IN_PROGRESS" ? (
                                                        <Button
                                                            variant="primary"
                                                            size="sm"
                                                            onClick={() => handleOpenReportModal(latestMyTask, rule)}
                                                            className="gap-1.5 text-xs shadow-sm bg-brand-700 hover:bg-brand-800"
                                                        >
                                                            <Send className="w-3.5 h-3.5" /> Báo cáo kỳ này
                                                        </Button>
                                                    ) : latestMyTask.status === "IN_REVIEW" ? (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleViewSubmission(latestMyTask)}
                                                            className="gap-1.5 text-xs text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100"
                                                        >
                                                            <Clock className="w-3.5 h-3.5" /> Đã nộp (Chờ duyệt)
                                                        </Button>
                                                    ) : latestMyTask.status === "DONE" ? (
                                                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                                            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Đã hoàn thành
                                                        </span>
                                                    ) : null}
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* Card Content */}
                                    <CardContent className="p-5 grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-50/50 text-xs">
                                        {/* Block 1: Phân công & Đối tượng */}
                                        <div className="space-y-3">
                                            <div className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                                                <Users className="w-3.5 h-3.5 text-brand-700" />
                                                Đối tượng thực hiện
                                            </div>
                                            <div className="bg-surface p-3.5 rounded-lg border border-border/80 space-y-2.5">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-text-secondary">Phạm vi giao:</span>
                                                    <span className="font-semibold text-text-primary">
                                                        {rule.scope === "ALL" ? "Cả phòng" : "Chuyên viên cụ thể"}
                                                    </span>
                                                </div>

                                                <div className="space-y-1">
                                                    <span className="text-text-muted text-[11px] block">
                                                        Danh sách thành viên ({assignedMembers.length}):
                                                    </span>
                                                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-0.5">
                                                        {assignedMembers.map((m) => (
                                                            <div
                                                                key={m.id}
                                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-800 text-[11px]"
                                                            >
                                                                <UserAvatar user={m} size="sm" />
                                                                <span className="font-medium">{m.displayName}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between pt-1 border-t border-border/60">
                                                    <span className="text-text-secondary">Hạn nộp sau:</span>
                                                    <span className="font-semibold text-text-primary">
                                                        {rule.dueAfterHours} giờ (~{Math.round(rule.dueAfterHours / 24)} ngày)
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Block 2: Dự kiến phát hành kỳ tới */}
                                        <div className="space-y-3">
                                            <div className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                                                <Calendar className="w-3.5 h-3.5 text-brand-700" />
                                                Kỳ phát hành tiếp theo
                                            </div>
                                            <div className="bg-surface p-3.5 rounded-lg border border-border/80 space-y-2.5">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-text-secondary">Mã kỳ (Period):</span>
                                                    <span className="font-mono font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                                                        {nextPeriod}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-text-secondary">Thời điểm chạy:</span>
                                                    <span className="font-medium text-text-primary">
                                                        {formatDateTimeVN(rule.nextRunAt)}
                                                    </span>
                                                </div>
                                                <div className="text-[11px] text-text-muted">
                                                    Tên nhiệm vụ tự sinh:
                                                    <div className="font-semibold text-text-primary truncate mt-0.5">
                                                        {rule.title} - Kỳ {nextPeriod}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Block 3: Lịch sử các kỳ & Tiến độ nộp báo cáo */}
                                        <div className="space-y-3">
                                            <div className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center justify-between">
                                                <span className="flex items-center gap-1.5">
                                                    <Clock className="w-3.5 h-3.5 text-brand-700" />
                                                    Lịch sử đã sinh ({ruleInstances.length} kỳ)
                                                </span>
                                            </div>

                                            <div className="bg-surface p-3 rounded-lg border border-border/80 max-h-48 overflow-y-auto space-y-2">
                                                {ruleInstances.length === 0 ? (
                                                    <div className="text-xs text-text-muted italic py-4 text-center">
                                                        Chưa có kỳ nào được phát hành từ mẫu này.
                                                    </div>
                                                ) : (
                                                    ruleInstances.map((inst) => {
                                                        // Tasks of this instance
                                                        const instTaskIds = inst.taskIds || (inst.taskId ? [inst.taskId] : []);
                                                        const instTasks = tasks.filter((t) => instTaskIds.includes(t.id));

                                                        // Submissions count
                                                        const submittedCount = instTasks.filter(
                                                            (t) => t.status === "IN_REVIEW" || t.status === "DONE",
                                                        ).length;

                                                        return (
                                                            <div
                                                                key={inst.id}
                                                                className="p-2 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1.5"
                                                            >
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                                                        <span className="font-mono font-bold text-brand-700 text-xs">
                                                                            Kỳ {inst.periodKey}
                                                                        </span>
                                                                    </div>
                                                                    <span className="text-[11px] font-semibold text-text-secondary">
                                                                        Đã nộp: {submittedCount}/{instTasks.length}
                                                                    </span>
                                                                </div>

                                                                {/* Task rows of each staff */}
                                                                <div className="space-y-1 pt-1 border-t border-slate-200">
                                                                    {instTasks.map((t) => {
                                                                        const assignee = users.find(
                                                                            (u) => u.id === t.primaryAssigneeId,
                                                                        );
                                                                        const isMyTask = t.primaryAssigneeId === currentUser?.id;

                                                                        return (
                                                                            <div
                                                                                key={t.id}
                                                                                className={`flex items-center justify-between text-[11px] px-1.5 py-1 rounded transition-colors ${
                                                                                    isMyTask ? "bg-brand-50/70 border border-brand-200" : "hover:bg-white"
                                                                                }`}
                                                                            >
                                                                                <div className="flex items-center gap-1.5 truncate">
                                                                                    <span className="font-medium text-text-primary">
                                                                                        {assignee?.displayName || t.primaryAssigneeId}
                                                                                    </span>
                                                                                    {isMyTask && (
                                                                                        <span className="text-[9px] px-1 py-0.2 rounded bg-brand-700 text-white font-bold">
                                                                                            Bạn
                                                                                        </span>
                                                                                    )}
                                                                                </div>

                                                                                <div className="flex items-center gap-1.5 shrink-0">
                                                                                    {t.status === "DONE" ? (
                                                                                        <span className="text-emerald-700 font-semibold">Đã duyệt</span>
                                                                                    ) : t.status === "IN_REVIEW" ? (
                                                                                        <span className="text-amber-700 font-semibold">Chờ duyệt</span>
                                                                                    ) : (
                                                                                        <span className="text-slate-500">Chưa nộp</span>
                                                                                    )}

                                                                                    {/* Quick action for current user */}
                                                                                    {isMyTask &&
                                                                                        (t.status === "TODO" || t.status === "IN_PROGRESS") && (
                                                                                            <button
                                                                                                onClick={() => handleOpenReportModal(t, rule)}
                                                                                                className="text-brand-700 font-bold hover:underline ml-1"
                                                                                            >
                                                                                                Nộp
                                                                                            </button>
                                                                                        )}

                                                                                    <Link
                                                                                        to={`/tasks/${t.id}`}
                                                                                        className="text-text-muted hover:text-brand-700 ml-0.5"
                                                                                        title="Mở chi tiết công việc"
                                                                                    >
                                                                                        <ExternalLink className="w-3 h-3" />
                                                                                    </Link>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}

                {/* MODAL 1: TẠO MẪU ĐỊNH KỲ MỚI (LEADER ONLY) */}
                <ConfirmDialog
                    isOpen={isCreateModalOpen}
                    onClose={() => setIsCreateModalOpen(false)}
                    onConfirm={handleCreateRule}
                    title="Tạo mẫu nhiệm vụ định kỳ mới"
                    confirmText="Lưu và kích hoạt"
                    cancelText="Hủy"
                >
                    <div className="space-y-4 pt-1 text-xs">
                        <div className="space-y-1">
                            <label className="font-bold text-text-secondary">
                                Tên mẫu công việc định kỳ <span className="text-danger">*</span>
                            </label>
                            <input
                                type="text"
                                placeholder="VD: Báo cáo công tác tuần / Báo cáo tài chính quý..."
                                value={createTitle}
                                onChange={(e) => setCreateTitle(e.target.value)}
                                className="w-full h-9 px-3 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="font-bold text-text-secondary">Tần suất phát hành</label>
                                <select
                                    value={createFrequency}
                                    onChange={(e) => setCreateFrequency(e.target.value as "WEEKLY" | "MONTHLY")}
                                    className="w-full h-9 px-2.5 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                                >
                                    <option value="WEEKLY">Hàng tuần (Weekly)</option>
                                    <option value="MONTHLY">Hàng tháng (Monthly)</option>
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="font-bold text-text-secondary">Mức độ ưu tiên</label>
                                <select
                                    value={createPriority}
                                    onChange={(e) => setCreatePriority(e.target.value as TaskPriority)}
                                    className="w-full h-9 px-2.5 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                                >
                                    <option value="LOW">Thấp (LOW)</option>
                                    <option value="NORMAL">Bình thường (NORMAL)</option>
                                    <option value="HIGH">Cao (HIGH)</option>
                                    <option value="URGENT">Khẩn cấp (URGENT)</option>
                                </select>
                            </div>
                        </div>

                        {/* Phân công: Cả phòng hoặc Danh sách chuyên viên cụ thể */}
                        <div className="space-y-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <label className="font-bold text-text-primary block">
                                Đối tượng phân công thực hiện <span className="text-danger">*</span>
                            </label>

                            <div className="flex items-center gap-4">
                                <label className="flex items-center gap-2 cursor-pointer font-medium text-text-primary">
                                    <input
                                        type="radio"
                                        name="createScope"
                                        checked={createScope === "ALL"}
                                        onChange={() => setCreateScope("ALL")}
                                    />
                                    <span>🏢 Giao cho cả phòng ({staffUsers.length} chuyên viên)</span>
                                </label>

                                <label className="flex items-center gap-2 cursor-pointer font-medium text-text-primary">
                                    <input
                                        type="radio"
                                        name="createScope"
                                        checked={createScope === "CUSTOM"}
                                        onChange={() => setCreateScope("CUSTOM")}
                                    />
                                    <span>👥 Chọn nhiều chuyên viên</span>
                                </label>
                            </div>

                            {createScope === "CUSTOM" && (
                                <div className="pt-2 border-t border-slate-200 space-y-1.5">
                                    <span className="text-[11px] text-text-muted block">
                                        Tích chọn các chuyên viên nhận nhiệm vụ này:
                                    </span>
                                    <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto p-1 bg-surface rounded border border-border">
                                        {staffUsers.map((u) => {
                                            const isChecked = createAssigneeIds.includes(u.id);
                                            return (
                                                <label
                                                    key={u.id}
                                                    className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-50 cursor-pointer text-xs"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setCreateAssigneeIds([...createAssigneeIds, u.id]);
                                                            } else {
                                                                setCreateAssigneeIds(
                                                                    createAssigneeIds.filter((id) => id !== u.id),
                                                                );
                                                            }
                                                        }}
                                                    />
                                                    <span className="truncate">{u.displayName}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-1">
                            <label className="font-bold text-text-secondary">
                                Hạn nộp báo cáo (số giờ sau khi phát hành)
                            </label>
                            <input
                                type="number"
                                min={12}
                                max={720}
                                step={12}
                                value={createDueAfterHours}
                                onChange={(e) => setCreateDueAfterHours(Number(e.target.value))}
                                className="w-full h-9 px-3 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                            />
                            <p className="text-[11px] text-text-muted">
                                Ví dụ: 48 giờ tương đương 2 ngày làm việc.
                            </p>
                        </div>

                        <div className="space-y-1">
                            <label className="font-bold text-text-secondary">
                                Mô tả chi tiết và hướng dẫn nộp báo cáo
                            </label>
                            <textarea
                                rows={3}
                                placeholder="Nêu rõ yêu cầu biểu mẫu, nội dung cần tổng hợp và thời gian chốt số liệu..."
                                value={createDescription}
                                onChange={(e) => setCreateDescription(e.target.value)}
                                className="w-full p-2.5 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                            />
                        </div>
                    </div>
                </ConfirmDialog>

                {/* MODAL 2: CHỈNH SỬA MẪU ĐỊNH KỲ (LEADER ONLY) */}
                {editingRule && (
                    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                        <div
                            role="dialog"
                            aria-modal="true"
                            className="bg-surface rounded-card border border-border shadow-xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-5 space-y-4"
                        >
                            <div className="flex items-center justify-between border-b border-border pb-3">
                                <div className="flex items-center gap-2">
                                    <Edit2 className="w-5 h-5 text-brand-700" />
                                    <h3 className="font-bold text-base text-text-primary">
                                        Chỉnh sửa mẫu định kỳ: {editingRule.title}
                                    </h3>
                                </div>
                                <button
                                    onClick={() => setEditingRule(null)}
                                    className="text-text-muted hover:text-text-primary p-1 rounded-md"
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="space-y-4 text-xs">
                                <div className="space-y-1">
                                    <label className="font-bold text-text-secondary">
                                        Tên mẫu công việc định kỳ <span className="text-danger">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={editTitle}
                                        onChange={(e) => setEditTitle(e.target.value)}
                                        className="w-full h-9 px-3 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="font-bold text-text-secondary">Tần suất</label>
                                        <select
                                            value={editFrequency}
                                            onChange={(e) => setEditFrequency(e.target.value as "WEEKLY" | "MONTHLY")}
                                            className="w-full h-9 px-2.5 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                                        >
                                            <option value="WEEKLY">Hàng tuần (Weekly)</option>
                                            <option value="MONTHLY">Hàng tháng (Monthly)</option>
                                        </select>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="font-bold text-text-secondary">Mức độ ưu tiên</label>
                                        <select
                                            value={editPriority}
                                            onChange={(e) => setEditPriority(e.target.value as TaskPriority)}
                                            className="w-full h-9 px-2.5 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                                        >
                                            <option value="LOW">Thấp (LOW)</option>
                                            <option value="NORMAL">Bình thường (NORMAL)</option>
                                            <option value="HIGH">Cao (HIGH)</option>
                                            <option value="URGENT">Khẩn cấp (URGENT)</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Phân công: Cả phòng hoặc Danh sách chuyên viên cụ thể */}
                                <div className="space-y-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                                    <label className="font-bold text-text-primary block">
                                        Đối tượng phân công thực hiện <span className="text-danger">*</span>
                                    </label>

                                    <div className="flex items-center gap-4">
                                        <label className="flex items-center gap-2 cursor-pointer font-medium text-text-primary">
                                            <input
                                                type="radio"
                                                name="editScope"
                                                checked={editScope === "ALL"}
                                                onChange={() => setEditScope("ALL")}
                                            />
                                            <span>🏢 Giao cho cả phòng ({staffUsers.length} chuyên viên)</span>
                                        </label>

                                        <label className="flex items-center gap-2 cursor-pointer font-medium text-text-primary">
                                            <input
                                                type="radio"
                                                name="editScope"
                                                checked={editScope === "CUSTOM"}
                                                onChange={() => setEditScope("CUSTOM")}
                                            />
                                            <span>👥 Chọn nhiều chuyên viên</span>
                                        </label>
                                    </div>

                                    {editScope === "CUSTOM" && (
                                        <div className="pt-2 border-t border-slate-200 space-y-1.5">
                                            <span className="text-[11px] text-text-muted block">
                                                Tích chọn các chuyên viên nhận nhiệm vụ này:
                                            </span>
                                            <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto p-1 bg-surface rounded border border-border">
                                                {staffUsers.map((u) => {
                                                    const isChecked = editAssigneeIds.includes(u.id);
                                                    return (
                                                        <label
                                                            key={u.id}
                                                            className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-50 cursor-pointer text-xs"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={isChecked}
                                                                onChange={(e) => {
                                                                    if (e.target.checked) {
                                                                        setEditAssigneeIds([...editAssigneeIds, u.id]);
                                                                    } else {
                                                                        setEditAssigneeIds(
                                                                            editAssigneeIds.filter((id) => id !== u.id),
                                                                        );
                                                                    }
                                                                }}
                                                            />
                                                            <span className="truncate">{u.displayName}</span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-1">
                                    <label className="font-bold text-text-secondary">
                                        Hạn nộp báo cáo (giờ sau khi sinh)
                                    </label>
                                    <input
                                        type="number"
                                        min={12}
                                        max={720}
                                        step={12}
                                        value={editDueAfterHours}
                                        onChange={(e) => setEditDueAfterHours(Number(e.target.value))}
                                        className="w-full h-9 px-3 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="font-bold text-text-secondary">
                                        Mô tả chi tiết và hướng dẫn
                                    </label>
                                    <textarea
                                        rows={3}
                                        value={editDescription}
                                        onChange={(e) => setEditDescription(e.target.value)}
                                        className="w-full p-2.5 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                                    />
                                </div>

                                <div className="pt-3 flex items-center justify-end gap-2 border-t border-border">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setEditingRule(null)}
                                    >
                                        Hủy
                                    </Button>
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        isLoading={isSavingEdit}
                                        onClick={handleSaveEditRule}
                                    >
                                        Lưu thay đổi
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* MODAL 3: XÁC NHẬN XÓA MẪU ĐỊNH KỲ (LEADER ONLY) */}
                <ConfirmDialog
                    isOpen={Boolean(ruleToDelete)}
                    onClose={() => setRuleToDelete(null)}
                    onConfirm={handleConfirmDeleteRule}
                    title={`Xóa mẫu định kỳ: ${ruleToDelete?.title}?`}
                    description="Các nhiệm vụ của những kỳ trước đã phát hành từ mẫu này vẫn được lưu trữ nguyên vẹn trong hệ thống. Tuy nhiên hệ thống sẽ dừng tự động sinh các kỳ tiếp theo."
                    confirmText="Xác nhận xóa"
                    cancelText="Bỏ qua"
                    variant="danger"
                    isLoading={isDeleting}
                />

                {/* MODAL 4: CHUYÊN VIÊN TRỰC TIẾP NỘP BÁO CÁO ĐỊNH KỲ */}
                {reportingTask && (
                    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                        <div
                            role="dialog"
                            aria-modal="true"
                            className="bg-surface rounded-card border border-border shadow-xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-5 space-y-4"
                        >
                            <div className="flex items-center justify-between border-b border-border pb-3">
                                <div className="flex items-center gap-2 text-brand-700">
                                    <Send className="w-5 h-5" />
                                    <div>
                                        <h3 className="font-bold text-base text-text-primary">
                                            Nộp báo cáo định kỳ
                                        </h3>
                                        <div className="text-xs text-text-muted">
                                            Nhiệm vụ: <span className="font-semibold text-text-secondary">{reportingTask.title}</span> ({reportingTask.code})
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setReportingTask(null)}
                                    className="text-text-muted hover:text-text-primary p-1 rounded-md"
                                >
                                    ✕
                                </button>
                            </div>

                            {reportError && (
                                <div className="p-2.5 rounded bg-red-50 border border-red-200 text-xs text-danger font-medium flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    {reportError}
                                </div>
                            )}

                            <form onSubmit={handleSubmitReport} className="space-y-3.5 text-xs">
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                                    <span className="font-bold text-text-secondary block">
                                        Hướng dẫn nộp từ Lãnh đạo:
                                    </span>
                                    <p className="text-text-secondary leading-relaxed">
                                        {reportingRule?.description || "Thực hiện tổng hợp số liệu và báo cáo theo mẫu."}
                                    </p>
                                </div>

                                <div>
                                    <label className="block font-bold text-text-secondary mb-1">
                                        Tóm tắt kết quả công việc đã thực hiện <span className="text-danger">*</span>
                                    </label>
                                    <textarea
                                        rows={3}
                                        required
                                        placeholder="Ví dụ: Đã hoàn thành tổng hợp số liệu tuần 44, các nhiệm vụ đạt tiến độ 100%, không phát sinh vướng mắc..."
                                        value={reportSummary}
                                        onChange={(e) => setReportSummary(e.target.value)}
                                        className="w-full p-2.5 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="block font-bold text-text-secondary mb-1">
                                        Nội dung chi tiết / Số liệu bổ sung (nếu có)
                                    </label>
                                    <textarea
                                        rows={3}
                                        placeholder="Nêu chi tiết kết quả từng đầu mục, giải pháp khắc phục khó khăn..."
                                        value={reportDetails}
                                        onChange={(e) => setReportDetails(e.target.value)}
                                        className="w-full p-2.5 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="block font-bold text-text-secondary mb-1">
                                        Đường dẫn tệp tài liệu / Báo cáo kết quả (Drive, URL...)
                                    </label>
                                    <input
                                        type="url"
                                        placeholder="https://drive.google.com/... hoặc link sản phẩm bàn giao"
                                        value={reportDeliverableUrl}
                                        onChange={(e) => setReportDeliverableUrl(e.target.value)}
                                        className="w-full h-9 px-3 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="block font-bold text-text-secondary mb-1">
                                        Ghi chú gửi Lãnh đạo duyệt
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Ý kiến đề xuất hoặc lưu ý cho Lãnh đạo phòng..."
                                        value={reportNotes}
                                        onChange={(e) => setReportNotes(e.target.value)}
                                        className="w-full h-9 px-3 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                                    />
                                </div>

                                <div className="pt-3 flex items-center justify-end gap-2 border-t border-border">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setReportingTask(null)}
                                    >
                                        Hủy
                                    </Button>
                                    <Button
                                        type="submit"
                                        variant="primary"
                                        size="sm"
                                        isLoading={isSubmittingReport}
                                        className="gap-1.5 shadow-sm"
                                    >
                                        <Send className="w-3.5 h-3.5" /> Gửi báo cáo cho Lãnh đạo duyệt
                                    </Button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* MODAL 5: XEM CHI TIẾT BÁO CÁO ĐÃ NỘP */}
                {viewingTask && viewingSubmission && (
                    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                        <div
                            role="dialog"
                            aria-modal="true"
                            className="bg-surface rounded-card border border-border shadow-xl max-w-lg w-full p-5 space-y-4"
                        >
                            <div className="flex items-center justify-between border-b border-border pb-3">
                                <div className="flex items-center gap-2 text-emerald-700">
                                    <FileCheck className="w-5 h-5" />
                                    <div>
                                        <h3 className="font-bold text-base text-text-primary">
                                            Báo cáo đã gửi Lãnh đạo
                                        </h3>
                                        <div className="text-xs text-text-muted">
                                            {viewingTask.title} ({viewingTask.code})
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        setViewingTask(null);
                                        setViewingSubmission(null);
                                    }}
                                    className="text-text-muted hover:text-text-primary p-1 rounded-md"
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="space-y-3 text-xs">
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                                    <div className="flex items-center justify-between text-[11px] text-text-muted">
                                        <span>Thời điểm nộp:</span>
                                        <span className="font-semibold text-text-primary">
                                            {formatDateTimeVN(viewingSubmission.submittedAt)}
                                        </span>
                                    </div>

                                    <div>
                                        <span className="font-bold text-text-secondary block">
                                            Tóm tắt kết quả:
                                        </span>
                                        <p className="text-text-primary font-medium mt-0.5 whitespace-pre-wrap">
                                            {viewingSubmission.summary}
                                        </p>
                                    </div>

                                    {viewingSubmission.details && (
                                        <div>
                                            <span className="font-bold text-text-secondary block">
                                                Nội dung chi tiết:
                                            </span>
                                            <p className="text-text-secondary mt-0.5 whitespace-pre-wrap">
                                                {viewingSubmission.details}
                                            </p>
                                        </div>
                                    )}

                                    {viewingSubmission.deliverableUrl && (
                                        <div>
                                            <span className="font-bold text-text-secondary block">
                                                Liên kết sản phẩm:
                                            </span>
                                            <a
                                                href={viewingSubmission.deliverableUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-brand-700 hover:underline flex items-center gap-1 mt-0.5 font-medium"
                                            >
                                                {viewingSubmission.deliverableUrl} <ExternalLink className="w-3 h-3" />
                                            </a>
                                        </div>
                                    )}

                                    {viewingSubmission.notes && (
                                        <div>
                                            <span className="font-bold text-text-secondary block">
                                                Ghi chú:
                                            </span>
                                            <p className="text-text-muted mt-0.5">
                                                {viewingSubmission.notes}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center justify-between pt-2 border-t border-border">
                                    <Link
                                        to={`/tasks/${viewingTask.id}`}
                                        className="text-brand-700 hover:underline flex items-center gap-1 font-medium"
                                    >
                                        Xem chi tiết nhiệm vụ đầy đủ <ExternalLink className="w-3.5 h-3.5" />
                                    </Link>

                                    <Button
                                        variant="primary"
                                        size="sm"
                                        onClick={() => {
                                            setViewingTask(null);
                                            setViewingSubmission(null);
                                        }}
                                    >
                                        Đóng
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AppShell>
    );
}
