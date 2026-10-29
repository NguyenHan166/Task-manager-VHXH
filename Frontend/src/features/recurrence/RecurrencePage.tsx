import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { useSession } from "../auth/SessionContext";
import { workspaceRepository } from "../../shared/repository";
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
    Button,
    ConfirmDialog,
    useToast,
} from "../../components/ui";
import { formatDateTimeVN } from "../../shared/datetime";
import { RecurrenceOverview } from "./RecurrenceOverview";
import {
    Edit2,
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
                workspaceRepository.getRecurrenceRules(),
                workspaceRepository.getRecurrenceInstances(),
                workspaceRepository.getTasks(),
                workspaceRepository.getSubmissions(),
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
        const unsub = workspaceRepository.subscribe(loadData);
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
            await workspaceRepository.toggleRecurrenceRule(rule.id, !rule.active);
            showToast(
                rule.active
                    ? `Đã tạm dừng lịch "${rule.title}"`
                    : `Đã áp dụng lại lịch "${rule.title}"`,
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
            const res = await workspaceRepository.generateRecurrenceNext(
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
            showToast("Vui lòng nhập tên nhiệm vụ định kỳ", "error");
            return;
        }

        try {
            const now = new Date();
            const nextRun = new Date(now);
            if (createFrequency === "WEEKLY") nextRun.setDate(nextRun.getDate() + 7);
            else nextRun.setMonth(nextRun.getMonth() + 1);

            const assignees =
                createScope === "ALL"
                    ? []
                    : createAssigneeIds.length > 0
                    ? createAssigneeIds
                    : [staffUsers[0]?.id || currentUser.id];

            await workspaceRepository.createRecurrenceRule({
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

            showToast("Đã tạo lịch giao việc định kỳ", "success");
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
            showToast("Vui lòng nhập tên nhiệm vụ định kỳ", "error");
            return;
        }

        setIsSavingEdit(true);
        try {
            const assignees =
                editScope === "ALL"
                    ? []
                    : editAssigneeIds.length > 0
                    ? editAssigneeIds
                    : [staffUsers[0]?.id || currentUser.id];

            await workspaceRepository.updateRecurrenceRule(editingRule.id, {
                title: editTitle.trim(),
                description: editDescription.trim(),
                scope: editScope,
                assigneeIds: assignees,
                primaryAssigneeId: assignees[0] || currentUser.id,
                priority: editPriority,
                frequency: editFrequency,
                dueAfterHours: Number(editDueAfterHours) || 48,
            });

            showToast(`Đã cập nhật lịch "${editTitle.trim()}"`, "success");
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
            await workspaceRepository.deleteRecurrenceRule(ruleToDelete.id);
            showToast(`Đã xóa lịch "${ruleToDelete.title}"`, "success");
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
            if (reportingTask.status === "TODO") {
                const started = await workspaceRepository.startTask(reportingTask.id, currentUser.id);
                setReportingTask(started);
            }
            await workspaceRepository.submitRecurrenceReport(
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
                `Đã nộp báo cáo. Kết quả đang chờ lãnh đạo phê duyệt.`,
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

    return (
        <AppShell>
            <div className="space-y-6">
                <Breadcrumb
                    items={[
                        { label: "Tổng quan", href: "/dashboard" },
                        { label: "Nhiệm vụ định kỳ" },
                    ]}
                />

                <RecurrenceOverview
                    currentUserId={currentUser?.id}
                    isLeader={isLeader}
                    isLoading={isLoading}
                    users={users}
                    rules={rules}
                    visibleRules={visibleRules}
                    instances={instances}
                    tasks={tasks}
                    submissions={submissions}
                    filterTab={filterTab}
                    onFilterChange={setFilterTab}
                    onCreate={handleOpenCreateModal}
                    onEdit={handleOpenEditModal}
                    onToggle={(rule) => void handleToggleActive(rule)}
                    onDelete={setRuleToDelete}
                    onGenerate={(rule) => void handleGenerateNext(rule)}
                    generatingRuleId={isGenerating}
                    onReport={handleOpenReportModal}
                    onViewReport={handleViewSubmission}
                />
                {/* MODAL 1: TẠO MẪU ĐỊNH KỲ MỚI (LEADER ONLY) */}
                <ConfirmDialog
                    isOpen={isCreateModalOpen}
                    onClose={() => setIsCreateModalOpen(false)}
                    onConfirm={handleCreateRule}
                    title="Tạo lịch giao việc định kỳ"
                    confirmText="Tạo lịch"
                    cancelText="Hủy"
                >
                    <div className="space-y-4 pt-1 text-xs">
                        <div className="space-y-1">
                            <label className="font-bold text-text-secondary">
                                Tên nhiệm vụ định kỳ <span className="text-danger">*</span>
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
                                <label className="font-bold text-text-secondary">Lặp lại</label>
                                <select
                                    value={createFrequency}
                                    onChange={(e) => setCreateFrequency(e.target.value as "WEEKLY" | "MONTHLY")}
                                    className="w-full h-9 px-2.5 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                                >
                                    <option value="WEEKLY">Hằng tuần</option>
                                    <option value="MONTHLY">Hằng tháng</option>
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="font-bold text-text-secondary">Mức độ ưu tiên</label>
                                <select
                                    value={createPriority}
                                    onChange={(e) => setCreatePriority(e.target.value as TaskPriority)}
                                    className="w-full h-9 px-2.5 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                                >
                                    <option value="LOW">Thấp</option>
                                    <option value="NORMAL">Bình thường</option>
                                    <option value="HIGH">Cao</option>
                                    <option value="URGENT">Khẩn cấp</option>
                                </select>
                            </div>
                        </div>

                        <p className="rounded-lg bg-slate-50 px-3 py-2 text-text-secondary">
                            Hệ thống sẽ giao kỳ đầu sau {createFrequency === "WEEKLY" ? "một tuần" : "một tháng"} và tự giao các kỳ tiếp theo. Nếu cần giao ngay, hãy tạo lịch rồi bấm “Giao kỳ tiếp theo ngay”.
                        </p>

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
                                Hạn nộp sau khi giao (giờ)
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
                                Ví dụ: 48 giờ tương đương 2 ngày.
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
                                        Sửa lịch giao việc: {editingRule.title}
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
                                        Tên nhiệm vụ định kỳ <span className="text-danger">*</span>
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
                                            <option value="WEEKLY">Hằng tuần</option>
                                            <option value="MONTHLY">Hằng tháng</option>
                                        </select>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="font-bold text-text-secondary">Mức độ ưu tiên</label>
                                        <select
                                            value={editPriority}
                                            onChange={(e) => setEditPriority(e.target.value as TaskPriority)}
                                            className="w-full h-9 px-2.5 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                                        >
                                            <option value="LOW">Thấp</option>
                                            <option value="NORMAL">Bình thường</option>
                                            <option value="HIGH">Cao</option>
                                            <option value="URGENT">Khẩn cấp</option>
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
                                        Hạn nộp sau khi giao (giờ)
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
                    title={`Xóa lịch giao việc: ${ruleToDelete?.title}?`}
                    description="Các nhiệm vụ đã giao vẫn được lưu. Hệ thống sẽ ngừng giao những kỳ sau theo lịch này."
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
