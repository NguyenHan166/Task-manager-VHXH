import React, { useState, useMemo, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { useSession } from "../auth/SessionContext";
import { workspaceRepository, httpRepository, isMockMode } from "../../shared/repository";
import {
  Breadcrumb,
  PageHeader,
  Button,
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
            <div className="flex gap-1 overflow-x-auto rounded-lg bg-slate-50 p-1 text-xs">
              {(isLeader
                ? [["ALL", "Toàn phòng"], ["OWNED", "Việc của tôi"], ["COLLABORATING", "Cùng thực hiện"], ["WATCHING", "Theo dõi"]]
                : [["OWNED", "Việc của tôi"], ["COLLABORATING", "Cùng thực hiện"], ["WATCHING", "Theo dõi"]]
              ).map(([value, label]) => (
                <button key={value} type="button" onClick={() => updateParams({ scope: value, page: "1" })}
                  className={`shrink-0 rounded-md px-3 py-2 font-semibold ${scope === value ? "bg-white text-brand-700 shadow-xs" : "text-text-secondary hover:text-text-primary"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {viewMode === "list" && <div className="mt-4 flex gap-1 overflow-x-auto border-t border-border pt-4 text-xs">
            {([ ["ALL", "Tất cả"], ["TODO", "Chưa làm"], ["IN_PROGRESS", "Đang làm"], ["IN_REVIEW", "Chờ duyệt"], ["DONE", "Hoàn thành"] ] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => updateParams({ status: value, page: "1" })}
                className={`shrink-0 rounded-lg px-3 py-2 font-semibold ${statusFilter === value ? "bg-brand-700 text-white" : "text-text-secondary hover:bg-slate-50 hover:text-text-primary"}`}>
                {label}
              </button>
            ))}
            <button type="button" onClick={() => updateParams({ isOverdue: isOverdueParam ? undefined : "true", page: "1" })}
              className={`ml-auto shrink-0 rounded-lg px-3 py-2 font-semibold ${isOverdueParam ? "bg-red-50 text-red-700" : "text-text-secondary hover:bg-red-50 hover:text-red-700"}`}>
              Quá hạn
            </button>
          </div>}

          <div className="mt-4 flex flex-wrap items-start justify-between gap-3 border-t border-border pt-3">
            <details className="group min-w-0 flex-1">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50">
                <span>Bộ lọc khác</span><ChevronDown className="h-3.5 w-3.5 group-open:rotate-180" />
              </summary>
              <div className="mt-3 flex flex-wrap gap-2">
                <select aria-label="Lọc trạng thái" value={statusFilter} onChange={(event) => updateParams({ status: event.target.value, page: "1" })} className="h-9 rounded-lg border border-border bg-white px-2.5 text-xs">
                  <option value="ALL">Mọi trạng thái</option>
                  <option value="TODO">Chưa làm</option>
                  <option value="IN_PROGRESS">Đang làm</option>
                  <option value="IN_REVIEW">Chờ duyệt</option>
                  <option value="DONE">Hoàn thành</option>
                  <option value="DRAFT">Bản nháp</option>
                  <option value="CANCELLED">Đã hủy</option>
                </select>
                <select aria-label="Lọc mức ưu tiên" value={priorityFilter} onChange={(event) => updateParams({ priority: event.target.value, page: "1" })} className="h-9 rounded-lg border border-border bg-white px-2.5 text-xs">
                  <option value="ALL">Mọi mức ưu tiên</option>
                  <option value="URGENT">Khẩn cấp</option>
                  <option value="HIGH">Cao</option>
                  <option value="NORMAL">Bình thường</option>
                  <option value="LOW">Thấp</option>
                </select>
                <select aria-label="Lọc dự án" value={projectId} onChange={(event) => updateParams({ projectId: event.target.value, page: "1" })} className="h-9 rounded-lg border border-border bg-white px-2.5 text-xs">
                  <option value="ALL">Mọi dự án</option>
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
                {isLeader && <select aria-label="Lọc người nhận" value={primaryAssigneeId} onChange={(event) => updateParams({ primaryAssigneeId: event.target.value, page: "1" })} className="h-9 rounded-lg border border-border bg-white px-2.5 text-xs">
                  <option value="ALL">Mọi người nhận</option>
                  {users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}
                </select>}
                <select aria-label="Sắp xếp công việc" value={`${sortBy}:${sortDirection}`} onChange={(event) => { const [nextSortBy, nextDirection] = event.target.value.split(":"); updateParams({ sortBy: nextSortBy, sortDirection: nextDirection, page: "1" }); }} className="h-9 rounded-lg border border-border bg-white px-2.5 text-xs">
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
