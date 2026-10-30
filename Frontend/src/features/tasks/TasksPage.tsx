import React, { useState, useMemo, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { useSession } from "../auth/SessionContext";
import { workspaceRepository, httpRepository, isMockMode } from "../../shared/repository";
import { setSidebarCount } from "../../shared/sidebar-counts";
import {
  Breadcrumb,
  PageHeader,
  Button,
  DueSoonBadge,
  PriorityBadge,
  OverdueBadge,
  BlockedBadge,
  UserAvatar,
  EmptyState,
  useToast,
} from "../../components/ui";
import { TaskListItem } from "./TaskListItem";
import { isTaskOverdue, isTaskDueSoon } from "./task-selectors";
import type {
  Task,
  TaskPriority,
  TaskStatus,
  Project,
  TaskParticipant,
  TaskQuery,
  TaskInvitationPreview,
} from "../../shared/data-contract";
import {
  PlusCircle,
  X,
  LayoutList,
  Columns3,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react";

export function TasksPage() {
  const { currentUser, isLeader, users } = useSession();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // Read URL query parameters
  const viewMode = (searchParams.get("view") as "list" | "kanban") || "list";
  const search = searchParams.get("search") || "";
  const statusFilter = (searchParams.get("status") as TaskStatus | "ALL") || "ALL";
  const priorityFilter = (searchParams.get("priority") as TaskPriority | "ALL") || "ALL";
  const projectId = searchParams.get("projectId") || "ALL";
  const primaryAssigneeId = searchParams.get("primaryAssigneeId") || "ALL";
  const scope = (searchParams.get("scope") as "ALL" | "OWNED" | "COLLABORATING" | "WATCHING") || (isLeader ? "ALL" : "OWNED");
  const isOverdueParam = searchParams.get("isOverdue") === "true";
  const sortBy = (searchParams.get("sortBy") as "UPDATED_AT" | "DUE_AT" | "PRIORITY" | "CREATED_AT") || "UPDATED_AT";
  const sortDirection = (searchParams.get("sortDirection") as "ASC" | "DESC") || "DESC";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") || "10", 10);

  // Data states
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [participants, setParticipants] = useState<TaskParticipant[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<TaskInvitationPreview[]>([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Drag and drop state for Kanban
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);

  const queryKey = searchParams.toString();
  useEffect(() => {
    let live = true;
    const loadData = async () => {
      setIsLoading(true);
      try {
        if (isMockMode) {
          const [tList, pList, partList] = await Promise.all([
            workspaceRepository.getTasks(),
            workspaceRepository.getProjects(),
            workspaceRepository.getParticipants(),
          ]);
          if (!live) return;
          setAllTasks(tList);
          setProjects(pList);
          setParticipants(partList);
          setPendingInvitations([]);
          setServerTotal(tList.length);
          return;
        }
        const params = new URLSearchParams(queryKey);
        const query: TaskQuery = {
          page: viewMode === "kanban" ? 1 : Math.max(1, Number(params.get("page") || 1)),
          pageSize: viewMode === "kanban" ? 100 : Math.min(100, Math.max(1, Number(params.get("pageSize") || 10))),
          scope: (params.get("scope") as TaskQuery["scope"]) || (isLeader ? "ALL" : "OWNED"),
          status: (params.get("status") as TaskQuery["status"]) || "ALL",
          priority: (params.get("priority") as TaskQuery["priority"]) || "ALL",
          primaryAssigneeId: params.get("primaryAssigneeId") || "ALL",
          search: params.get("search") || "",
          isOverdue: params.get("isOverdue") === "true",
          sortBy: (params.get("sortBy") as TaskQuery["sortBy"]) || "UPDATED_AT",
          sortDirection: (params.get("sortDirection") as TaskQuery["sortDirection"]) || "DESC",
        };
        const [pageData, pList, invitations] = await Promise.all([
          viewMode === "kanban"
            ? httpRepository.queryAllTasks(query).then((items) => ({ items, total: items.length }))
            : httpRepository.queryTasks(query),
          workspaceRepository.getProjects(),
          httpRepository.getPendingInvitations(),
        ]);
        const visibleParts = await httpRepository.getParticipantsForTasks(pageData.items.map((task) => task.id));
        if (!live) return;
        setAllTasks(pageData.items);
        setProjects(pList);
        setParticipants(visibleParts);
        setPendingInvitations(invitations);
        setServerTotal(pageData.total);
      } catch (error) {
        if (live) showToast(error instanceof Error ? error.message : "Không thể tải công việc.", "error");
      } finally {
        if (live) setIsLoading(false);
      }
    };
    void loadData();
    const unsubscribe = workspaceRepository.subscribe(() => { void loadData(); });
    return () => { live = false; unsubscribe(); };
  }, [queryKey, currentUser?.id, isLeader, viewMode, showToast]);

  useEffect(() => {
    const isUnfilteredTaskList =
      scope === (isLeader ? "ALL" : "OWNED") &&
      statusFilter === "ALL" &&
      priorityFilter === "ALL" &&
      projectId === "ALL" &&
      primaryAssigneeId === "ALL" &&
      !search.trim() &&
      !isOverdueParam;
    if (!currentUser || isLoading || !isUnfilteredTaskList) return;
    setSidebarCount(currentUser.id, "tasks", serverTotal);
  }, [currentUser?.id, isLoading, isLeader, scope, statusFilter, priorityFilter, projectId, primaryAssigneeId, search, isOverdueParam, serverTotal]);

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

  const respondToInvitation = async (invite: TaskInvitationPreview, status: 'ACCEPTED' | 'DECLINED') => {
    if (!currentUser) return;
    try {
      await workspaceRepository.respondInvitation(invite.id, status, currentUser.id);
      setPendingInvitations((items) => items.filter((item) => item.id !== invite.id));
      showToast(status === 'ACCEPTED' ? 'Đã nhận lời mời cùng thực hiện công việc.' : 'Đã từ chối lời mời.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể phản hồi lời mời.', 'error');
    }
  };

  // Filter tasks synchronously based on URL params and user permissions
  const filteredTasks = useMemo(() => {
    if (!currentUser) return [];
    if (!isMockMode) return allTasks;

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
        const assignedTaskIds = new Set(
          participants
            .filter((p) => p.userId === currentUser.id && p.role === "COLLABORATOR" && p.invitationStatus === "ACCEPTED")
            .map((p) => p.taskId),
        );
        list = list.filter((t) =>
          t.primaryAssigneeId === currentUser.id || t.createdById === currentUser.id || assignedTaskIds.has(t.id),
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

    // 3. Status filter
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
      if (sortBy === "CREATED_AT") {
        return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * multiplier;
      }
      return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * multiplier;
    });

    return list;
  }, [
    allTasks,
    currentUser,
    participants,
    scope,
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
  const total = isMockMode ? filteredTasks.length : serverTotal;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedTasks = useMemo(() => {
    if (viewMode === "kanban") return filteredTasks; // Kanban displays by columns
    if (!isMockMode) return filteredTasks;
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
      await workspaceRepository.changeTaskStatus(
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
    setDragOverStatus(null);
    if (!draggedTaskId) return;

    const task = allTasks.find((t) => t.id === draggedTaskId);
    setDraggedTaskId(null);

    if (!task || task.status === targetStatus) return;
    await handleStatusTransition(task, targetStatus);
  };

  // Active filter count indicator
  const activeFiltersCount =
    (search ? 1 : 0) +
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

  // Kanban Columns
  const kanbanColumns: Array<{
    status: TaskStatus;
    label: string;
    color: string;
    accent: string;
    dot: string;
  }> = [
    { status: "TODO", label: "Chưa làm", color: "text-blue-700", accent: "border-t-blue-500", dot: "bg-blue-500" },
    { status: "IN_PROGRESS", label: "Đang làm", color: "text-amber-700", accent: "border-t-amber-500", dot: "bg-amber-500" },
    { status: "IN_REVIEW", label: "Chờ duyệt", color: "text-purple-700", accent: "border-t-purple-500", dot: "bg-purple-500" },
    { status: "DONE", label: "Hoàn thành", color: "text-emerald-700", accent: "border-t-emerald-500", dot: "bg-emerald-500" },
  ];
  const kanbanTaskCount = filteredTasks.filter((task) =>
    kanbanColumns.some((column) => column.status === task.status)
  ).length;

  return (
    <AppShell>
      <div className="space-y-6">
        <Breadcrumb items={[{ label: isLeader ? "Tất cả công việc" : "Công việc của tôi" }]} />

        {/* Page Header */}
        <PageHeader
          title={isLeader ? "Tất cả công việc phòng" : "Công việc của tôi"}
          subtitle={
            isLeader
              ? "Xem công việc được giao trong phòng, theo dõi tiến độ và quản lý việc cùng thực hiện."
              : "Danh sách công việc bạn được giao, cùng thực hiện hoặc đang theo dõi."
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

              {isLeader && (
                <Link to="/tasks/create">
                  <Button variant="primary" size="sm" className="gap-1.5 shadow-sm">
                    <PlusCircle className="w-4 h-4" />
                    {isLeader ? "Giao việc mới" : "Tạo việc mới"}
                  </Button>
                </Link>
              )}
            </div>
          }
        />

        {!isMockMode && pendingInvitations.length > 0 && (
          <section className="rounded-card border border-amber-200 bg-amber-50 p-4 space-y-3">
            <div>
              <h2 className="text-sm font-bold text-amber-950">Lời mời cùng thực hiện công việc</h2>
              <p className="mt-1 text-xs text-amber-800">Thông tin chi tiết chỉ hiện sau khi bạn nhận lời mời.</p>
            </div>
            <div className="space-y-2">
              {pendingInvitations.map((invite) => (
                <div key={invite.id} className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-mono text-[11px] text-text-muted">{invite.task.code}</div>
                    <div className="text-sm font-semibold text-text-primary">{invite.task.title}</div>
                    <div className="text-xs text-text-secondary">Mời bởi {invite.task.creator.displayName} · {invite.role === 'COLLABORATOR' ? 'Người phối hợp' : 'Người theo dõi'}</div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => void respondToInvitation(invite, 'DECLINED')}>Từ chối</Button>
                    <Button variant="primary" size="sm" onClick={() => void respondToInvitation(invite, 'ACCEPTED')}>Chấp nhận</Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-xl border border-border bg-white p-4 shadow-xs sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative w-full xl:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                type="search"
                aria-label="Tìm công việc"
                value={search}
                onChange={(event) => updateParams({ search: event.target.value, page: "1" })}
                placeholder="Tìm theo tên hoặc mã công việc"
                className="h-10 w-full rounded-lg border border-border bg-slate-50 pl-10 pr-3 text-sm text-text-primary outline-none focus:border-brand-400 focus:bg-white"
              />
            </div>
            <div className="grid w-full grid-cols-2 gap-1.5 rounded-lg bg-slate-50 p-1.5 text-xs sm:flex sm:w-fit sm:gap-1 sm:p-1">
              {(isLeader
                ? [["ALL", "Toàn phòng"], ["OWNED", "Việc của tôi"], ["COLLABORATING", "Cùng thực hiện"], ["WATCHING", "Theo dõi"]]
                : [["OWNED", "Việc của tôi"], ["COLLABORATING", "Cùng thực hiện"], ["WATCHING", "Theo dõi"]]
              ).map(([value, label]) => (
                <button key={value} type="button" onClick={() => updateParams({ scope: value, page: "1" })}
                  className={`min-w-0 rounded-md px-2 py-2 text-center font-semibold sm:shrink-0 sm:px-3 ${scope === value ? "bg-white text-brand-700 shadow-xs" : "text-text-secondary hover:text-text-primary"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {viewMode === "list" && <div className="mt-4 grid grid-cols-3 gap-1 border-t border-border pt-4 text-xs sm:flex sm:flex-wrap">
            {([ ["ALL", "Tất cả"], ["TODO", "Chưa làm"], ["IN_PROGRESS", "Đang làm"], ["IN_REVIEW", "Chờ duyệt"], ["DONE", "Hoàn thành"] ] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => updateParams({ status: value, page: "1" })}
                className={`min-w-0 rounded-lg px-2 py-2 text-center font-semibold sm:shrink-0 sm:px-3 ${statusFilter === value ? "bg-brand-700 text-white" : "text-text-secondary hover:bg-slate-50 hover:text-text-primary"}`}>
                {label}
              </button>
            ))}
            <button type="button" onClick={() => updateParams({ isOverdue: isOverdueParam ? undefined : "true", page: "1" })}
              className={`min-w-0 rounded-lg px-2 py-2 text-center font-semibold sm:ml-auto sm:shrink-0 sm:px-3 ${isOverdueParam ? "bg-red-50 text-red-700" : "text-text-secondary hover:bg-red-50 hover:text-red-700"}`}>
              Quá hạn
            </button>
          </div>}

          <div className="mt-4 flex flex-wrap items-start justify-between gap-3 border-t border-border pt-3">
            <details className="group min-w-0 flex-1">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50">
                <span>Bộ lọc khác</span><ChevronDown className="h-3.5 w-3.5 group-open:rotate-180" />
              </summary>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                <select aria-label="Lọc trạng thái" value={statusFilter} onChange={(event) => updateParams({ status: event.target.value, page: "1" })} className="h-9 w-full rounded-lg border border-border bg-white px-2.5 text-xs sm:w-auto">
                  <option value="ALL">Mọi trạng thái</option>
                  <option value="TODO">Chưa làm</option>
                  <option value="IN_PROGRESS">Đang làm</option>
                  <option value="IN_REVIEW">Chờ duyệt</option>
                  <option value="DONE">Hoàn thành</option>
                  <option value="DRAFT">Bản nháp</option>
                  <option value="CANCELLED">Đã hủy</option>
                </select>
                <select aria-label="Lọc mức ưu tiên" value={priorityFilter} onChange={(event) => updateParams({ priority: event.target.value, page: "1" })} className="h-9 w-full rounded-lg border border-border bg-white px-2.5 text-xs sm:w-auto">
                  <option value="ALL">Mọi mức ưu tiên</option>
                  <option value="URGENT">Khẩn cấp</option>
                  <option value="HIGH">Cao</option>
                  <option value="NORMAL">Bình thường</option>
                  <option value="LOW">Thấp</option>
                </select>
                <select aria-label="Lọc dự án" value={projectId} onChange={(event) => updateParams({ projectId: event.target.value, page: "1" })} className="h-9 w-full rounded-lg border border-border bg-white px-2.5 text-xs sm:w-auto">
                  <option value="ALL">Mọi dự án</option>
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
                {isLeader && <select aria-label="Lọc người nhận" value={primaryAssigneeId} onChange={(event) => updateParams({ primaryAssigneeId: event.target.value, page: "1" })} className="h-9 w-full rounded-lg border border-border bg-white px-2.5 text-xs sm:w-auto">
                  <option value="ALL">Mọi người nhận</option>
                  {users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}
                </select>}
                <select aria-label="Sắp xếp công việc" value={`${sortBy}:${sortDirection}`} onChange={(event) => { const [nextSortBy, nextDirection] = event.target.value.split(":"); updateParams({ sortBy: nextSortBy, sortDirection: nextDirection, page: "1" }); }} className="h-9 w-full rounded-lg border border-border bg-white px-2.5 text-xs sm:w-auto">
                  <option value="UPDATED_AT:DESC">Mới cập nhật</option>
                  <option value="DUE_AT:ASC">Hạn gần nhất</option>
                  <option value="PRIORITY:DESC">Ưu tiên cao nhất</option>
                  <option value="CREATED_AT:DESC">Mới tạo</option>
                </select>
              </div>
            </details>
            {activeFiltersCount > 0 && <button type="button" onClick={clearAllFilters} className="inline-flex items-center gap-1 py-1.5 text-xs font-semibold text-brand-700 hover:underline"><X className="h-3.5 w-3.5" /> Xóa bộ lọc</button>}
          </div>
        </section>
        {/* --- VIEW MODE 1: LIST VIEW --- */}
        {viewMode === "list" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 px-1">
              <h2 className="text-base font-bold text-text-primary">Danh sách công việc</h2>
              {!isLoading && <span className="text-xs font-medium text-text-secondary">{total} công việc</span>}
            </div>
            {isLoading ? (
              <div className="rounded-xl border border-border bg-white p-8 text-center text-sm text-text-muted" role="status">Đang tải công việc…</div>
            ) : paginatedTasks.length === 0 ? (
              <EmptyState
                title="Không tìm thấy nhiệm vụ nào"
                description="Thử thay đổi bộ lọc hoặc tạo một nhiệm vụ mới."
                action={
                  activeFiltersCount > 0 ? (
                    <Button variant="outline" size="sm" onClick={clearAllFilters}>
                      Xóa bộ lọc
                    </Button>
                  ) : isLeader ? (
                    <Link to="/tasks/create">
                      <Button variant="primary" size="sm">
                        <PlusCircle className="w-4 h-4 mr-1.5" /> Giao việc mới
                      </Button>
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              <>
                <div className="space-y-3">
                  {paginatedTasks.map((task) => (
                    <TaskListItem
                      key={task.id}
                      task={task}
                      assignee={users.find((user) => user.id === task.primaryAssigneeId)}
                      project={projects.find((project) => project.id === task.projectId)}
                      currentUserId={currentUser?.id}
                      isLeader={isLeader}
                    />
                  ))}
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
          <section className="space-y-3" aria-label="Bảng Kanban công việc" aria-busy={isLoading}>
            <div className="flex flex-col gap-2 rounded-card border border-brand-100 bg-brand-50/70 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-2.5">
                <Columns3 className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary">Kéo thẻ sang cột khác để cập nhật tiến độ</p>
                  <p className="mt-0.5 text-xs leading-5 text-text-secondary">Bảng hiển thị 4 bước thực thi chính. Bạn cũng có thể đổi trạng thái bằng menu trên từng thẻ.</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 pl-6 sm:pl-0">
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-text-secondary shadow-xs">{kanbanTaskCount} công việc</span>
                {(statusFilter === "DRAFT" || statusFilter === "CANCELLED") && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                    Bộ lọc {statusFilter === "DRAFT" ? "Nháp" : "Đã hủy"} không có cột tương ứng
                  </span>
                )}
              </div>
            </div>

            <div
              role="region"
              aria-label="Các cột trạng thái công việc"
              tabIndex={0}
              className="-mx-1 touch-pan-x overflow-x-auto overscroll-x-contain px-1 pb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
            >
              <div className="flex min-w-max items-start gap-3 sm:gap-4">
                {kanbanColumns.map((col) => {
                  const columnTasks = filteredTasks.filter((t) => t.status === col.status);
                  const isDropTarget = dragOverStatus === col.status;

                  return (
                    <section
                      key={col.status}
                      onDragEnter={() => setDragOverStatus(col.status)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => handleDrop(event, col.status)}
                      aria-label={`${col.label}: ${columnTasks.length} công việc`}
                      className={`flex w-[280px] shrink-0 flex-col rounded-card border-x border-b border-t-4 bg-white/75 p-3 shadow-xs transition-colors sm:w-[300px] ${col.accent} ${
                        isDropTarget
                          ? "border-x-brand-700 border-b-brand-700 border-t-brand-700 bg-brand-50/70 ring-2 ring-brand-200"
                          : "border-x-border border-b-border"
                      }`}
                    >
                      <div className="mb-3 flex items-center justify-between border-b border-border/70 pb-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${col.dot}`} aria-hidden="true" />
                          <h2 className={`truncate text-sm font-semibold ${col.color}`}>{col.label}</h2>
                          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-100 px-1.5 text-xs font-semibold text-text-secondary">
                            {columnTasks.length}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2.5">
                        {isLoading ? (
                          [0, 1, 2].map((item) => (
                            <div key={item} className="h-32 animate-pulse rounded-lg border border-border/70 bg-slate-50" />
                          ))
                        ) : columnTasks.length === 0 ? (
                          <div className="flex min-h-28 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-slate-50/60 px-4 py-5 text-center">
                            <span className="text-sm font-medium text-text-secondary">Chưa có công việc</span>
                            <span className="mt-1 text-xs text-text-muted">Thả thẻ vào đây để chuyển trạng thái</span>
                          </div>
                        ) : (
                          columnTasks.map((task) => {
                            const assignee = users.find((u) => u.id === task.primaryAssigneeId);
                            const overdue = isTaskOverdue(task);
                            const dueSoon = isTaskDueSoon(task);

                            return (
                              <article
                                key={task.id}
                                draggable
                                onDragStart={(event) => {
                                  setDraggedTaskId(task.id);
                                  event.dataTransfer.effectAllowed = "move";
                                  event.dataTransfer.setData("text/plain", task.id);
                                }}
                                onDragEnd={() => {
                                  setDraggedTaskId(null);
                                  setDragOverStatus(null);
                                }}
                                className={`group space-y-3 rounded-lg border border-border bg-white p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md active:cursor-grabbing ${
                                  overdue ? "border-l-4 border-l-danger" : ""
                                } ${draggedTaskId === task.id ? "cursor-grabbing opacity-50" : "cursor-grab"}`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <span className="rounded bg-slate-50 px-1.5 py-1 font-mono text-[11px] font-semibold text-text-secondary">
                                    {task.code}
                                  </span>
                                  <PriorityBadge priority={task.priority} />
                                </div>

                                <Link
                                  to={`/tasks/${task.id}`}
                                  className="block text-sm font-semibold leading-5 text-text-primary hover:text-brand-700"
                                >
                                  {task.title}
                                </Link>

                                {(overdue || task.isBlocked || dueSoon) && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {overdue && <OverdueBadge />}
                                    {!overdue && dueSoon && <DueSoonBadge />}
                                    {task.isBlocked && <BlockedBadge reason={task.blockedReason} />}
                                  </div>
                                )}

                                <div className="flex items-center justify-between border-t border-border/70 pt-2.5">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <UserAvatar user={assignee} size="sm" />
                                    <span className="truncate text-xs font-medium text-text-secondary">
                                      {assignee?.displayName || "Chưa giao"}
                                    </span>
                                  </div>
                                  <span className="shrink-0 font-mono text-[11px] text-text-muted">{task.progressPercent}%</span>
                                </div>

                                <div className="border-t border-dashed border-border/70 pt-2">
                                  <label className="sr-only" htmlFor={`kanban-status-${task.id}`}>Chuyển trạng thái {task.code}</label>
                                  <select
                                    id={`kanban-status-${task.id}`}
                                    value=""
                                    onChange={(event) => {
                                      const nextStatus = event.target.value as TaskStatus;
                                      if (nextStatus) void handleStatusTransition(task, nextStatus);
                                    }}
                                    className="h-8 w-full cursor-pointer rounded-md border border-border bg-slate-50 px-2 text-xs font-medium text-text-secondary outline-none transition-colors hover:border-brand-300 hover:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                                  >
                                    <option value="" disabled>Chuyển trạng thái…</option>
                                    {kanbanColumns.filter((option) => option.status !== task.status).map((option) => (
                                      <option key={option.status} value={option.status}>{option.label}</option>
                                    ))}
                                  </select>
                                </div>
                              </article>
                            );
                          })
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
