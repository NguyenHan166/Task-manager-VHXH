import { useState, useMemo, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSession } from "../auth/SessionContext";
import { mockRepository } from "../../mocks/mock-repository";
import type {
    Task,
    Project,
    TaskParticipant,
    TaskDeadlineRequest,
} from "../../shared/data-contract";
import {
    getManagerDashboardStats,
    getUserWorkloadStats,
    getPriorityBreakdown,
    getManagerUrgentTasks,
    isTaskOverdue,
} from "../tasks/task-selectors";
import {
    StatCard,
    StatusBadge,
    PriorityBadge,
    OverdueBadge,
    BlockedBadge,
    UserAvatar,
    Button,
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    DonutChart,
    SkeletonCard,
    ConfirmDialog,
    useToast,
} from "../../components/ui";
import { formatDateTimeVN } from "../../shared/datetime";
import {
    FolderKanban,
    Clock,
    Layers,
    FileText,
    CheckCircle2,
    AlertTriangle,
    PlusCircle,
    Eye,
    Calendar,
    AlertOctagon,
    ArrowRight,
    Filter,
    X,
    HelpCircle,
    ShieldCheck,
} from "lucide-react";

export function ManagerDashboard() {
    const { currentUser, users } = useSession();
    const { showToast } = useToast();
    const navigate = useNavigate();

    const [tasks, setTasks] = useState<Task[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [participants, setParticipants] = useState<TaskParticipant[]>([]);
    const [deadlineRequests, setDeadlineRequests] = useState<
        TaskDeadlineRequest[]
    >([]);
    const [isLoading, setIsLoading] = useState(true);

    // Filters state
    const [filterProjectId, setFilterProjectId] = useState<string>("ALL");
    const [filterAssigneeId, setFilterAssigneeId] = useState<string>("ALL");
    const [filterPriority, setFilterPriority] = useState<string>("ALL");
    const [filterTimeRange, setFilterTimeRange] = useState<string>("ALL");

    // Deadline decision dialog state
    const [activeReq, setActiveReq] = useState<TaskDeadlineRequest | null>(
        null,
    );
    const [reqDecision, setReqDecision] = useState<"APPROVED" | "REJECTED">(
        "APPROVED",
    );
    const [isDecidingReq, setIsDecidingReq] = useState(false);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [allTasks, allProjects, allParticipants, allRequests] =
                await Promise.all([
                    mockRepository.getTasks(),
                    mockRepository.getProjects(),
                    mockRepository.getParticipants(),
                    mockRepository.getDeadlineRequests(),
                ]);
            setTasks(allTasks);
            setProjects(allProjects);
            setParticipants(allParticipants);
            setDeadlineRequests(allRequests);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        const unsub = mockRepository.subscribe(loadData);
        return unsub;
    }, []);

    // Filter tasks synchronously
    const filteredTasks = useMemo(() => {
        const now = new Date();
        return tasks.filter((t) => {
            // Manager dashboard KPI only considers OFFICIAL tasks
            if (t.type !== "OFFICIAL") return false;

            if (filterProjectId !== "ALL" && t.projectId !== filterProjectId) {
                return false;
            }
            if (
                filterAssigneeId !== "ALL" &&
                t.primaryAssigneeId !== filterAssigneeId
            ) {
                return false;
            }
            if (filterPriority !== "ALL" && t.priority !== filterPriority) {
                return false;
            }
            if (filterTimeRange === "OVERDUE" && !isTaskOverdue(t, now)) {
                return false;
            }
            if (filterTimeRange === "THIS_WEEK") {
                if (!t.dueAt) return false;
                const dueTime = new Date(t.dueAt).getTime();
                const nextWeek = now.getTime() + 7 * 86_400_000;
                if (dueTime < now.getTime() - 86_400_000 || dueTime > nextWeek)
                    return false;
            }
            return true;
        });
    }, [
        tasks,
        filterProjectId,
        filterAssigneeId,
        filterPriority,
        filterTimeRange,
    ]);

    // Derived metrics from selectors
    const now = useMemo(() => new Date(), []);
    const kpiStats = useMemo(
        () => getManagerDashboardStats(filteredTasks, now),
        [filteredTasks, now],
    );
    const workloadStats = useMemo(
        () => getUserWorkloadStats(tasks, users, participants, now),
        [tasks, users, participants, now],
    );
    const priorityBreakdown = useMemo(
        () => getPriorityBreakdown(filteredTasks),
        [filteredTasks],
    );
    const urgentTasks = useMemo(
        () => getManagerUrgentTasks(filteredTasks, now),
        [filteredTasks, now],
    );

    // Tasks in review & pending deadline requests
    const inReviewTasks = useMemo(
        () => filteredTasks.filter((t) => t.status === "IN_REVIEW"),
        [filteredTasks],
    );
    const pendingRequests = useMemo(
        () => deadlineRequests.filter((r) => r.status === "PENDING"),
        [deadlineRequests],
    );

    const activeFiltersCount =
        (filterProjectId !== "ALL" ? 1 : 0) +
        (filterAssigneeId !== "ALL" ? 1 : 0) +
        (filterPriority !== "ALL" ? 1 : 0) +
        (filterTimeRange !== "ALL" ? 1 : 0);

    const clearAllFilters = () => {
        setFilterProjectId("ALL");
        setFilterAssigneeId("ALL");
        setFilterPriority("ALL");
        setFilterTimeRange("ALL");
    };

    const handleDecisionDeadline = async () => {
        if (!activeReq || !currentUser) return;
        setIsDecidingReq(true);
        try {
            await mockRepository.decideDeadlineRequest(
                activeReq.id,
                {
                    decision: reqDecision,
                    reason:
                        reqDecision === "APPROVED"
                            ? "Trưởng phòng chấp thuận gia hạn."
                            : "Không đủ lý do gia hạn.",
                },
                currentUser.id,
            );
            showToast(
                reqDecision === "APPROVED"
                    ? "Đã chấp thuận đề nghị gia hạn thời hạn."
                    : "Đã từ chối đề nghị gia hạn.",
                reqDecision === "APPROVED" ? "success" : "info",
            );
            setActiveReq(null);
        } catch (err) {
            showToast(
                err instanceof Error ? err.message : "Lỗi xử lý yêu cầu",
                "error",
            );
        } finally {
            setIsDecidingReq(false);
        }
    };

    // Donut chart segments for status distribution
    const statusSegments = [
        {
            key: "TODO",
            label: "Chưa làm",
            value: kpiStats.todoCount,
            color: "#1D4ED8",
        },
        {
            key: "IN_PROGRESS",
            label: "Đang làm",
            value: kpiStats.inProgressCount,
            color: "#B45309",
        },
        {
            key: "IN_REVIEW",
            label: "Chờ duyệt",
            value: kpiStats.inReviewCount,
            color: "#7C3AED",
        },
        {
            key: "DONE",
            label: "Hoàn thành",
            value: kpiStats.doneCount,
            color: "#15803D",
        },
    ];

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="h-10 w-64 bg-slate-200 rounded animate-pulse" />
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {[...Array(6)].map((_, i) => (
                        <SkeletonCard key={i} />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-7">
            {/* 1. Header with Greeting & Primary Action */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/80">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5" /> Góc nhìn
                            Trưởng phòng
                        </span>
                        <span className="text-xs text-text-muted">
                            {new Intl.DateTimeFormat("vi-VN", {
                                dateStyle: "full",
                            }).format(now)}
                        </span>
                    </div>
                    <h1 className="text-2xl sm:text-[28px] font-bold text-text-primary tracking-tight mt-1">
                        Chào Trưởng phòng, {currentUser?.displayName}
                    </h1>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                    <Link to="/tasks/create">
                        <Button
                            variant="primary"
                            size="md"
                            className="gap-2 shadow-sm"
                        >
                            <PlusCircle className="w-4 h-4" /> Giao việc mới
                        </Button>
                    </Link>
                </div>
            </div>

            {/* 2. Synchronous Filter Bar */}
            <div className="bg-surface p-3.5 rounded-card border border-border shadow-xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="font-semibold text-text-secondary flex items-center gap-1 mr-1">
                        <Filter className="w-3.5 h-3.5 text-brand-700" /> Bộ lọc
                        điều hành:
                    </span>

                    {/* Project filter */}
                    <select
                        value={filterProjectId}
                        onChange={(e) => setFilterProjectId(e.target.value)}
                        className="h-9 px-2.5 rounded-btn bg-slate-50 border border-border text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-700"
                    >
                        <option value="ALL">Mọi dự án</option>
                        {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                                Dự án: {p.name}
                            </option>
                        ))}
                    </select>

                    {/* Assignee filter */}
                    <select
                        value={filterAssigneeId}
                        onChange={(e) => setFilterAssigneeId(e.target.value)}
                        className="h-9 px-2.5 rounded-btn bg-slate-50 border border-border text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-700"
                    >
                        <option value="ALL">Mọi người chủ trì</option>
                        {users.map((u) => (
                            <option key={u.id} value={u.id}>
                                {u.displayName} ({u.jobTitle})
                            </option>
                        ))}
                    </select>

                    {/* Priority filter */}
                    <select
                        value={filterPriority}
                        onChange={(e) => setFilterPriority(e.target.value)}
                        className="h-9 px-2.5 rounded-btn bg-slate-50 border border-border text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-700"
                    >
                        <option value="ALL">Mọi mức ưu tiên</option>
                        <option value="URGENT">Khẩn cấp (Urgent)</option>
                        <option value="HIGH">Cao (High)</option>
                        <option value="NORMAL">Bình thường (Normal)</option>
                        <option value="LOW">Thấp (Low)</option>
                    </select>

                    {/* Time range */}
                    <select
                        value={filterTimeRange}
                        onChange={(e) => setFilterTimeRange(e.target.value)}
                        className="h-9 px-2.5 rounded-btn bg-slate-50 border border-border text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-700"
                    >
                        <option value="ALL">Mọi mốc thời gian</option>
                        <option value="THIS_WEEK">Đến hạn tuần này</option>
                        <option value="OVERDUE">Chỉ việc quá hạn</option>
                    </select>
                </div>

                {activeFiltersCount > 0 && (
                    <button
                        onClick={clearAllFilters}
                        className="text-xs text-brand-700 hover:text-brand-800 font-semibold flex items-center gap-1 hover:underline"
                    >
                        <X className="w-3.5 h-3.5" /> Bỏ {activeFiltersCount} bộ
                        lọc
                    </button>
                )}
            </div>

            {/* 3. Row of 6 KPI Cards (Interactive, each opens /tasks with filter) */}
            <div>
                <div className="flex flex-wrap items-center justify-between gap-1.5 mb-2.5">
                    <div className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1">
                        <span>Chỉ số công việc chính thức (KPI Đơn vị)</span>
                        <span
                            className="text-text-muted cursor-help"
                            title="Chỉ tính 7 nhiệm vụ OFFICIAL đã phát hành, bỏ DRAFT (1) và CANCELLED (1). Việc TEAM/PERSONAL bị loại trừ hoàn toàn."
                        >
                            <HelpCircle className="w-3.5 h-3.5" />
                        </span>
                    </div>
                    {activeFiltersCount > 0 && (
                        <span className="text-[11px] text-amber-800 font-medium bg-amber-50 px-2 py-0.5 rounded">
                            Đang lọc: {kpiStats.totalActivePublished} nhiệm vụ
                        </span>
                    )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
                    {/* Total Active Published */}
                    <StatCard
                        label="Việc chính thức"
                        value={String(kpiStats.totalActivePublished).padStart(
                            2,
                            "0",
                        )}
                        description="Đang có hiệu lực"
                        variant="brand"
                        icon={<FolderKanban className="w-5 h-5" />}
                        onClick={() => navigate("/tasks?type=OFFICIAL")}
                    />

                    {/* TODO */}
                    <StatCard
                        label="Chưa làm"
                        value={String(kpiStats.todoCount).padStart(2, "0")}
                        description="Cần triển khai"
                        variant="info"
                        icon={<Clock className="w-5 h-5" />}
                        onClick={() =>
                            navigate("/tasks?type=OFFICIAL&status=TODO")
                        }
                    />

                    {/* IN_PROGRESS */}
                    <StatCard
                        label="Đang làm"
                        value={String(kpiStats.inProgressCount).padStart(
                            2,
                            "0",
                        )}
                        description="Đang tiến hành"
                        variant="warning"
                        icon={<Layers className="w-5 h-5" />}
                        onClick={() =>
                            navigate("/tasks?type=OFFICIAL&status=IN_PROGRESS")
                        }
                    />

                    {/* IN_REVIEW */}
                    <StatCard
                        label="Chờ duyệt"
                        value={String(kpiStats.inReviewCount).padStart(2, "0")}
                        description="Đã nộp kết quả"
                        variant="review"
                        icon={<FileText className="w-5 h-5" />}
                        onClick={() => navigate("/approvals")}
                    />

                    {/* DONE */}
                    <StatCard
                        label="Hoàn thành"
                        value={String(kpiStats.doneCount).padStart(2, "0")}
                        description={`Đúng hạn: ${kpiStats.completedOnTimeCount}/${kpiStats.doneCount}`}
                        variant="success"
                        icon={<CheckCircle2 className="w-5 h-5" />}
                        onClick={() =>
                            navigate("/tasks?type=OFFICIAL&status=DONE")
                        }
                    />

                    {/* OVERDUE */}
                    <StatCard
                        label="Quá hạn"
                        value={String(kpiStats.overdueCount).padStart(2, "0")}
                        description="Cần đôn đốc khẩn"
                        variant="danger"
                        icon={<AlertTriangle className="w-5 h-5" />}
                        onClick={() => navigate("/tasks?type=OFFICIAL")}
                    />
                </div>
            </div>

            {/* 4. Attention Area: Pending Approvals & Deadline Requests (Alert banner if any) */}
            {pendingRequests.length > 0 && (
                <div className="p-4 rounded-card bg-amber-50 border border-amber-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                            <Clock className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="font-bold text-xs text-amber-900 uppercase tracking-wide">
                                Có {pendingRequests.length} đề nghị gia hạn hạn
                                nộp cần quyết định
                            </div>
                            <div className="text-xs text-amber-800 mt-0.5">
                                {pendingRequests.map((r) => {
                                    const reqUser = users.find(
                                        (u) => u.id === r.requestedById,
                                    );
                                    const reqTask = tasks.find(
                                        (t) => t.id === r.taskId,
                                    );
                                    return (
                                        <span key={r.id} className="block mt-1">
                                            <strong>
                                                {reqUser?.displayName}
                                            </strong>{" "}
                                            đề nghị dời hạn việc{" "}
                                            <em>
                                                [{reqTask?.code}]{" "}
                                                {reqTask?.title}
                                            </em>{" "}
                                            đến{" "}
                                            <strong>
                                                {formatDateTimeVN(
                                                    r.proposedDueAt,
                                                )}
                                            </strong>
                                            . (Lý do: {r.reason})
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => {
                                setActiveReq(pendingRequests[0]);
                                setReqDecision("APPROVED");
                            }}
                            className="bg-amber-800 hover:bg-amber-900 text-white"
                        >
                            Chấp thuận gia hạn
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                setActiveReq(pendingRequests[0]);
                                setReqDecision("REJECTED");
                            }}
                            className="border-amber-300 text-amber-900 hover:bg-amber-100"
                        >
                            Từ chối
                        </Button>
                    </div>
                </div>
            )}

            {/* 5. Main Analytics Grid (7 cols / 5 cols layout) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Column (7 cols): Cần xử lý ngay & Chờ duyệt */}
                <div className="lg:col-span-7 space-y-6">
                    {/* Cần xử lý ngay */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-3">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <AlertOctagon className="w-4 h-4 text-danger" />
                                    Nhiệm vụ cần xử lý ngay (
                                    {urgentTasks.length})
                                </CardTitle>
                                <CardDescription>
                                    Gồm các việc quá hạn, có cờ vướng mắc, ưu
                                    tiên khẩn cấp hoặc chờ duyệt.
                                </CardDescription>
                            </div>
                            <Link to="/tasks?type=OFFICIAL">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs text-brand-700"
                                >
                                    Xem tất cả{" "}
                                    <ArrowRight className="w-3.5 h-3.5 ml-1" />
                                </Button>
                            </Link>
                        </CardHeader>
                        <CardContent className="p-0">
                            {urgentTasks.length === 0 ? (
                                <div className="p-8 text-center text-text-muted text-xs">
                                    Không có nhiệm vụ nào cần xử lý khẩn cấp.
                                </div>
                            ) : (
                                <div className="divide-y divide-border/60">
                                    {urgentTasks.map((t) => {
                                        const assignee = users.find(
                                            (u) => u.id === t.primaryAssigneeId,
                                        );
                                        const overdue = isTaskOverdue(t, now);
                                        return (
                                            <div
                                                key={t.id}
                                                onClick={() =>
                                                    navigate(`/tasks/${t.id}`)
                                                }
                                                className="p-3.5 hover:bg-slate-50 flex items-center justify-between gap-3 cursor-pointer transition-colors"
                                            >
                                                <div className="space-y-1 min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-mono font-bold text-xs text-text-primary">
                                                            {t.code}
                                                        </span>
                                                        <StatusBadge
                                                            status={t.status}
                                                        />
                                                        <PriorityBadge
                                                            priority={
                                                                t.priority
                                                            }
                                                        />
                                                        {overdue && (
                                                            <OverdueBadge />
                                                        )}
                                                        {t.isBlocked && (
                                                            <BlockedBadge
                                                                reason={
                                                                    t.blockedReason
                                                                }
                                                            />
                                                        )}
                                                    </div>

                                                    <div className="font-semibold text-sm text-text-primary truncate">
                                                        {t.title}
                                                    </div>

                                                    <div className="text-xs text-text-muted flex items-center gap-3">
                                                        <span>
                                                            XLC:{" "}
                                                            <strong>
                                                                {assignee?.displayName ||
                                                                    "—"}
                                                            </strong>
                                                        </span>
                                                        <span>•</span>
                                                        <span className="flex items-center gap-1">
                                                            <Calendar className="w-3 h-3 text-text-muted" />
                                                            <span
                                                                className={
                                                                    overdue
                                                                        ? "text-danger font-semibold"
                                                                        : ""
                                                                }
                                                            >
                                                                {formatDateTimeVN(
                                                                    t.dueAt,
                                                                )}
                                                            </span>
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="text-right shrink-0">
                                                    <div className="text-xs font-bold font-mono text-text-primary">
                                                        {t.progressPercent}%
                                                    </div>
                                                    <div className="w-14 h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                                                        <div
                                                            className="h-full bg-brand-700 rounded-full"
                                                            style={{
                                                                width: `${t.progressPercent}%`,
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Chờ duyệt (IN_REVIEW) */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-3">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-purple-600" />
                                    Hồ sơ chờ phê duyệt ({inReviewTasks.length})
                                </CardTitle>
                                <CardDescription>
                                    Chuyên viên đã hoàn thành và nộp kết quả chờ
                                    Trưởng phòng nghiệm thu.
                                </CardDescription>
                            </div>
                            <Link to="/approvals">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs text-brand-700"
                                >
                                    Mở trang duyệt{" "}
                                    <ArrowRight className="w-3.5 h-3.5 ml-1" />
                                </Button>
                            </Link>
                        </CardHeader>
                        <CardContent className="p-0">
                            {inReviewTasks.length === 0 ? (
                                <div className="p-8 text-center text-text-muted text-xs">
                                    Không có báo cáo nào đang chờ duyệt.
                                </div>
                            ) : (
                                <div className="divide-y divide-border/60">
                                    {inReviewTasks.map((t) => {
                                        const assignee = users.find(
                                            (u) => u.id === t.primaryAssigneeId,
                                        );
                                        return (
                                            <div
                                                key={t.id}
                                                className="p-3.5 hover:bg-slate-50 flex items-center justify-between gap-3"
                                            >
                                                <div className="space-y-0.5 min-w-0">
                                                    <div className="font-mono text-xs font-semibold text-text-primary">
                                                        {t.code}
                                                    </div>
                                                    <Link
                                                        to={`/tasks/${t.id}`}
                                                        className="font-bold text-sm text-text-primary hover:text-brand-700 line-clamp-1"
                                                    >
                                                        {t.title}
                                                    </Link>
                                                    <div className="text-xs text-text-muted truncate">
                                                        Người nộp:{" "}
                                                        {assignee?.displayName}{" "}
                                                        • Yêu cầu:{" "}
                                                        {t.deliverable}
                                                    </div>
                                                </div>

                                                <Link to="/approvals">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="text-xs shrink-0"
                                                    >
                                                        Xét duyệt{" "}
                                                        <ArrowRight className="w-3.5 h-3.5 ml-1" />
                                                    </Button>
                                                </Link>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column (5 cols): Donut Chart & Priority Breakdown */}
                <div className="lg:col-span-5 space-y-6">
                    {/* Status Distribution Donut Chart */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle>Phân bố trạng thái công việc</CardTitle>
                            <CardDescription>
                                Tính trên các nhiệm vụ Chính thức đang có hiệu
                                lực (bỏ Nháp và Hủy).
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-5">
                            <DonutChart
                                segments={statusSegments}
                                totalLabel="Có hiệu lực"
                                size={180}
                                thickness={26}
                            />
                        </CardContent>
                    </Card>

                    {/* Priority Breakdown (by task count, not participants) */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle>Phân bổ theo mức ưu tiên</CardTitle>
                            <CardDescription>
                                Thống kê theo số lượng nhiệm vụ, không nhân đôi
                                theo người phối hợp.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-5 space-y-3 text-xs">
                            {/* URGENT */}
                            <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-red-700">
                                        Khẩn cấp (Urgent)
                                    </span>
                                    <span className="font-mono font-bold">
                                        {priorityBreakdown.URGENT} việc
                                    </span>
                                </div>
                                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-red-600 rounded-full"
                                        style={{
                                            width: `${
                                                kpiStats.totalActivePublished >
                                                0
                                                    ? (priorityBreakdown.URGENT /
                                                          kpiStats.totalActivePublished) *
                                                      100
                                                    : 0
                                            }%`,
                                        }}
                                    />
                                </div>
                            </div>

                            {/* HIGH */}
                            <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-amber-700">
                                        Cao (High)
                                    </span>
                                    <span className="font-mono font-bold">
                                        {priorityBreakdown.HIGH} việc
                                    </span>
                                </div>
                                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-amber-500 rounded-full"
                                        style={{
                                            width: `${
                                                kpiStats.totalActivePublished >
                                                0
                                                    ? (priorityBreakdown.HIGH /
                                                          kpiStats.totalActivePublished) *
                                                      100
                                                    : 0
                                            }%`,
                                        }}
                                    />
                                </div>
                            </div>

                            {/* NORMAL */}
                            <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-blue-700">
                                        Bình thường (Normal)
                                    </span>
                                    <span className="font-mono font-bold">
                                        {priorityBreakdown.NORMAL} việc
                                    </span>
                                </div>
                                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-blue-600 rounded-full"
                                        style={{
                                            width: `${
                                                kpiStats.totalActivePublished >
                                                0
                                                    ? (priorityBreakdown.NORMAL /
                                                          kpiStats.totalActivePublished) *
                                                      100
                                                    : 0
                                            }%`,
                                        }}
                                    />
                                </div>
                            </div>

                            {/* LOW */}
                            <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-slate-600">
                                        Thấp (Low)
                                    </span>
                                    <span className="font-mono font-bold">
                                        {priorityBreakdown.LOW} việc
                                    </span>
                                </div>
                                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-slate-400 rounded-full"
                                        style={{
                                            width: `${
                                                kpiStats.totalActivePublished >
                                                0
                                                    ? (priorityBreakdown.LOW /
                                                          kpiStats.totalActivePublished) *
                                                      100
                                                    : 0
                                            }%`,
                                        }}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* 6. Workload by Assignee Table (Tách rõ chủ trì & phối hợp, tỷ lệ đúng hạn có mẫu số) */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>
                            Thống kê tải công việc theo Chuyên viên
                        </CardTitle>
                        <CardDescription>
                            Tách rõ số lượng nhiệm vụ chủ trì chính và tham gia
                            phối hợp; tỷ lệ đúng hạn tính trên các việc đã hoàn
                            thành có mốc thời gian.
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead className="bg-slate-50 border-b border-border text-text-secondary font-medium">
                                <tr className="h-11">
                                    <th className="px-4 py-2">Thành viên</th>
                                    <th className="px-4 py-2">Chức danh</th>
                                    <th className="px-4 py-2 text-center">
                                        Việc chủ trì
                                    </th>
                                    <th className="px-4 py-2 text-center">
                                        Việc phối hợp
                                    </th>
                                    <th className="px-4 py-2 text-center">
                                        Đã hoàn thành
                                    </th>
                                    <th className="px-4 py-2 text-center">
                                        Tỷ lệ đúng hạn
                                    </th>
                                    <th className="px-4 py-2 text-center">
                                        Quá hạn
                                    </th>
                                    <th className="px-4 py-2 text-right">
                                        Chi tiết
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/70 text-text-primary">
                                {workloadStats.map((stat) => (
                                    <tr
                                        key={stat.user.id}
                                        className="h-12 hover:bg-slate-50/80 transition-colors"
                                    >
                                        <td className="px-4 py-2">
                                            <div className="flex items-center gap-2">
                                                <UserAvatar
                                                    user={stat.user}
                                                    size="sm"
                                                    showRoleBadge
                                                />
                                                <span className="font-semibold text-text-primary">
                                                    {stat.user.displayName}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2 text-text-secondary">
                                            {stat.user.jobTitle}
                                        </td>
                                        <td className="px-4 py-2 text-center font-mono font-bold">
                                            {stat.primaryCount}
                                        </td>
                                        <td className="px-4 py-2 text-center font-mono text-purple-700 font-semibold">
                                            {stat.collabCount}
                                        </td>
                                        <td className="px-4 py-2 text-center font-mono text-emerald-700 font-semibold">
                                            {stat.doneCount}
                                        </td>
                                        <td className="px-4 py-2 text-center font-mono">
                                            {stat.doneCount > 0 ? (
                                                <span
                                                    className={`font-semibold ${
                                                        stat.onTimeRate >= 80
                                                            ? "text-emerald-700"
                                                            : stat.onTimeRate >=
                                                                50
                                                              ? "text-amber-700"
                                                              : "text-danger"
                                                    }`}
                                                >
                                                    {stat.doneOnTimeCount}/
                                                    {stat.doneCount} (
                                                    {stat.onTimeRate}%)
                                                </span>
                                            ) : (
                                                <span className="text-text-muted">
                                                    —
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2 text-center font-mono">
                                            {stat.overdueCount > 0 ? (
                                                <span className="text-danger font-bold">
                                                    {stat.overdueCount}
                                                </span>
                                            ) : (
                                                <span className="text-text-muted">
                                                    0
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                            <Link
                                                to={`/tasks?primaryAssigneeId=${stat.user.id}`}
                                            >
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 px-2 text-text-muted hover:text-brand-700"
                                                >
                                                    <Eye className="w-3.5 h-3.5 mr-1" />{" "}
                                                    Việc
                                                </Button>
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Deadline Request Decision Confirmation Dialog */}
            <ConfirmDialog
                isOpen={Boolean(activeReq)}
                title={
                    reqDecision === "APPROVED"
                        ? "Chấp thuận gia hạn thời hạn nhiệm vụ?"
                        : "Từ chối đề nghị gia hạn thời hạn?"
                }
                description={
                    reqDecision === "APPROVED"
                        ? `Hạn nộp mới sẽ được cập nhật thành: ${
                              activeReq?.proposedDueAt
                                  ? formatDateTimeVN(activeReq.proposedDueAt)
                                  : ""
                          }.`
                        : "Thời hạn hiện tại của nhiệm vụ sẽ được giữ nguyên không đổi."
                }
                confirmLabel={
                    reqDecision === "APPROVED"
                        ? "Chấp thuận"
                        : "Từ chối đề nghị"
                }
                variant={reqDecision === "APPROVED" ? "primary" : "danger"}
                isLoading={isDecidingReq}
                onConfirm={handleDecisionDeadline}
                onCancel={() => setActiveReq(null)}
            />
        </div>
    );
}
