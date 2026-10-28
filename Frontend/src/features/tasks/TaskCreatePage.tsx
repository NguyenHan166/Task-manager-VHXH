import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { useSession } from "../auth/SessionContext";
import { workspaceRepository } from "../../shared/repository";
import {
    PageHeader,
    Breadcrumb,
    Button,
    Card,
    CardContent,
    Input,
    Textarea,
    Select,
    useToast,
    ConfirmDialog,
    UserAvatar,
} from "../../components/ui";
import { formatDateTimeVN } from "../../shared/datetime";
import type {
    TaskPriority,
    TaskType,
    Project,
} from "../../shared/data-contract";
import {
    PlusCircle,
    ArrowLeft,
    Shield,
    Users,
    User,
    AlertCircle,
    Save,
} from "lucide-react";

export function TaskCreatePage() {
    const { currentUser, isManager, isLeader, users } = useSession();
    const { showToast } = useToast();
    const navigate = useNavigate();

    // Form states
    const [type, setType] = useState<TaskType>(isLeader ? "OFFICIAL" : "TEAM");
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [deliverable, setDeliverable] = useState(
        isLeader
            ? "Nộp báo cáo hoặc tài liệu kết quả để Lãnh đạo phòng duyệt."
            : "Cập nhật kết quả thực hiện.",
    );
    const [priority, setPriority] = useState<TaskPriority>("NORMAL");
    const [primaryAssigneeId, setPrimaryAssigneeId] = useState<string>(
        currentUser?.id || "u01",
    );
    const [collaboratorIds, setCollaboratorIds] = useState<string[]>([]);
    const [watcherIds, setWatcherIds] = useState<string[]>([]);
    const [projectId, setProjectId] = useState<string>("");
    const [dueType, setDueType] = useState<"preset" | "custom">("preset");
    const [dueHours, setDueHours] = useState("48");
    const [customDueAt, setCustomDueAt] = useState(() => {
        const d = new Date(Date.now() + 48 * 3_600_000);
        return d.toISOString().slice(0, 16);
    });

    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Summary confirmation modal before publishing
    const [showConfirmModal, setShowConfirmModal] = useState(false);

    useEffect(() => {
        workspaceRepository.getProjects().then(setProjects);
    }, []);

    const calculateDueAt = (): string => {
        if (dueType === "custom" && customDueAt) {
            return new Date(customDueAt).toISOString();
        }
        const hours = parseInt(dueHours, 10) || 48;
        return new Date(Date.now() + hours * 3_600_000).toISOString();
    };

    const toggleCollaborator = (userId: string) => {
        setCollaboratorIds((prev) =>
            prev.includes(userId)
                ? prev.filter((id) => id !== userId)
                : [...prev, userId],
        );
    };

    const toggleWatcher = (userId: string) => {
        setWatcherIds((prev) =>
            prev.includes(userId)
                ? prev.filter((id) => id !== userId)
                : [...prev, userId],
        );
    };

    // Save handler for both Draft and Immediate Publish
    const handleSave = async (isDraft: boolean) => {
        if (!currentUser) return;

        if (!isDraft) {
            // Strict validation for publish
            if (!title.trim()) {
                setError("Vui lòng nhập tiêu đề công việc.");
                return;
            }
            if (!primaryAssigneeId) {
                setError("Bắt buộc phải chỉ định một người chủ trì công việc.");
                return;
            }
            const dueIso = calculateDueAt();
            if (!dueIso || isNaN(new Date(dueIso).getTime())) {
                setError("Vui lòng chọn thời hạn hoàn thành hợp lệ.");
                return;
            }
            if (new Date(dueIso).getTime() <= Date.now()) {
                setError("Thời hạn hoàn thành phải ở tương lai.");
                return;
            }
        }

        setIsLoading(true);
        setError(null);
        try {
            const dueAt = calculateDueAt();

            const created = await workspaceRepository.createTask(
                {
                    type,
                    title:
                        title.trim() ||
                        (isDraft ? "(Bản nháp chưa đặt tên)" : ""),
                    description: description.trim(),
                    deliverable: deliverable.trim(),
                    priority,
                    primaryAssigneeId: primaryAssigneeId || null,
                    collaboratorIds: collaboratorIds.filter(
                        (id) => id !== primaryAssigneeId,
                    ),
                    watcherIds: watcherIds.filter(
                        (id) =>
                            id !== primaryAssigneeId &&
                            !collaboratorIds.includes(id),
                    ),
                    dueAt: dueAt || null,
                    projectId: projectId || null,
                    parentTaskId: null,
                    isDraft,
                },
                currentUser.id,
            );

            if (isDraft) {
                showToast(`Đã lưu bản nháp công việc: ${created.code}`, "info");
            } else {
                showToast(
                    `Đã phát hành và giao việc thành công: ${created.code}`,
                    "success",
                );
            }

            setShowConfirmModal(false);
            navigate(`/tasks/${created.id}`);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Đã xảy ra lỗi khi tạo công việc",
            );
        } finally {
            setIsLoading(false);
        }
    };

    const handlePreparePublish = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!title.trim()) {
            setError("Vui lòng nhập tiêu đề công việc trước khi giao việc.");
            return;
        }
        if (!primaryAssigneeId) {
            setError(
                "Bắt buộc phải chỉ định một người chủ trì trước khi giao việc.",
            );
            return;
        }
        const dueIso = calculateDueAt();
        if (new Date(dueIso).getTime() <= Date.now()) {
            setError("Thời hạn hoàn thành phải ở tương lai.");
            return;
        }

        // Open confirmation summary
        setShowConfirmModal(true);
    };

    const assignedUser = users.find((u) => u.id === primaryAssigneeId);
    const selectedProject = projects.find((p) => p.id === projectId);
    const selectedCollabUsers = users.filter((u) =>
        collaboratorIds.includes(u.id),
    );

    return (
        <AppShell>
            <div className="space-y-6 max-w-4xl mx-auto">
                <Breadcrumb
                    items={[
                        { label: "Công việc", href: "/tasks" },
                        { label: isLeader ? "Giao việc mới" : "Tạo việc mới" },
                    ]}
                />

                <PageHeader
                    title={
                        isManager
                            ? "Giao nhiệm vụ chính thức (Manager)"
                            : "Tạo công việc nhóm / cá nhân"
                    }
                    subtitle="Điền đầy đủ thông tin hoặc lưu bản nháp để bổ sung sau."
                    actions={
                        <Link to="/tasks">
                            <Button
                                variant="outline"
                                size="sm"
                                className="gap-1.5"
                            >
                                <ArrowLeft className="w-4 h-4" /> Quay lại danh
                                sách
                            </Button>
                        </Link>
                    }
                />

                <Card>
                    <CardContent className="p-6">
                        <form
                            onSubmit={handlePreparePublish}
                            className="space-y-6"
                        >
                            {error && (
                                <div className="p-3.5 bg-red-50 border border-red-200 text-danger text-xs rounded-btn flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    <span>{error}</span>
                                </div>
                            )}

                            {/* Task Type selector */}
                            <div className="space-y-2">
                                <label className="block text-xs font-semibold text-text-primary">
                                    Loại nhiệm vụ{" "}
                                    <span className="text-danger">*</span>
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    {/* OFFICIAL */}
                                    <div
                                        onClick={() => {
                                            if (isLeader) setType("OFFICIAL");
                                        }}
                                        role="button"
                                        tabIndex={isLeader ? 0 : -1}
                                        className={`p-3.5 rounded-btn border text-left transition-all ${
                                            type === "OFFICIAL"
                                                ? "border-brand-700 bg-brand-50 text-brand-800 ring-1 ring-brand-700"
                                                : "border-border hover:bg-slate-50 text-text-primary"
                                        } ${!isLeader ? "opacity-40 cursor-not-allowed bg-slate-100" : "cursor-pointer"}`}
                                    >
                                        <div className="flex items-center gap-1.5 font-bold text-xs">
                                            <Shield className="w-3.5 h-3.5 text-brand-700" />
                                            Chính thức (OFFICIAL)
                                        </div>
                                        <div className="text-[11px] text-text-muted mt-1 leading-tight">
                                            {isManager
                                                ? "Giao việc có tính KPI, bắt buộc nộp duyệt kết quả."
                                                : "Chỉ Lãnh đạo phòng (Trưởng/Phó phòng) mới có quyền tạo."}
                                        </div>
                                    </div>

                                    {/* TEAM */}
                                    <div
                                        onClick={() => setType("TEAM")}
                                        role="button"
                                        tabIndex={0}
                                        className={`p-3.5 rounded-btn border text-left transition-all cursor-pointer ${
                                            type === "TEAM"
                                                ? "border-purple-600 bg-purple-50 text-purple-900 ring-1 ring-purple-600"
                                                : "border-border hover:bg-slate-50 text-text-primary"
                                        }`}
                                    >
                                        <div className="flex items-center gap-1.5 font-bold text-xs text-purple-800">
                                            <Users className="w-3.5 h-3.5" />
                                            Cộng tác nhóm (TEAM)
                                        </div>
                                        <div className="text-[11px] text-text-muted mt-1 leading-tight">
                                            Cộng tác nội bộ, thành viên được mời
                                            có quyền từ chối.
                                        </div>
                                    </div>

                                    {/* PERSONAL */}
                                    <div
                                        onClick={() => setType("PERSONAL")}
                                        role="button"
                                        tabIndex={0}
                                        className={`p-3.5 rounded-btn border text-left transition-all cursor-pointer ${
                                            type === "PERSONAL"
                                                ? "border-slate-600 bg-slate-100 text-slate-900 ring-1 ring-slate-600"
                                                : "border-border hover:bg-slate-50 text-text-primary"
                                        }`}
                                    >
                                        <div className="flex items-center gap-1.5 font-bold text-xs text-slate-700">
                                            <User className="w-3.5 h-3.5" />
                                            Cá nhân (PERSONAL)
                                        </div>
                                        <div className="text-[11px] text-text-muted mt-1 leading-tight">
                                            Riêng tư, người khác và Trưởng phòng
                                            không thấy.
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Title */}
                            <Input
                                label="Tiêu đề công việc"
                                placeholder="Nhập tên nhiệm vụ cụ thể..."
                                required
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                            />

                            {/* Assignee & Priority */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Select
                                    label="Người chủ trì chính"
                                    required
                                    value={primaryAssigneeId}
                                    onChange={(e) =>
                                        setPrimaryAssigneeId(e.target.value)
                                    }
                                >
                                    <option value="">
                                        -- Chọn người chủ trì --
                                    </option>
                                    {users.map((u) => (
                                        <option key={u.id} value={u.id}>
                                            {u.displayName} ({u.jobTitle} -{" "}
                                            {u.role === "MANAGER"
                                                ? "Trưởng phòng"
                                                : "Chuyên viên"}
                                            )
                                        </option>
                                    ))}
                                </Select>

                                <Select
                                    label="Mức độ ưu tiên"
                                    required
                                    value={priority}
                                    onChange={(e) =>
                                        setPriority(
                                            e.target.value as TaskPriority,
                                        )
                                    }
                                >
                                    <option value="LOW">Thấp (Low)</option>
                                    <option value="NORMAL">
                                        Bình thường (Normal)
                                    </option>
                                    <option value="HIGH">Cao (High)</option>
                                    <option value="URGENT">
                                        Khẩn cấp (Urgent)
                                    </option>
                                </Select>
                            </div>

                            {/* Project & Due date */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Select
                                    label="Dự án liên kết (Tùy chọn)"
                                    value={projectId}
                                    onChange={(e) =>
                                        setProjectId(e.target.value)
                                    }
                                >
                                    <option value="">
                                        -- Không thuộc dự án cụ thể --
                                    </option>
                                    {projects.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.name}
                                        </option>
                                    ))}
                                </Select>

                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-semibold text-text-primary">
                                            Thời hạn hoàn thành{" "}
                                            <span className="text-danger">
                                                *
                                            </span>
                                        </label>
                                        <div className="flex items-center gap-2 text-[11px] text-brand-700">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setDueType("preset")
                                                }
                                                className={`hover:underline ${dueType === "preset" ? "font-bold text-brand-800" : "text-text-muted"}`}
                                            >
                                                Khoảng thời gian
                                            </button>
                                            <span>|</span>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setDueType("custom")
                                                }
                                                className={`hover:underline ${dueType === "custom" ? "font-bold text-brand-800" : "text-text-muted"}`}
                                            >
                                                Chọn ngày giờ
                                            </button>
                                        </div>
                                    </div>

                                    {dueType === "preset" ? (
                                        <Select
                                            value={dueHours}
                                            onChange={(e) =>
                                                setDueHours(e.target.value)
                                            }
                                        >
                                            <option value="8">
                                                Trong ngày hôm nay (8 giờ nữa)
                                            </option>
                                            <option value="24">
                                                Ngày mai (24 giờ nữa)
                                            </option>
                                            <option value="48">
                                                2 ngày tới (48 giờ nữa)
                                            </option>
                                            <option value="72">
                                                3 ngày tới (72 giờ nữa)
                                            </option>
                                            <option value="120">
                                                5 ngày tới (120 giờ nữa)
                                            </option>
                                            <option value="168">
                                                1 tuần tới (168 giờ nữa)
                                            </option>
                                        </Select>
                                    ) : (
                                        <Input
                                            type="datetime-local"
                                            value={customDueAt}
                                            onChange={(e) =>
                                                setCustomDueAt(e.target.value)
                                            }
                                            required
                                        />
                                    )}
                                </div>
                            </div>

                            {/* Multi Collaborators Selection */}
                            {type !== "PERSONAL" && (
                                <div className="space-y-2">
                                    <label className="block text-xs font-semibold text-text-primary">
                                        Người phối hợp thực hiện (
                                        {collaboratorIds.length} người đã chọn)
                                    </label>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 border border-border p-3 rounded-card bg-slate-50/50 max-h-40 overflow-y-auto">
                                        {users
                                            .filter(
                                                (u) =>
                                                    u.id !== primaryAssigneeId,
                                            )
                                            .map((u) => {
                                                const isSelected =
                                                    collaboratorIds.includes(
                                                        u.id,
                                                    );
                                                return (
                                                    <div
                                                        key={u.id}
                                                        onClick={() =>
                                                            toggleCollaborator(
                                                                u.id,
                                                            )
                                                        }
                                                        role="button"
                                                        tabIndex={0}
                                                        className={`flex items-center gap-2 p-2 rounded-btn text-xs border transition-all cursor-pointer ${
                                                            isSelected
                                                                ? "bg-purple-50 border-purple-300 text-purple-900 font-medium"
                                                                : "bg-white border-border text-text-secondary hover:bg-slate-100"
                                                        }`}
                                                    >
                                                        <UserAvatar
                                                            name={u.displayName}
                                                            size="sm"
                                                        />
                                                        <div className="truncate">
                                                            <div>
                                                                {u.displayName}
                                                            </div>
                                                            <div className="text-[10px] text-text-muted">
                                                                {u.jobTitle}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                </div>
                            )}

                            {/* Multi Watchers Selection */}
                            {type !== "PERSONAL" && (
                                <div className="space-y-2">
                                    <label className="block text-xs font-semibold text-text-primary">
                                        Người theo dõi giám sát (
                                        {watcherIds.length} người đã chọn)
                                    </label>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 border border-border p-3 rounded-card bg-slate-50/50 max-h-40 overflow-y-auto">
                                        {users
                                            .filter(
                                                (u) =>
                                                    u.id !==
                                                        primaryAssigneeId &&
                                                    !collaboratorIds.includes(
                                                        u.id,
                                                    ),
                                            )
                                            .map((u) => {
                                                const isSelected =
                                                    watcherIds.includes(u.id);
                                                return (
                                                    <div
                                                        key={u.id}
                                                        onClick={() =>
                                                            toggleWatcher(u.id)
                                                        }
                                                        role="button"
                                                        tabIndex={0}
                                                        className={`flex items-center gap-2 p-2 rounded-btn text-xs border transition-all cursor-pointer ${
                                                            isSelected
                                                                ? "bg-amber-50 border-amber-300 text-amber-900 font-medium"
                                                                : "bg-white border-border text-text-secondary hover:bg-slate-100"
                                                        }`}
                                                    >
                                                        <UserAvatar
                                                            name={u.displayName}
                                                            size="sm"
                                                        />
                                                        <div className="truncate">
                                                            <div>
                                                                {u.displayName}
                                                            </div>
                                                            <div className="text-[10px] text-text-muted">
                                                                {u.jobTitle}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                </div>
                            )}

                            {/* Deliverable */}
                            <Input
                                label="Sản phẩm / Kết quả cần bàn giao"
                                placeholder="Ví dụ: Báo cáo số liệu tháng hoặc tệp thuyết minh kèm theo..."
                                value={deliverable}
                                onChange={(e) => setDeliverable(e.target.value)}
                            />

                            {/* Description */}
                            <Textarea
                                label="Nội dung mô tả chi tiết"
                                placeholder="Ghi chú thêm về yêu cầu thực hiện, căn cứ pháp lý hoặc văn bản liên quan..."
                                rows={4}
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                            />

                            {/* Form Action buttons */}
                            <div className="pt-5 flex items-center justify-between border-t border-border flex-wrap gap-3">
                                <Link to="/tasks">
                                    <Button variant="outline" size="md">
                                        Hủy bỏ
                                    </Button>
                                </Link>

                                <div className="flex items-center gap-3">
                                    {/* Save Draft Button */}
                                    <Button
                                        variant="outline"
                                        size="md"
                                        type="button"
                                        onClick={() => handleSave(true)}
                                        isLoading={isLoading}
                                        className="gap-2 text-text-secondary hover:text-text-primary"
                                    >
                                        <Save className="w-4 h-4 text-text-muted" />
                                        Lưu bản nháp (DRAFT)
                                    </Button>

                                    {/* Immediate Publish / Assign Button */}
                                    <Button
                                        variant="primary"
                                        size="md"
                                        type="submit"
                                        isLoading={isLoading}
                                        className="gap-2 bg-brand-700 hover:bg-brand-800 text-white"
                                    >
                                        <PlusCircle className="w-4 h-4" />
                                        {isManager
                                            ? "Phát hành & Giao việc ngay"
                                            : "Tạo công việc"}
                                    </Button>
                                </div>
                            </div>
                        </form>
                    </CardContent>
                </Card>

                {/* Summary Confirmation Dialog before Publishing */}
                <ConfirmDialog
                    isOpen={showConfirmModal}
                    title="Xác nhận phát hành và giao nhiệm vụ"
                    description="Vui lòng kiểm tra lại thông tin người nhận và thời hạn trước khi chính thức phát hành công việc."
                    confirmText="Xác nhận giao việc"
                    cancelText="Xem lại"
                    variant="primary"
                    isLoading={isLoading}
                    onCancel={() => setShowConfirmModal(false)}
                    onConfirm={() => handleSave(false)}
                >
                    <div className="space-y-3 py-2 text-xs">
                        <div className="p-3 bg-slate-50 rounded border border-border space-y-2">
                            <div className="flex justify-between">
                                <span className="text-text-muted">
                                    Tiêu đề:
                                </span>
                                <span className="font-semibold text-text-primary max-w-xs text-right truncate">
                                    {title}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-text-muted">
                                    Người XLC:
                                </span>
                                <span className="font-semibold text-brand-800 flex items-center gap-1.5">
                                    <UserAvatar
                                        name={assignedUser?.displayName || "—"}
                                        size="sm"
                                    />
                                    {assignedUser?.displayName} (
                                    {assignedUser?.jobTitle})
                                </span>
                            </div>
                            {selectedCollabUsers.length > 0 && (
                                <div className="flex justify-between">
                                    <span className="text-text-muted">
                                        Người phối hợp:
                                    </span>
                                    <span className="text-text-primary font-medium">
                                        {selectedCollabUsers
                                            .map((u) => u.displayName)
                                            .join(", ")}
                                    </span>
                                </div>
                            )}
                            {selectedProject && (
                                <div className="flex justify-between">
                                    <span className="text-text-muted">
                                        Dự án:
                                    </span>
                                    <span className="text-text-primary font-medium">
                                        {selectedProject.name}
                                    </span>
                                </div>
                            )}
                            <div className="flex justify-between">
                                <span className="text-text-muted">
                                    Hạn hoàn thành:
                                </span>
                                <span className="font-bold text-amber-800">
                                    {formatDateTimeVN(calculateDueAt())}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-text-muted">
                                    Đầu ra yêu cầu:
                                </span>
                                <span className="text-text-primary italic truncate max-w-xs">
                                    {deliverable || "—"}
                                </span>
                            </div>
                        </div>

                        <p className="text-[11px] text-text-muted leading-relaxed">
                            * Sau khi bấm <strong>Xác nhận giao việc</strong>,
                            trạng thái công việc sẽ chuyển sang{" "}
                            <code>TODO</code>, người chủ trì và người phối hợp
                            sẽ nhận được thông báo giao nhiệm vụ mới.
                        </p>
                    </div>
                </ConfirmDialog>
            </div>
        </AppShell>
    );
}
