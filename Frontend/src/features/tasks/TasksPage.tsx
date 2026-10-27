import React, { useState, useMemo, useEffect } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { useSession } from "../auth/SessionContext";
import { mockRepository } from "../../mocks/mock-repository";
import {
  Breadcrumb,
  PageHeader,
  Button,
  StatusBadge,
  PriorityBadge,
  TaskTypeBadge,
  OverdueBadge,
  BlockedBadge,
  UserAvatar,
  DataTable,
  EmptyState,
  useToast,
} from "../../components/ui";
import { formatDateTimeVN, formatRelativeVN } from "../../shared/datetime";
import { isTaskOverdue, isTaskDueSoon } from "./task-selectors";
import type {
  Task,
  TaskPriority,
  TaskStatus,
  TaskType,
  Project,
  TaskParticipant,
} from "../../shared/data-contract";
import {
  PlusCircle,
  Eye,
  X,
  LayoutList,
  Columns3,
  AlertTriangle,
  Clock,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
} from "lucide-react";

export function TasksPage() {
  const { currentUser, isManager, isLeader, users } = useSession();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Read URL query parameters
  const viewMode = (searchParams.get("view") as "list" | "kanban") || "list";
  const search = searchParams.get("search") || "";
  const typeFilter = (searchParams.get("type") as TaskType | "ALL") || "ALL";
  const statusFilter = (searchParams.get("status") as TaskStatus | "ALL") || "ALL";
  const priorityFilter = (searchParams.get("priority") as TaskPriority | "ALL") || "ALL";
  const projectId = searchParams.get("projectId") || "ALL";
  const primaryAssigneeId = searchParams.get("primaryAssigneeId") || "ALL";
  const scope = (searchParams.get("scope") as "ALL" | "OWNED" | "COLLABORATING" | "WATCHING") || (isLeader ? "ALL" : "OWNED");
  const isOverdueParam = searchParams.get("isOverdue") === "true";
  const sortBy = (searchParams.get("sortBy") as "UPDATED_AT" | "DUE_AT" | "PRIORITY") || "UPDATED_AT";
  const sortDirection = (searchParams.get("sortDirection") as "ASC" | "DESC") || "DESC";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") || "10", 10);

  // Data states
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [participants, setParticipants] = useState<TaskParticipant[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Drag and drop state for Kanban
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  // Mobile expand/collapse state for list view
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => {
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [tList, pList, partList] = await Promise.all([
        mockRepository.getTasks(),
        mockRepository.getProjects(),
        mockRepository.getParticipants(),
      ]);
      setAllTasks(tList);
      setProjects(pList);
      setParticipants(partList);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const unsub = mockRepository.subscribe(loadData);
    return unsub;
  }, []);

  // Update query params helper
  const updateParams = (updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([k, v]) => {
      if (v === undefined || v === "" || v === "ALL" || (k === "page" && v === "1")) {
        next.delete(k);
      } else {
        next.set(k, v);
      }
    });
    setSearchParams(next);
  };

  // Filter tasks synchronously based on URL params and user permissions
  const filteredTasks = useMemo(() => {
    if (!currentUser) return [];

    const now = new Date();
    // 1. Permission filter
    let list = allTasks.filter((t) => {
      // DRAFT
      if (t.status === "DRAFT" && t.createdById !== currentUser.id) return false;
      // PERSONAL: only creator
      if (t.type === "PERSONAL") return t.createdById === currentUser.id;
      // OFFICIAL: Manager sees all
      if (t.type === "OFFICIAL" && isLeader) return true;
      // Owned or Assigned
      if (t.createdById === currentUser.id || t.primaryAssigneeId === currentUser.id) return true;
      // Accepted participant
      return participants.some(
        (p) => p.taskId === t.id && p.userId === currentUser.id && p.invitationStatus === "ACCEPTED"
      );
    });

    // 2. Scope filter (Staff doesn't have "Toàn phòng")
    if (scope && scope !== "ALL") {
      if (scope === "OWNED") {
        list = list.filter(
          (t) => t.primaryAssigneeId === currentUser.id || t.createdById === currentUser.id
        );
      } else if (scope === "COLLABORATING") {
        const collabTaskIds = new Set(
          participants
            .filter((p) => p.userId === currentUser.id && p.role === "COLLABORATOR" && p.invitationStatus === "ACCEPTED")
            .map((p) => p.taskId)
        );
        list = list.filter((t) => collabTaskIds.has(t.id) && t.primaryAssigneeId !== currentUser.id);
      } else if (scope === "WATCHING") {
        const watchingTaskIds = new Set(
          participants.filter((p) => p.userId === currentUser.id && p.role === "WATCHER").map((p) => p.taskId)
        );
        list = list.filter((t) => watchingTaskIds.has(t.id));
      }
    }

    // 3. Type filter
    if (typeFilter !== "ALL") {
      list = list.filter((t) => t.type === typeFilter);
    }

    // 4. Status filter
    if (statusFilter !== "ALL") {
      list = list.filter((t) => t.status === statusFilter);
    }

    // 5. Priority filter
    if (priorityFilter !== "ALL") {
      list = list.filter((t) => t.priority === priorityFilter);
    }

    // 6. Project filter
    if (projectId !== "ALL") {
      list = list.filter((t) => t.projectId === projectId);
    }

    // 7. Assignee filter
    if (primaryAssigneeId !== "ALL") {
      list = list.filter((t) => t.primaryAssigneeId === primaryAssigneeId);
    }

    // 8. Overdue filter
    if (isOverdueParam) {
      list = list.filter((t) => isTaskOverdue(t, now));
    }

    // 9. Search query
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.code.toLowerCase().includes(q) ||
          t.title.toLowerCase().includes(q) ||
          t.deliverable.toLowerCase().includes(q)
      );
    }

    // 10. Sorting
    const multiplier = sortDirection === "ASC" ? 1 : -1;
    list.sort((a, b) => {
      if (sortBy === "DUE_AT") {
        if (!a.dueAt && !b.dueAt) return 0;
        if (!a.dueAt) return 1;
        if (!b.dueAt) return -1;
        return (new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()) * multiplier;
      }
      if (sortBy === "PRIORITY") {
        const weights: Record<TaskPriority, number> = { URGENT: 4, HIGH: 3, NORMAL: 2, LOW: 1 };
        return ((weights[a.priority] || 0) - (weights[b.priority] || 0)) * multiplier;
      }
      return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * multiplier;
    });

    return list;
  }, [
    allTasks,
    currentUser,
    isManager,
    participants,
    scope,
    typeFilter,
    statusFilter,
    priorityFilter,
    projectId,
    primaryAssigneeId,
    isOverdueParam,
    search,
    sortBy,
    sortDirection,
  ]);

  // Pagination slice
  const total = filteredTasks.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedTasks = useMemo(() => {
    if (viewMode === "kanban") return filteredTasks; // Kanban displays by columns
    const start = (currentPage - 1) * pageSize;
    return filteredTasks.slice(start, start + pageSize);
  }, [filteredTasks, currentPage, pageSize, viewMode]);

  // Kanban status transitions logic
  const handleStatusTransition = async (task: Task, nextStatus: TaskStatus) => {
    if (!currentUser) return;

    // Check transition permissions strictly
    if (nextStatus === "DONE" && !isLeader) {
      showToast("Chỉ Lãnh đạo phòng (Trưởng/Phó phòng) mới có quyền phê duyệt Hoàn thành (DONE) cho nhiệm vụ chính thức.", "error");
      return;
    }

    if (task.status === "IN_REVIEW" && nextStatus === "IN_PROGRESS" && !isLeader) {
      showToast("Chỉ Lãnh đạo phòng (Trưởng/Phó phòng) mới có quyền trả lại kết quả phê duyệt.", "error");
      return;
    }

    if (task.status === "DRAFT" && nextStatus !== "DRAFT" && !isLeader && task.createdById !== currentUser.id) {
      showToast("Bạn không có quyền phát hành bản nháp này.", "error");
      return;
    }

    try {
      await mockRepository.changeTaskStatus(
        task.id,
        nextStatus,
        currentUser.id,
        `Chuyển trạng thái từ ${task.status} sang ${nextStatus}`
      );
      showToast(`Đã chuyển trạng thái [${task.code}] sang ${nextStatus}`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi chuyển trạng thái", "error");
    }
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    if (!draggedTaskId) return;

    const task = allTasks.find((t) => t.id === draggedTaskId);
    setDraggedTaskId(null);

    if (!task || task.status === targetStatus) return;
    await handleStatusTransition(task, targetStatus);
  };

  // Active filter count indicator
  const activeFiltersCount =
    (search ? 1 : 0) +
    (typeFilter !== "ALL" ? 1 : 0) +
    (statusFilter !== "ALL" ? 1 : 0) +
    (priorityFilter !== "ALL" ? 1 : 0) +
    (projectId !== "ALL" ? 1 : 0) +
    (primaryAssigneeId !== "ALL" ? 1 : 0) +
    (isOverdueParam ? 1 : 0) +
    (scope !== (isLeader ? "ALL" : "OWNED") ? 1 : 0);

  const clearAllFilters = () => {
    updateParams({
      search: undefined,
      type: undefined,
      status: undefined,
      priority: undefined,
      projectId: undefined,
      primaryAssigneeId: undefined,
      isOverdue: undefined,
      scope: isLeader ? "ALL" : "OWNED",
      page: "1",
    });
  };

  // Table columns definition for List view
  const columns = [
    {
      key: "code",
      header: "Mã việc",
      width: "115px",
      render: (t: Task) => (
        <span className="font-mono font-semibold text-text-primary text-xs">{t.code}</span>
      ),
    },
    {
      key: "title",
      header: "Tên công việc & Kết quả bàn giao",
      render: (t: Task) => {
        const overdue = isTaskOverdue(t);
        const dueSoon = isTaskDueSoon(t);
        return (
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Link
                to={`/tasks/${t.id}`}
                className="font-semibold text-text-primary hover:text-brand-700 hover:underline line-clamp-1"
              >
                {t.title}
              </Link>
              {overdue && <OverdueBadge />}
              {!overdue && dueSoon && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                  Sắp đến hạn
                </span>
              )}
              {t.isBlocked && <BlockedBadge reason={t.blockedReason} />}
            </div>
            <div className="text-[11px] text-text-muted line-clamp-1">{t.deliverable}</div>
          </div>
        );
      },
    },
    {
      key: "type",
      header: "Phân loại",
      width: "110px",
      render: (t: Task) => <TaskTypeBadge type={t.type} />,
    },
    {
      key: "assignee",
      header: "Chủ trì",
      width: "150px",
      render: (t: Task) => {
        const u = users.find((user) => user.id === t.primaryAssigneeId);
        return (
          <div className="flex items-center gap-2">
            <UserAvatar user={u} size="sm" />
            <span className="font-medium text-text-primary truncate">
              {u?.displayName || "—"}
            </span>
          </div>
        );
      },
    },
    {
      key: "collabs",
      header: "Phối hợp",
      width: "100px",
      render: (t: Task) => {
        const taskParts = participants.filter(
          (p) => p.taskId === t.id && p.role === "COLLABORATOR" && p.invitationStatus === "ACCEPTED"
        );
        if (taskParts.length === 0) return <span className="text-text-muted">—</span>;
        return (
          <div className="flex -space-x-1.5 overflow-hidden">
            {taskParts.slice(0, 3).map((p) => {
              const u = users.find((user) => user.id === p.userId);
              return <UserAvatar key={p.id} user={u} size="sm" className="border-2 border-white" />;
            })}
            {taskParts.length > 3 && (
              <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 text-[10px] flex items-center justify-center font-bold">
                +{taskParts.length - 3}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "dueAt",
      header: "Hạn hoàn thành",
      width: "140px",
      render: (t: Task) => {
        const overdue = isTaskOverdue(t);
        const dueSoon = isTaskDueSoon(t);
        return (
          <div className="text-xs">
            <div className={overdue ? "text-danger font-semibold flex items-center gap-1" : dueSoon ? "text-amber-700 font-medium" : "text-text-secondary"}>
              {overdue && <AlertTriangle className="w-3 h-3 text-danger shrink-0" />}
              {dueSoon && !overdue && <Clock className="w-3 h-3 text-amber-600 shrink-0" />}
              <span>{formatDateTimeVN(t.dueAt)}</span>
            </div>
            <div className="text-[10px] text-text-muted">{formatRelativeVN(t.dueAt)}</div>
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
      key: "progress",
      header: "Tiến độ",
      width: "90px",
      render: (t: Task) => (
        <div className="space-y-1">
          <div className="text-[11px] font-mono font-semibold text-text-primary">
            {t.progressPercent}%
          </div>
          <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${t.isBlocked ? "bg-amber-500" : "bg-brand-700"}`}
              style={{ width: `${t.progressPercent}%` }}
            />
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Trạng thái",
      width: "120px",
      render: (t: Task) => <StatusBadge status={t.status} />,
    },
    {
      key: "actions",
      header: "",
      width: "60px",
      render: (t: Task) => (
        <Link to={`/tasks/${t.id}`}>
          <Button variant="ghost" size="sm" className="h-8 px-2 text-text-muted hover:text-brand-700">
            <Eye className="w-3.5 h-3.5" />
          </Button>
        </Link>
      ),
    },
  ];

  // Kanban Columns
  const kanbanColumns: Array<{ status: TaskStatus; label: string; color: string; bg: string }> = [
    { status: "TODO", label: "Chưa làm", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
    { status: "IN_PROGRESS", label: "Đang làm", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
    { status: "IN_REVIEW", label: "Chờ duyệt", color: "text-purple-700", bg: "bg-purple-50 border-purple-200" },
    { status: "DONE", label: "Hoàn thành", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        <Breadcrumb items={[{ label: isLeader ? "Tất cả công việc" : "Công việc của tôi" }]} />

        {/* Page Header */}
        <PageHeader
          title={isLeader ? "Tất cả công việc phòng" : "Công việc của tôi"}
          subtitle={
            isManager
              ? "Xem toàn bộ các nhiệm vụ chính thức, nhiệm vụ nhóm và việc cá nhân do bạn tạo. Quản lý phân công và tiến độ."
              : "Danh sách công việc bạn được giao chủ trì, tham gia phối hợp hoặc được mời theo dõi."
          }
          actions={
            <div className="flex items-center gap-2.5">
              {/* List / Kanban View Switcher */}
              <div className="flex items-center bg-slate-100 p-1 rounded-btn border border-border text-xs">
                <button
                  onClick={() => updateParams({ view: "list" })}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-btn font-semibold transition-colors ${
                    viewMode === "list"
                      ? "bg-white text-brand-700 shadow-xs"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  <LayoutList className="w-3.5 h-3.5" /> Danh sách
                </button>
                <button
                  onClick={() => updateParams({ view: "kanban" })}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-btn font-semibold transition-colors ${
                    viewMode === "kanban"
                      ? "bg-white text-brand-700 shadow-xs"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  <Columns3 className="w-3.5 h-3.5" /> Bảng Kanban
                </button>
              </div>

              <Link to="/tasks/create">
                <Button variant="primary" size="sm" className="gap-1.5 shadow-sm">
                  <PlusCircle className="w-4 h-4" />
                  {isLeader ? "Giao việc mới" : "Tạo việc mới"}
                </Button>
              </Link>
            </div>
          }
        />

        {/* Comprehensive Filter Bar (URL Synced) */}
        <div className="bg-surface p-3.5 rounded-card border border-border shadow-xs space-y-3">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => updateParams({ search: e.target.value, page: "1" })}
                placeholder="Tìm mã việc (CV-, NH-), tiêu đề..."
                className="w-full h-9 pl-9 pr-8 rounded-btn bg-slate-50 border border-border text-xs text-text-primary placeholder:text-text-muted focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-700"
              />
              {search && (
                <button
                  onClick={() => updateParams({ search: undefined, page: "1" })}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Scope tabs */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 text-xs">
              {isManager && (
                <button
                  onClick={() => updateParams({ scope: "ALL", page: "1" })}
                  className={`px-3 py-1.5 rounded-btn font-medium whitespace-nowrap transition-colors ${
                    scope === "ALL"
                      ? "bg-brand-50 text-brand-700 font-bold border border-brand-100"
                      : "text-text-secondary hover:bg-slate-50 border border-transparent"
                  }`}
                >
                  Toàn phòng
                </button>
              )}
              <button
                onClick={() => updateParams({ scope: "OWNED", page: "1" })}
                className={`px-3 py-1.5 rounded-btn font-medium whitespace-nowrap transition-colors ${
                  scope === "OWNED"
                    ? "bg-brand-50 text-brand-700 font-bold border border-brand-100"
                    : "text-text-secondary hover:bg-slate-50 border border-transparent"
                }`}
              >
                Tôi chủ trì
              </button>
              <button
                onClick={() => updateParams({ scope: "COLLABORATING", page: "1" })}
                className={`px-3 py-1.5 rounded-btn font-medium whitespace-nowrap transition-colors ${
                  scope === "COLLABORATING"
                    ? "bg-brand-50 text-brand-700 font-bold border border-brand-100"
                    : "text-text-secondary hover:bg-slate-50 border border-transparent"
                }`}
              >
                Tôi phối hợp
              </button>
              <button
                onClick={() => updateParams({ scope: "WATCHING", page: "1" })}
                className={`px-3 py-1.5 rounded-btn font-medium whitespace-nowrap transition-colors ${
                  scope === "WATCHING"
                    ? "bg-brand-50 text-brand-700 font-bold border border-brand-100"
                    : "text-text-secondary hover:bg-slate-50 border border-transparent"
                }`}
              >
                Theo dõi
              </button>
            </div>
          </div>

          {/* Secondary Filter Dropdowns */}
          <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-border/60 text-xs">
            {/* Task Type */}
            <select
              value={typeFilter}
              onChange={(e) => updateParams({ type: e.target.value, page: "1" })}
              className="h-8 px-2.5 rounded-btn bg-slate-50 border border-border text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-700"
            >
              <option value="ALL">Mọi loại việc</option>
              <option value="OFFICIAL">Chính thức (OFFICIAL)</option>
              <option value="TEAM">Cộng tác nhóm (TEAM)</option>
              <option value="PERSONAL">Cá nhân (PERSONAL)</option>
            </select>

            {/* Status (In List mode) */}
            {viewMode === "list" && (
              <select
                value={statusFilter}
                onChange={(e) => updateParams({ status: e.target.value, page: "1" })}
                className="h-8 px-2.5 rounded-btn bg-slate-50 border border-border text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-700"
              >
                <option value="ALL">Mọi trạng thái</option>
                <option value="TODO">Chưa làm</option>
                <option value="IN_PROGRESS">Đang làm</option>
                <option value="IN_REVIEW">Chờ duyệt</option>
                <option value="DONE">Hoàn thành</option>
                <option value="DRAFT">Bản nháp</option>
                <option value="CANCELLED">Đã hủy</option>
              </select>
            )}

            {/* Priority */}
            <select
              value={priorityFilter}
              onChange={(e) => updateParams({ priority: e.target.value, page: "1" })}
              className="h-8 px-2.5 rounded-btn bg-slate-50 border border-border text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-700"
            >
              <option value="ALL">Mọi mức ưu tiên</option>
              <option value="URGENT">Khẩn cấp (Urgent)</option>
              <option value="HIGH">Cao (High)</option>
              <option value="NORMAL">Bình thường (Normal)</option>
              <option value="LOW">Thấp (Low)</option>
            </select>

            {/* Project */}
            <select
              value={projectId}
              onChange={(e) => updateParams({ projectId: e.target.value, page: "1" })}
              className="h-8 px-2.5 rounded-btn bg-slate-50 border border-border text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-700"
            >
              <option value="ALL">Mọi dự án</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            {/* Assignee (if Manager or all) */}
            {isManager && (
              <select
                value={primaryAssigneeId}
                onChange={(e) => updateParams({ primaryAssigneeId: e.target.value, page: "1" })}
                className="h-8 px-2.5 rounded-btn bg-slate-50 border border-border text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-700"
              >
                <option value="ALL">Mọi người chủ trì</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName}
                  </option>
                ))}
              </select>
            )}

            {/* Overdue Checkbox */}
            <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-btn bg-slate-50 border border-border cursor-pointer select-none text-text-secondary hover:text-text-primary">
              <input
                type="checkbox"
                checked={isOverdueParam}
                onChange={(e) => updateParams({ isOverdue: e.target.checked ? "true" : undefined, page: "1" })}
                className="rounded text-brand-700 focus:ring-brand-700"
              />
              <span className={isOverdueParam ? "text-danger font-semibold" : ""}>Chỉ việc quá hạn</span>
            </label>

            {/* Clear Filters */}
            {activeFiltersCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="text-xs text-brand-700 hover:text-brand-800 font-semibold flex items-center gap-1 hover:underline ml-auto"
              >
                <X className="w-3.5 h-3.5" /> Bỏ {activeFiltersCount} bộ lọc
              </button>
            )}
          </div>
        </div>

        {/* --- VIEW MODE 1: LIST VIEW --- */}
        {viewMode === "list" && (
          <div className="space-y-4">
            {paginatedTasks.length === 0 && !isLoading ? (
              <EmptyState
                title="Không tìm thấy nhiệm vụ nào"
                description="Thử thay đổi bộ lọc hoặc tạo một nhiệm vụ mới."
                action={
                  activeFiltersCount > 0 ? (
                    <Button variant="outline" size="sm" onClick={clearAllFilters}>
                      Xóa bộ lọc
                    </Button>
                  ) : (
                    <Link to="/tasks/create">
                      <Button variant="primary" size="sm">
                        <PlusCircle className="w-4 h-4 mr-1.5" /> Giao việc mới
                      </Button>
                    </Link>
                  )
                }
              />
            ) : (
              <>
                {/* Desktop & Tablet Table View (>= 768px) */}
                <div className="hidden md:block">
                  <DataTable
                    columns={columns}
                    data={paginatedTasks}
                    keyExtractor={(t) => t.id}
                    isLoading={isLoading}
                    onRowClick={(t) => navigate(`/tasks/${t.id}`)}
                  />
                </div>

                {/* Mobile Optimized Cards List (< 768px) */}
                <div className="block md:hidden space-y-3">
                  {paginatedTasks.map((t) => {
                    const isExpanded = expandedTaskIds.has(t.id);
                    const overdue = isTaskOverdue(t);
                    const dueSoon = isTaskDueSoon(t);
                    const assignee = users.find((u) => u.id === t.primaryAssigneeId);
                    const proj = projects.find((p) => p.id === t.projectId);
                    const taskCollabs = participants.filter(
                      (p) =>
                        p.taskId === t.id &&
                        p.role === "COLLABORATOR" &&
                        p.invitationStatus === "ACCEPTED"
                    );

                    return (
                      <div
                        key={t.id}
                        className="p-3.5 bg-surface rounded-card border border-border shadow-xs space-y-2.5 transition-all"
                      >
                        {/* Top: Code, Badges, Status */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                            <span className="font-mono font-bold text-xs bg-slate-100 text-brand-800 px-2 py-0.5 rounded">
                              {t.code}
                            </span>
                            <TaskTypeBadge type={t.type} />
                            {overdue && <OverdueBadge />}
                            {!overdue && dueSoon && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                                Sắp đến hạn
                              </span>
                            )}
                            {t.isBlocked && <BlockedBadge reason={t.blockedReason} />}
                          </div>
                          <div className="shrink-0">
                            <StatusBadge status={t.status} />
                          </div>
                        </div>

                        {/* Task Title */}
                        <Link
                          to={`/tasks/${t.id}`}
                          className="font-bold text-sm text-text-primary hover:text-brand-700 block leading-snug line-clamp-2"
                        >
                          {t.title}
                        </Link>

                        {/* Essential Row: Assignee & Due Date */}
                        <div className="flex items-center justify-between gap-2 text-xs pt-0.5 text-text-secondary">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <UserAvatar user={assignee} size="sm" />
                            <span className="font-medium text-text-primary truncate max-w-[130px]">
                              {assignee?.displayName || "Chưa phân công"}
                            </span>
                          </div>

                          <div className="text-right shrink-0">
                            <div
                              className={`font-semibold flex items-center justify-end gap-1 ${
                                overdue
                                  ? "text-danger"
                                  : dueSoon
                                  ? "text-amber-700"
                                  : "text-text-primary"
                              }`}
                            >
                              {overdue && <AlertTriangle className="w-3 h-3 text-danger shrink-0" />}
                              {dueSoon && !overdue && <Clock className="w-3 h-3 text-amber-600 shrink-0" />}
                              <span>{formatDateTimeVN(t.dueAt)}</span>
                            </div>
                            <div className="text-[10px] text-text-muted">{formatRelativeVN(t.dueAt)}</div>
                          </div>
                        </div>

                        {/* Toggle Expand Details */}
                        <button
                          type="button"
                          onClick={() => toggleExpand(t.id)}
                          className="w-full pt-2 border-t border-border/70 flex items-center justify-between text-xs text-brand-700 font-medium hover:text-brand-800 transition-colors"
                        >
                          <span>
                            {isExpanded ? "Thu gọn thông tin" : "Xem thêm chi tiết (kết quả, ưu tiên, tiến độ)"}
                          </span>
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>

                        {/* Expanded Secondary Details */}
                        {isExpanded && (
                          <div className="pt-2 border-t border-dashed border-border/70 space-y-2.5 text-xs">
                            {t.deliverable && (
                              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
                                <span className="font-semibold text-text-secondary block text-[11px] mb-0.5">
                                  Đầu ra bàn giao:
                                </span>
                                <span className="text-text-primary text-xs">{t.deliverable}</span>
                              </div>
                            )}

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <span className="text-[11px] text-text-muted block mb-0.5">Ưu tiên:</span>
                                <PriorityBadge priority={t.priority} />
                              </div>
                              {proj && (
                                <div>
                                  <span className="text-[11px] text-text-muted block mb-0.5">Dự án:</span>
                                  <span className="font-medium text-text-primary truncate block">
                                    {proj.name}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Progress */}
                            <div>
                              <div className="flex items-center justify-between text-[11px] text-text-muted mb-1">
                                <span>Tiến độ thực hiện:</span>
                                <span className="font-bold text-text-primary font-mono">
                                  {t.progressPercent}%
                                </span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    t.isBlocked ? "bg-amber-500" : "bg-brand-700"
                                  }`}
                                  style={{ width: `${t.progressPercent}%` }}
                                />
                              </div>
                            </div>

                            {/* Collaborators */}
                            {taskCollabs.length > 0 && (
                              <div>
                                <span className="text-[11px] text-text-muted block mb-1">
                                  Người phối hợp ({taskCollabs.length}):
                                </span>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {taskCollabs.map((p) => {
                                    const cu = users.find((u) => u.id === p.userId);
                                    return (
                                      <div
                                        key={p.id}
                                        className="flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-full text-[11px]"
                                      >
                                        <UserAvatar user={cu} size="sm" />
                                        <span>{cu?.displayName}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Direct Open Detail Button */}
                            <div className="pt-1">
                              <Link to={`/tasks/${t.id}`}>
                                <Button
                                  variant="primary"
                                  size="sm"
                                  className="w-full gap-1.5 justify-center font-medium"
                                >
                                  <span>Xem chi tiết đầy đủ</span>
                                  <ArrowUpRight className="w-4 h-4" />
                                </Button>
                              </Link>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Pagination Controls */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-text-secondary px-2">
                  <div>
                    Hiển thị <strong>{paginatedTasks.length}</strong> trên tổng số <strong>{total}</strong> công việc
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-text-muted">Trang {currentPage} / {totalPages}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage <= 1}
                        onClick={() => updateParams({ page: String(currentPage - 1) })}
                        className="h-8 w-8 p-0"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage >= totalPages}
                        onClick={() => updateParams({ page: String(currentPage + 1) })}
                        className="h-8 w-8 p-0"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* --- VIEW MODE 2: KANBAN VIEW --- */}
        {viewMode === "kanban" && (
          <div className="space-y-4">
            {/* Note on DRAFT & CANCELLED in Kanban */}
            <div className="flex items-center justify-between text-xs text-text-muted px-1">
              <span>
                💡 Kéo thẻ để đổi trạng thái, hoặc dùng nút menu góc thẻ. Cột Kanban chỉ thể hiện 4 bước thực thi chính.
              </span>
              {(statusFilter === "DRAFT" || statusFilter === "CANCELLED") && (
                <span className="text-amber-800 font-semibold bg-amber-50 px-2 py-0.5 rounded">
                  Đang lọc trạng thái riêng: {statusFilter}
                </span>
              )}
            </div>

            {/* 4-column Kanban Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
              {kanbanColumns.map((col) => {
                const columnTasks = filteredTasks.filter((t) => t.status === col.status);

                return (
                  <div
                    key={col.status}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleDrop(e, col.status)}
                    className="bg-slate-100/70 rounded-card p-3 border border-border flex flex-col min-h-[500px]"
                  >
                    {/* Column Header */}
                    <div className="flex items-center justify-between pb-3 mb-2 border-b border-border/80">
                      <div className="flex items-center gap-2">
                        <span className={`font-bold text-xs ${col.color}`}>{col.label}</span>
                        <span className="w-5 h-5 rounded-full bg-surface text-text-primary text-[11px] font-bold flex items-center justify-center border border-border shadow-2xs">
                          {columnTasks.length}
                        </span>
                      </div>
                    </div>

                    {/* Column Cards */}
                    <div className="space-y-3 flex-1 overflow-y-auto max-h-[700px] pr-0.5">
                      {columnTasks.length === 0 ? (
                        <div className="p-6 text-center text-text-muted text-xs border border-dashed border-border/80 rounded-btn">
                          Trống
                        </div>
                      ) : (
                        columnTasks.map((task) => {
                          const assignee = users.find((u) => u.id === task.primaryAssigneeId);
                          const overdue = isTaskOverdue(task);
                          const dueSoon = isTaskDueSoon(task);

                          return (
                            <div
                              key={task.id}
                              draggable
                              onDragStart={() => setDraggedTaskId(task.id)}
                              className={`p-3.5 rounded-card bg-surface border border-border shadow-card hover:shadow-md transition-all cursor-grab active:cursor-grabbing space-y-2.5 ${
                                overdue ? "border-l-4 border-l-danger" : ""
                              }`}
                            >
                              {/* Card Header: Code & Type & Priority */}
                              <div className="flex items-center justify-between gap-1.5">
                                <span className="font-mono font-bold text-xs text-text-primary">
                                  {task.code}
                                </span>
                                <div className="flex items-center gap-1">
                                  <TaskTypeBadge type={task.type} />
                                  <PriorityBadge priority={task.priority} />
                                </div>
                              </div>

                              {/* Title */}
                              <Link
                                to={`/tasks/${task.id}`}
                                className="block font-semibold text-xs text-text-primary hover:text-brand-700 line-clamp-2 leading-snug"
                              >
                                {task.title}
                              </Link>

                              {/* Overdue / Blocked Badge */}
                              {(overdue || task.isBlocked || dueSoon) && (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {overdue && <OverdueBadge />}
                                  {!overdue && dueSoon && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                                      Sắp đến hạn
                                    </span>
                                  )}
                                  {task.isBlocked && <BlockedBadge reason={task.blockedReason} />}
                                </div>
                              )}

                              {/* Footer: Assignee & Due Date */}
                              <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <UserAvatar user={assignee} size="sm" />
                                  <span className="text-text-muted text-[11px] truncate max-w-[90px]">
                                    {assignee?.displayName || "Chưa giao"}
                                  </span>
                                </div>

                                <div className="text-[11px] font-mono text-text-muted">
                                  {task.progressPercent}%
                                </div>
                              </div>

                              {/* Mobile / Click Transition Menu */}
                              <div className="pt-1.5 flex items-center justify-between text-[11px] border-t border-dashed border-border/60">
                                <span className="text-text-muted">Chuyển sang:</span>
                                <div className="flex items-center gap-1">
                                  {col.status !== "TODO" && (
                                    <button
                                      onClick={() => handleStatusTransition(task, "TODO")}
                                      className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-text-secondary"
                                      title="Chuyển về Chưa làm"
                                    >
                                      Chưa làm
                                    </button>
                                  )}
                                  {col.status !== "IN_PROGRESS" && (
                                    <button
                                      onClick={() => handleStatusTransition(task, "IN_PROGRESS")}
                                      className="px-1.5 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-900"
                                      title="Chuyển sang Đang làm"
                                    >
                                      Đang làm
                                    </button>
                                  )}
                                  {col.status !== "IN_REVIEW" && (
                                    <button
                                      onClick={() => handleStatusTransition(task, "IN_REVIEW")}
                                      className="px-1.5 py-0.5 rounded bg-purple-100 hover:bg-purple-200 text-purple-900"
                                      title="Chuyển sang Chờ duyệt"
                                    >
                                      Nộp duyệt
                                    </button>
                                  )}
                                  {col.status !== "DONE" && (
                                    <button
                                      onClick={() => handleStatusTransition(task, "DONE")}
                                      className="px-1.5 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-900"
                                      title="Phê duyệt hoàn thành"
                                    >
                                      Hoàn thành
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
