import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { useSession } from "../auth/SessionContext";
import { workspaceRepository } from "../../shared/repository";
import { canSeeTask, isTaskOverdue } from "../../shared/data-contract";
import { isTaskDueSoon } from "../tasks/task-selectors";
import type { Project, Task, TaskParticipant, TaskStatus } from "../../shared/data-contract";
import { ForbiddenPage } from "../auth/ForbiddenPage";
import {
  Breadcrumb,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  ConfirmDialog,
  Input,
  Textarea,
  Select,
  StatusBadge,
  PriorityBadge,
  OverdueBadge,
  UserAvatar,
  DataTable,
  EmptyState,
  useToast,
} from "../../components/ui";
import { formatDateTimeVN, formatRelativeVN } from "../../shared/datetime";
import {
  FolderKanban,
  Edit,
  PlusCircle,
  Clock,
  ArrowLeft,
  Layers,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentUser, isManager, isLeader, users } = useSession();
  const { showToast } = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [participants, setParticipants] = useState<TaskParticipant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isForbidden, setIsForbidden] = useState(false);

  // Edit Project Modal state (Manager only)
  const [showEditModal, setShowEditModal] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [descInput, setDescInput] = useState("");
  const [startInput, setStartInput] = useState("");
  const [endInput, setEndInput] = useState("");
  const [statusInput, setStatusInput] = useState<"ACTIVE" | "ARCHIVED">("ACTIVE");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter state for project tasks
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());

  const toggleExpand = (taskId: string) => {
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const loadData = async () => {
    if (!id || !currentUser) return;
    setIsLoading(true);
    setIsForbidden(false);
    try {
      const [proj, allTasks, allParts] = await Promise.all([
        workspaceRepository.getProjectById(id),
        workspaceRepository.getTasks(),
        workspaceRepository.getParticipants(),
      ]);

      if (!proj) {
        setProject(null);
        return;
      }

      // Check permission:
      // Manager can view any project.
      // Staff can view only if owner OR has at least 1 permitted task.
      const projTasks = allTasks.filter((t) => t.projectId === proj.id);
      const permittedTasks = projTasks.filter((t) => canSeeTask(t, currentUser, allParts));

      if (!isLeader && proj.ownerId !== currentUser.id && permittedTasks.length === 0) {
        setIsForbidden(true);
        return;
      }

      setProject(proj);
      setTasks(allTasks);
      setParticipants(allParts);

      setNameInput(proj.name);
      setDescInput(proj.description || "");
      setStartInput(proj.startAt ? proj.startAt.slice(0, 10) : "");
      setEndInput(proj.endAt ? proj.endAt.slice(0, 10) : "");
      setStatusInput(proj.status);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const unsub = workspaceRepository.subscribe(loadData);
    return unsub;
  }, [id, currentUser]);

  // Tasks in this project filtered by permission and search/status
  const visibleTasks = useMemo(() => {
    if (!project || !currentUser) return [];

    let filtered = tasks
      .filter((t) => t.projectId === project.id)
      .filter((t) => canSeeTask(t, currentUser, participants));

    if (statusFilter !== "ALL") {
      filtered = filtered.filter((t) => t.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.code.toLowerCase().includes(q) ||
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [project, tasks, participants, currentUser, statusFilter, searchQuery]);

  // Project statistics
  const stats = useMemo(() => {
    if (!project || !currentUser) return { total: 0, completed: 0, inProgress: 0, overdue: 0, percent: 0 };
    const allPermittedInProj = tasks
      .filter((t) => t.projectId === project.id)
      .filter((t) => canSeeTask(t, currentUser, participants));

    const total = allPermittedInProj.length;
    const completed = allPermittedInProj.filter((t) => t.status === "DONE").length;
    const inProgress = allPermittedInProj.filter((t) => t.status === "IN_PROGRESS").length;
    const now = new Date();
    const overdue = allPermittedInProj.filter((t) => isTaskOverdue(t, now)).length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, inProgress, overdue, percent };
  }, [project, tasks, participants, currentUser]);

  // Handle Edit Project
  const handleUpdateProject = async () => {
    if (!project || !nameInput.trim()) return;
    setIsSubmitting(true);
    try {
      const updated = await workspaceRepository.updateProject(project.id, {
        name: nameInput.trim(),
        description: descInput.trim(),
        startAt: startInput ? new Date(startInput).toISOString() : null,
        endAt: endInput ? new Date(endInput).toISOString() : null,
        status: statusInput,
      });
      setProject(updated);
      setShowEditModal(false);
      showToast("Đã cập nhật thông tin dự án.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi cập nhật dự án", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isForbidden) {
    return (
      <ForbiddenPage
        message="Bạn không có quyền truy cập dự án này vì không được phân công nhiệm vụ nào thuộc dự án."
        resourceName={`Dự án ${id}`}
        backUrl="/projects"
      />
    );
  }

  if (isLoading) {
    return (
      <AppShell>
        <div className="space-y-6">
          <div className="h-6 w-48 bg-slate-200 rounded animate-pulse" />
          <div className="h-24 w-full bg-slate-200 rounded animate-pulse" />
          <div className="h-96 w-full bg-slate-200 rounded animate-pulse" />
        </div>
      </AppShell>
    );
  }

  if (!project) {
    return (
      <AppShell>
        <div className="text-center py-20 space-y-4 max-w-md mx-auto">
          <h2 className="text-xl font-bold text-text-primary">404 — Không tìm thấy dự án</h2>
          <p className="text-xs text-text-secondary leading-relaxed">
            Dự án bạn đang tìm kiếm không tồn tại trong hệ thống.
          </p>
          <div className="pt-2">
            <Link to="/projects">
              <Button variant="outline" size="sm" className="gap-2">
                <ArrowLeft className="w-4 h-4" /> Về danh mục dự án
              </Button>
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const owner = users.find((u) => u.id === project.ownerId);

  const columns = [
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
      header: "Tên công việc & Bàn giao",
      render: (t: Task) => {
        const overdue = isTaskOverdue(t);
        const dueSoon = isTaskDueSoon(t);
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Link
                to={`/tasks/${t.id}`}
                className="font-semibold text-text-primary hover:text-brand-700 hover:underline"
              >
                {t.title}
              </Link>
              {overdue && <OverdueBadge />}
              {!overdue && dueSoon && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" /> Gần hạn
                </span>
              )}
            </div>
            <div className="text-[11px] text-text-muted truncate max-w-md">
              {t.deliverable || "Chưa có quy định sản phẩm bàn giao."}
            </div>
          </div>
        );
      },
    },
    {
      key: "assignee",
      header: "Chủ trì",
      width: "160px",
      render: (t: Task) => {
        const u = users.find((user) => user.id === t.primaryAssigneeId);
        return (
          <div className="flex items-center gap-2">
            <UserAvatar name={u?.displayName || "—"} size="sm" />
            <span className="text-xs font-medium text-text-primary truncate">
              {u?.displayName || "Chưa giao"}
            </span>
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Trạng thái",
      width: "120px",
      render: (t: Task) => <StatusBadge status={t.status} />,
    },
    {
      key: "priority",
      header: "Ưu tiên",
      width: "100px",
      render: (t: Task) => <PriorityBadge priority={t.priority} />,
    },
    {
      key: "dueAt",
      header: "Hạn hoàn thành",
      width: "130px",
      render: (t: Task) => (
        <span className="text-xs text-text-secondary" title={formatDateTimeVN(t.dueAt)}>
          {t.dueAt ? formatRelativeVN(t.dueAt) : "—"}
        </span>
      ),
    },
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        <Breadcrumb
          items={[
            { label: "Dự án", href: "/projects" },
            { label: project.name },
          ]}
        />

        {/* Project Header Card */}
        <div className="bg-surface p-5 sm:p-6 rounded-card border border-border shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-brand-50 text-brand-800 border border-brand-200">
                  {project.id.toUpperCase()}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    project.status === "ACTIVE"
                      ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                      : "bg-slate-100 text-slate-700 border-slate-300"
                  }`}
                >
                  {project.status === "ACTIVE" ? "Đang triển khai" : "Đã lưu trữ"}
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight">
                {project.name}
              </h1>
              <div className="text-xs text-text-muted flex items-center gap-3 flex-wrap">
                <span>Chủ quản: <strong>{owner?.displayName || "—"}</strong></span>
                {project.startAt && <span>• Bắt đầu: {formatDateTimeVN(project.startAt)}</span>}
                {project.endAt && <span>• Hạn chót: {formatDateTimeVN(project.endAt)}</span>}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isManager && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowEditModal(true)}
                  className="gap-1.5 text-xs"
                >
                  <Edit className="w-3.5 h-3.5" /> Sửa thông tin
                </Button>
              )}
              {isManager && (
                <Link to="/tasks/create">
                  <Button
                    variant="primary"
                    size="sm"
                    className="gap-1.5 bg-brand-700 hover:bg-brand-800 text-white text-xs"
                  >
                    <PlusCircle className="w-3.5 h-3.5" /> Thêm việc vào dự án
                  </Button>
                </Link>
              )}
            </div>
          </div>

          <p className="text-xs sm:text-sm text-text-secondary leading-relaxed max-w-4xl">
            {project.description || "Chưa có mô tả mục tiêu cho dự án này."}
          </p>
        </div>

        {/* Project KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-text-muted text-[11px] font-bold uppercase">Tổng nhiệm vụ</div>
              <div className="font-mono font-bold text-xl text-text-primary mt-1">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-blue-700 text-[11px] font-bold uppercase">Đang làm</div>
              <div className="font-mono font-bold text-xl text-blue-900 mt-1">{stats.inProgress}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-emerald-700 text-[11px] font-bold uppercase">Hoàn thành</div>
              <div className="font-mono font-bold text-xl text-emerald-900 mt-1">{stats.completed}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-danger text-[11px] font-bold uppercase">Quá hạn</div>
              <div className="font-mono font-bold text-xl text-danger mt-1">{stats.overdue}</div>
            </CardContent>
          </Card>
          <Card className="col-span-2 sm:col-span-1">
            <CardContent className="p-4 text-center">
              <div className="text-brand-700 text-[11px] font-bold uppercase">Tỷ lệ xong</div>
              <div className="font-mono font-bold text-xl text-brand-800 mt-1">{stats.percent}%</div>
            </CardContent>
          </Card>
        </div>

        {/* Tasks in Project */}
        <Card>
          <CardHeader className="pb-3 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="w-4 h-4 text-brand-700" />
              Nhiệm vụ trong dự án ({visibleTasks.length})
            </CardTitle>

            <div className="flex items-center gap-2 flex-wrap">
              <Input
                placeholder="Tìm nhiệm vụ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-48 h-8 text-xs"
              />
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as TaskStatus | "ALL")}
                className="w-36 h-8 text-xs"
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="TODO">Chưa làm</option>
                <option value="IN_PROGRESS">Đang làm</option>
                <option value="IN_REVIEW">Chờ duyệt</option>
                <option value="DONE">Hoàn thành</option>
              </Select>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {visibleTasks.length === 0 ? (
              <EmptyState
                icon={<FolderKanban className="w-10 h-10 text-slate-400" />}
                title="Không có công việc nào trong dự án"
                description="Chưa có nhiệm vụ phù hợp với bộ lọc tìm kiếm hiện tại."
              />
            ) : (
              <>
                {/* Desktop View (>= 768px) */}
                <div className="hidden md:block">
                  <DataTable
                    data={visibleTasks}
                    columns={columns}
                    keyExtractor={(t) => t.id}
                  />
                </div>

                {/* Mobile View (< 768px) */}
                <div className="block md:hidden p-3 space-y-3">
                  {visibleTasks.map((t) => {
                    const isExpanded = expandedTaskIds.has(t.id);
                    const overdue = isTaskOverdue(t);
                    const dueSoon = isTaskDueSoon(t);
                    const assignee = users.find((u) => u.id === t.primaryAssigneeId);

                    return (
                      <div
                        key={t.id}
                        className="p-3.5 bg-surface rounded-card border border-border shadow-xs space-y-2.5"
                      >
                        {/* Top: Code & Badges */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                            <span className="font-mono font-bold text-xs bg-slate-100 text-brand-800 px-2 py-0.5 rounded">
                              {t.code}
                            </span>
                            {overdue && <OverdueBadge />}
                            {!overdue && dueSoon && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 flex items-center gap-0.5">
                                <Clock className="w-2.5 h-2.5" /> Gần hạn
                              </span>
                            )}
                          </div>
                          <StatusBadge status={t.status} />
                        </div>

                        {/* Title */}
                        <Link
                          to={`/tasks/${t.id}`}
                          className="font-bold text-sm text-text-primary hover:text-brand-700 block leading-snug"
                        >
                          {t.title}
                        </Link>

                        {/* Assignee & Due date */}
                        <div className="flex items-center justify-between text-xs text-text-secondary pt-0.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <UserAvatar name={assignee?.displayName || "—"} size="sm" />
                            <span className="font-medium text-text-primary truncate max-w-[120px]">
                              {assignee?.displayName || "Chưa giao"}
                            </span>
                          </div>

                          <div className="text-right shrink-0">
                            <span
                              className={`font-semibold block ${
                                overdue
                                  ? "text-danger"
                                  : dueSoon
                                  ? "text-amber-700"
                                  : "text-text-primary"
                              }`}
                            >
                              {formatDateTimeVN(t.dueAt)}
                            </span>
                            <span className="text-[10px] text-text-muted block">
                              {formatRelativeVN(t.dueAt)}
                            </span>
                          </div>
                        </div>

                        {/* Toggle expand */}
                        <button
                          type="button"
                          onClick={() => toggleExpand(t.id)}
                          className="w-full pt-1.5 border-t border-border/70 flex items-center justify-between text-xs text-brand-700 font-medium hover:text-brand-800 transition-colors"
                        >
                          <span>{isExpanded ? "Thu gọn chi tiết" : "Xem thêm (kết quả, ưu tiên, tiến độ)"}</span>
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>

                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="pt-2 border-t border-dashed border-border/70 space-y-2.5 text-xs bg-slate-50 p-2.5 rounded-lg">
                            {t.deliverable && (
                              <div>
                                <span className="font-semibold text-text-secondary block text-[11px] mb-0.5">
                                  Đầu ra kết quả:
                                </span>
                                <span className="text-text-primary">{t.deliverable}</span>
                              </div>
                            )}

                            <div>
                              <span className="text-[11px] text-text-muted block mb-0.5">Ưu tiên:</span>
                              <PriorityBadge priority={t.priority} />
                            </div>

                            <div>
                              <div className="flex items-center justify-between text-[11px] text-text-muted mb-1">
                                <span>Tiến độ hoàn thành:</span>
                                <span className="font-bold text-text-primary font-mono">{t.progressPercent}%</span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-brand-700 rounded-full"
                                  style={{ width: `${t.progressPercent}%` }}
                                />
                              </div>
                            </div>

                            <Link
                              to={`/tasks/${t.id}`}
                              className="block text-center w-full py-1.5 bg-brand-50 text-brand-700 font-semibold rounded hover:bg-brand-100 transition-colors"
                            >
                              Mở chi tiết đầy đủ →
                            </Link>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Modal: Sửa thông tin dự án (Manager) */}
        <ConfirmDialog
          isOpen={showEditModal}
          title="Chỉnh sửa thông tin dự án"
          description="Cập nhật tên, mô tả và thời gian triển khai của dự án."
          confirmLabel="Lưu thay đổi"
          isLoading={isSubmitting}
          onConfirm={handleUpdateProject}
          onCancel={() => setShowEditModal(false)}
        >
          <div className="space-y-4 pt-2 text-xs">
            <Input
              label="Tên dự án *"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              required
            />
            <Textarea
              label="Mô tả mục tiêu"
              rows={3}
              value={descInput}
              onChange={(e) => setDescInput(e.target.value)}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-text-primary mb-1">Ngày bắt đầu</label>
                <input
                  type="date"
                  value={startInput}
                  onChange={(e) => setStartInput(e.target.value)}
                  className="w-full h-10 px-3 rounded-btn bg-surface border border-border text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-700"
                />
              </div>
              <div>
                <label className="block font-semibold text-text-primary mb-1">Ngày kết thúc dự kiến</label>
                <input
                  type="date"
                  value={endInput}
                  onChange={(e) => setEndInput(e.target.value)}
                  className="w-full h-10 px-3 rounded-btn bg-surface border border-border text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-700"
                />
              </div>
            </div>
            <Select
              label="Trạng thái triển khai"
              value={statusInput}
              onChange={(e) => setStatusInput(e.target.value as "ACTIVE" | "ARCHIVED")}
            >
              <option value="ACTIVE">Đang triển khai (ACTIVE)</option>
              <option value="ARCHIVED">Đã lưu trữ (ARCHIVED)</option>
            </Select>
          </div>
        </ConfirmDialog>
      </div>
    </AppShell>
  );
}
