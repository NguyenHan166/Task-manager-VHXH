import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { useSession } from "../auth/SessionContext";
import { workspaceRepository } from "../../shared/repository";
import type { Task, TaskPriority, TaskStatus } from "../../shared/data-contract";
import {
  Breadcrumb,
  PageHeader,
  Button,
  StatusBadge,
  PriorityBadge,
  OverdueBadge,
  DataTable,
  EmptyState,
  ConfirmDialog,
  Input,
  Textarea,
  Select,
  useToast,
} from "../../components/ui";
import { formatDateTimeVN, formatRelativeVN } from "../../shared/datetime";
import {
  User,
  PlusCircle,
  Lock,
  Edit2,
  Trash2,
  CheckCircle2,
  Play,
  RotateCcw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export function PersonalTasksPage() {
  const { currentUser } = useSession();
  const { showToast } = useToast();

  const [personalTasks, setPersonalTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "DONE">("ALL");
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Create Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newDeliverable, setNewDeliverable] = useState("");
  const [newPriority, setNewPriority] = useState<TaskPriority>("NORMAL");
  const [newDueDate, setNewDueDate] = useState("");
  const [newDueTime, setNewDueTime] = useState("17:30");

  // Edit Modal
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editDeliverable, setEditDeliverable] = useState("");
  const [editPriority, setEditPriority] = useState<TaskPriority>("NORMAL");

  // Delete Dialog
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);

  const loadPersonalTasks = async () => {
    if (!currentUser) return;
    setIsLoading(true);
    try {
      const allTasks = await workspaceRepository.getTasks();
      const myPersonal = allTasks.filter(
        (t) => t.type === "PERSONAL" && t.createdById === currentUser.id
      );
      setPersonalTasks(myPersonal);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPersonalTasks();
    const unsub = workspaceRepository.subscribe(loadPersonalTasks);
    return unsub;
  }, [currentUser]);

  const filteredTasks = useMemo(() => {
    return personalTasks.filter((t) => {
      if (statusFilter === "ACTIVE") return t.status !== "DONE";
      if (statusFilter === "DONE") return t.status === "DONE";
      return true;
    });
  }, [personalTasks, statusFilter]);

  // Handle Quick Status
  const handleQuickStatus = async (task: Task, newStatus: TaskStatus) => {
    if (!currentUser) return;
    try {
      await workspaceRepository.changeTaskStatus(
        task.id,
        newStatus,
        currentUser.id,
        `Chuyển trạng thái việc cá nhân sang ${newStatus}`
      );
      showToast(`Đã chuyển việc [${task.code}] sang ${newStatus}`, "success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Thao tác thất bại";
      showToast(msg, "error");
    }
  };

  // Handle Create
  const handleCreatePersonalTask = async () => {
    if (!currentUser) return;
    if (!newTitle.trim()) {
      showToast("Vui lòng nhập tên công việc cá nhân", "error");
      return;
    }

    try {
      let dueAt: string | null = null;
      if (newDueDate) {
        const timePart = newDueTime || "17:30";
        dueAt = new Date(`${newDueDate}T${timePart}:00+07:00`).toISOString();
      }

      const created = await workspaceRepository.createTask(
        {
          type: "PERSONAL",
          title: newTitle.trim(),
          description: newDesc.trim(),
          deliverable: newDeliverable.trim() || "Ghi chú hoàn thành cá nhân",
          priority: newPriority,
          primaryAssigneeId: currentUser.id,
          collaboratorIds: [],
          watcherIds: [],
          dueAt,
          projectId: null,
          parentTaskId: null,
          isDraft: false,
        },
        currentUser.id
      );

      showToast(`Đã tạo việc cá nhân [${created.code}] thành công`, "success");
      setIsCreateOpen(false);
      setNewTitle("");
      setNewDesc("");
      setNewDeliverable("");
      setNewDueDate("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể tạo việc cá nhân";
      showToast(msg, "error");
    }
  };

  // Open Edit
  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditDesc(task.description || "");
    setEditDeliverable(task.deliverable || "");
    setEditPriority(task.priority);
  };

  // Handle Save Edit
  const handleSaveEdit = async () => {
    if (!currentUser || !editingTask) return;
    if (!editTitle.trim()) {
      showToast("Vui lòng nhập tên công việc", "error");
      return;
    }

    try {
      await workspaceRepository.updateTask(
        editingTask.id,
        {
          title: editTitle.trim(),
          description: editDesc.trim(),
          deliverable: editDeliverable.trim(),
          priority: editPriority,
        },
        currentUser.id
      );
      showToast(`Đã cập nhật việc cá nhân [${editingTask.code}]`, "success");
      setEditingTask(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể cập nhật";
      showToast(msg, "error");
    }
  };

  // Handle Delete
  const handleDeleteTask = async () => {
    if (!currentUser || !deletingTask) return;
    try {
      await workspaceRepository.deletePersonalTask(deletingTask.id, currentUser.id);
      showToast(`Đã xóa việc cá nhân [${deletingTask.code}]`, "success");
      setDeletingTask(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể xóa việc";
      showToast(msg, "error");
    }
  };

  const columns = [
    {
      key: "code",
      header: "Mã việc",
      width: "110px",
      render: (t: Task) => (
        <span className="font-mono font-semibold text-text-primary">{t.code}</span>
      ),
    },
    {
      key: "title",
      header: "Nội dung & Ghi chú cá nhân",
      render: (t: Task) => (
        <div className="space-y-0.5 max-w-md">
          <Link
            to={`/tasks/${t.id}`}
            className="font-semibold text-text-primary hover:text-brand-700 hover:underline"
          >
            {t.title}
          </Link>
          {t.description && (
            <div className="text-xs text-text-secondary line-clamp-1">
              {t.description}
            </div>
          )}
          {t.deliverable && (
            <div className="text-[11px] text-text-muted italic">
              Đầu ra: {t.deliverable}
            </div>
          )}
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
      key: "priority",
      header: "Ưu tiên",
      width: "110px",
      render: (t: Task) => <PriorityBadge priority={t.priority} />,
    },
    {
      key: "dueAt",
      header: "Hạn thực hiện",
      width: "130px",
      render: (t: Task) => (
        <span className="text-text-secondary text-xs" title={formatDateTimeVN(t.dueAt)}>
          {t.dueAt ? formatRelativeVN(t.dueAt) : "Không có hạn"}
        </span>
      ),
    },
    {
      key: "quickActions",
      header: "Thao tác nhanh",
      width: "220px",
      render: (t: Task) => (
        <div className="flex items-center gap-1.5">
          {t.status === "TODO" && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs gap-1 text-brand-700 hover:bg-brand-50"
              onClick={() => handleQuickStatus(t, "IN_PROGRESS")}
            >
              <Play className="w-3 h-3" /> Bắt đầu
            </Button>
          )}
          {t.status === "IN_PROGRESS" && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs gap-1 text-emerald-700 hover:bg-emerald-50"
              onClick={() => handleQuickStatus(t, "DONE")}
            >
              <CheckCircle2 className="w-3 h-3" /> Hoàn thành
            </Button>
          )}
          {t.status === "DONE" && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs gap-1 text-slate-600 hover:bg-slate-50"
              onClick={() => handleQuickStatus(t, "IN_PROGRESS")}
            >
              <RotateCcw className="w-3 h-3" /> Mở lại
            </Button>
          )}

          <button
            onClick={() => openEditModal(t)}
            title="Sửa thông tin"
            className="p-1.5 text-text-muted hover:text-brand-700 rounded hover:bg-slate-100 transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setDeletingTask(t)}
            title="Xóa công việc"
            className="p-1.5 text-text-muted hover:text-danger-600 rounded hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        <Breadcrumb items={[{ label: "Việc cá nhân" }]} />

        <PageHeader
          title="Việc cá nhân (Personal Tasks)"
          subtitle="Không gian công việc riêng tư của bạn. Không tính vào KPI đơn vị và Trưởng phòng hoặc nhân viên khác không thể xem."
          badge={
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" /> Riêng tư tuyệt đối
            </span>
          }
          actions={
            <Button
              variant="primary"
              size="sm"
              className="gap-1.5"
              onClick={() => setIsCreateOpen(true)}
            >
              <PlusCircle className="w-3.5 h-3.5" /> Thêm việc cá nhân
            </Button>
          }
        />

        {/* Status filter tabs */}
        <div className="flex items-center gap-2 border-b border-border/80 pb-2">
          <button
            onClick={() => setStatusFilter("ALL")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              statusFilter === "ALL"
                ? "bg-brand-50 text-brand-700 font-bold"
                : "text-text-secondary hover:text-text-primary hover:bg-slate-100"
            }`}
          >
            Tất cả ({personalTasks.length})
          </button>
          <button
            onClick={() => setStatusFilter("ACTIVE")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              statusFilter === "ACTIVE"
                ? "bg-brand-50 text-brand-700 font-bold"
                : "text-text-secondary hover:text-text-primary hover:bg-slate-100"
            }`}
          >
            Chưa hoàn thành ({personalTasks.filter((t) => t.status !== "DONE").length})
          </button>
          <button
            onClick={() => setStatusFilter("DONE")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              statusFilter === "DONE"
                ? "bg-brand-50 text-brand-700 font-bold"
                : "text-text-secondary hover:text-text-primary hover:bg-slate-100"
            }`}
          >
            Đã hoàn thành ({personalTasks.filter((t) => t.status === "DONE").length})
          </button>
        </div>

        {filteredTasks.length === 0 && !isLoading ? (
          <EmptyState
            title="Chưa có việc cá nhân nào"
            description="Tạo việc cá nhân để ghi chú danh sách công việc cần nhớ hoặc tài liệu riêng của bạn."
            icon={<User className="w-8 h-8 text-slate-400" />}
            action={
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsCreateOpen(true)}
              >
                <PlusCircle className="w-3.5 h-3.5 mr-1" /> Tạo việc cá nhân đầu tiên
              </Button>
            }
          />
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block">
              <DataTable
                columns={columns}
                data={filteredTasks}
                keyExtractor={(t) => t.id}
                isLoading={isLoading}
              />
            </div>

            {/* Mobile Cards List View */}
            <div className="block md:hidden space-y-3">
              {filteredTasks.map((t) => {
                const isExpanded = expandedTaskIds.has(t.id);
                const isOverdue = t.dueAt && t.status !== "DONE" && new Date(t.dueAt) < new Date();

                return (
                  <div
                    key={t.id}
                    className="p-3.5 bg-surface rounded-card border border-border shadow-xs space-y-2.5"
                  >
                    {/* Top: Code & Badges */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono font-bold text-xs bg-slate-100 text-text-primary px-2 py-0.5 rounded">
                          {t.code}
                        </span>
                        <PriorityBadge priority={t.priority} />
                        {isOverdue && <OverdueBadge className="px-2 py-0.5 text-[10px]" />}
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

                    {/* Due Date Row */}
                    <div className="flex items-center justify-between text-xs text-text-secondary pt-0.5">
                      <span className="text-[11px] text-text-muted">Hạn thực hiện:</span>
                      <div className="text-right">
                        <span
                          className={`font-medium ${
                            isOverdue ? "text-danger font-semibold" : "text-text-primary"
                          }`}
                        >
                          {t.dueAt ? formatDateTimeVN(t.dueAt) : "Không có hạn"}
                        </span>
                        {t.dueAt && (
                          <span className="text-[10px] text-text-muted block">
                            {formatRelativeVN(t.dueAt)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expand Button if Description or Deliverable exists */}
                    {(t.description || t.deliverable) && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(t.id)}
                        className="w-full pt-1.5 border-t border-border/70 flex items-center justify-between text-xs text-brand-700 font-medium hover:text-brand-800 transition-colors"
                      >
                        <span>{isExpanded ? "Thu gọn ghi chú" : "Xem chi tiết nội dung & ghi chú"}</span>
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    )}

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="pt-2 border-t border-dashed border-border/70 space-y-2 text-xs bg-slate-50 p-2.5 rounded-lg">
                        {t.description && (
                          <div>
                            <span className="font-semibold text-text-secondary block text-[11px] mb-0.5">
                              Mô tả:
                            </span>
                            <span className="text-text-primary whitespace-pre-line">{t.description}</span>
                          </div>
                        )}
                        {t.deliverable && (
                          <div>
                            <span className="font-semibold text-text-secondary block text-[11px] mb-0.5">
                              Đầu ra cần đạt:
                            </span>
                            <span className="text-text-primary italic">{t.deliverable}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Quick Actions Footer */}
                    <div className="pt-2 border-t border-border/70 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {t.status === "TODO" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 text-xs gap-1 text-brand-700 hover:bg-brand-50"
                            onClick={() => handleQuickStatus(t, "IN_PROGRESS")}
                          >
                            <Play className="w-3.5 h-3.5" /> Bắt đầu
                          </Button>
                        )}
                        {t.status === "IN_PROGRESS" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 text-xs gap-1 text-emerald-700 hover:bg-emerald-50"
                            onClick={() => handleQuickStatus(t, "DONE")}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Hoàn thành
                          </Button>
                        )}
                        {t.status === "DONE" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 text-xs gap-1 text-slate-600 hover:bg-slate-50"
                            onClick={() => handleQuickStatus(t, "IN_PROGRESS")}
                          >
                            <RotateCcw className="w-3.5 h-3.5" /> Mở lại
                          </Button>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEditModal(t)}
                          title="Sửa thông tin"
                          className="p-2 text-text-muted hover:text-brand-700 rounded-btn hover:bg-slate-100 transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeletingTask(t)}
                          title="Xóa công việc"
                          className="p-2 text-text-muted hover:text-danger-600 rounded-btn hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Modal Thêm việc cá nhân */}
        <ConfirmDialog
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          onConfirm={handleCreatePersonalTask}
          title="Thêm việc cá nhân mới"
          confirmText="Lưu việc cá nhân"
          cancelText="Hủy"
        >
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-text-secondary">
                Tiêu đề việc cá nhân <span className="text-danger-600">*</span>
              </label>
              <Input
                placeholder="VD: Chuẩn bị slide báo cáo, ôn tập quy chế..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-text-secondary">
                  Mức độ ưu tiên
                </label>
                <Select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
                >
                  <option value="LOW">Thấp (LOW)</option>
                  <option value="NORMAL">Bình thường (NORMAL)</option>
                  <option value="HIGH">Cao (HIGH)</option>
                  <option value="URGENT">Khẩn cấp (URGENT)</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-text-secondary">
                  Hạn hoàn thành (Tùy chọn)
                </label>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                  />
                  <Input
                    type="time"
                    className="w-24"
                    value={newDueTime}
                    onChange={(e) => setNewDueTime(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-text-secondary">
                Kết quả mong đợi / Đầu ra ghi chú
              </label>
              <Input
                placeholder="VD: Slide PPT hoàn chỉnh, tài liệu tổng hợp..."
                value={newDeliverable}
                onChange={(e) => setNewDeliverable(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-text-secondary">
                Chi tiết ghi chú
              </label>
              <Textarea
                rows={3}
                placeholder="Ghi chú thêm các đường dẫn, tài liệu liên quan..."
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
            </div>
          </div>
        </ConfirmDialog>

        {/* Modal Sửa việc cá nhân */}
        <ConfirmDialog
          isOpen={!!editingTask}
          onClose={() => setEditingTask(null)}
          onConfirm={handleSaveEdit}
          title={`Sửa việc cá nhân [${editingTask?.code || ""}]`}
          confirmText="Cập nhật"
          cancelText="Hủy"
        >
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-text-secondary">
                Tiêu đề công việc <span className="text-danger-600">*</span>
              </label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-text-secondary">
                Mức độ ưu tiên
              </label>
              <Select
                value={editPriority}
                onChange={(e) => setEditPriority(e.target.value as TaskPriority)}
              >
                <option value="LOW">Thấp (LOW)</option>
                <option value="NORMAL">Bình thường (NORMAL)</option>
                <option value="HIGH">Cao (HIGH)</option>
                <option value="URGENT">Khẩn cấp (URGENT)</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-text-secondary">
                Kết quả mong đợi
              </label>
              <Input
                value={editDeliverable}
                onChange={(e) => setEditDeliverable(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-text-secondary">
                Ghi chú chi tiết
              </label>
              <Textarea
                rows={3}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
              />
            </div>
          </div>
        </ConfirmDialog>

        {/* Modal Xóa việc cá nhân */}
        <ConfirmDialog
          isOpen={!!deletingTask}
          onClose={() => setDeletingTask(null)}
          onConfirm={handleDeleteTask}
          variant="danger"
          title="Xác nhận xóa việc cá nhân"
          description={`Bạn có chắc chắn muốn xóa công việc cá nhân [${deletingTask?.code}] "${deletingTask?.title}"? Dữ liệu sẽ bị xóa hoàn toàn.`}
          confirmText="Xóa vĩnh viễn"
          cancelText="Giữ lại"
        />
      </div>
    </AppShell>
  );
}
