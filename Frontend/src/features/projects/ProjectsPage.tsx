import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { useSession } from "../auth/SessionContext";
import { mockRepository } from "../../mocks/mock-repository";
import { canSeeTask, isTaskOverdue } from "../../shared/data-contract";
import type { Project, Task, TaskParticipant } from "../../shared/data-contract";
import {
  Breadcrumb,
  PageHeader,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  Input,
  Textarea,
  EmptyState,
  useToast,
  UserAvatar,
} from "../../components/ui";
import { formatDateTimeVN } from "../../shared/datetime";
import {
  PlusCircle,
  Calendar,
  ArrowRight,
  FolderOpen,
} from "lucide-react";

export function ProjectsPage() {
  const { currentUser, isManager, users } = useSession();
  const { showToast } = useToast();

  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [participants, setParticipants] = useState<TaskParticipant[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Create Project Modal state (Manager only)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [projectStart, setProjectStart] = useState("");
  const [projectEnd, setProjectEnd] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [projList, taskList, partList] = await Promise.all([
        mockRepository.getProjects(),
        mockRepository.getTasks(),
        mockRepository.getParticipants(),
      ]);
      setProjects(projList);
      setTasks(taskList);
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

  // Filter projects by permission:
  // Manager sees all projects.
  // Staff only sees projects where they have at least one permitted task OR own the project.
  const visibleProjects = useMemo(() => {
    if (!currentUser) return [];
    if (isManager) return projects;

    return projects.filter((proj) => {
      if (proj.ownerId === currentUser.id) return true;
      const projTasks = tasks.filter((t) => t.projectId === proj.id);
      return projTasks.some((t) => canSeeTask(t, currentUser, participants));
    });
  }, [projects, tasks, participants, currentUser, isManager]);

  // Compute stats dynamically for each project from selectors
  const getProjectStats = (projId: string) => {
    const projTasks = tasks.filter((t) => t.projectId === projId);
    const visibleProjTasks = projTasks.filter((t) =>
      currentUser ? canSeeTask(t, currentUser, participants) : false
    );
    const total = visibleProjTasks.length;
    const completed = visibleProjTasks.filter((t) => t.status === "DONE").length;
    const inProgress = visibleProjTasks.filter((t) => t.status === "IN_PROGRESS").length;
    const now = new Date();
    const overdue = visibleProjTasks.filter((t) => isTaskOverdue(t, now)).length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, inProgress, overdue, percent };
  };

  const handleCreateProject = async () => {
    if (!currentUser || !projectName.trim()) {
      showToast("Vui lòng nhập tên dự án", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      const newProj = await mockRepository.createProject({
        name: projectName.trim(),
        description: projectDesc.trim(),
        ownerId: currentUser.id,
        startAt: projectStart ? new Date(projectStart).toISOString() : null,
        endAt: projectEnd ? new Date(projectEnd).toISOString() : null,
        status: "ACTIVE",
      });
      showToast(`Đã tạo thành công dự án: ${newProj.name}`, "success");
      setShowCreateModal(false);
      setProjectName("");
      setProjectDesc("");
      setProjectStart("");
      setProjectEnd("");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi tạo dự án", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <Breadcrumb items={[{ label: "Dự án" }]} />

        <PageHeader
          title="Danh mục Dự án & Kế hoạch"
          subtitle="Quản lý các dự án trọng điểm của đơn vị và theo dõi tiến độ các nhiệm vụ liên quan."
          actions={
            isManager && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowCreateModal(true)}
                className="gap-1.5 bg-brand-700 hover:bg-brand-800 text-white"
              >
                <PlusCircle className="w-4 h-4" /> Thêm dự án mới
              </Button>
            )
          }
        />

        {/* Projects Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="h-48 bg-slate-100 rounded-card animate-pulse" />
            <div className="h-48 bg-slate-100 rounded-card animate-pulse" />
          </div>
        ) : visibleProjects.length === 0 ? (
          <EmptyState
            icon={<FolderOpen className="w-10 h-10 text-slate-400" />}
            title="Chưa có dự án nào"
            description={
              isManager
                ? "Bấm vào nút 'Thêm dự án mới' ở trên để khởi tạo dự án đầu tiên."
                : "Bạn chưa được phân công nhiệm vụ nào thuộc các dự án đang triển khai."
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {visibleProjects.map((proj) => {
              const stats = getProjectStats(proj.id);
              const owner = users.find((u) => u.id === proj.ownerId);

              return (
                <Card key={proj.id} className="hover:shadow-card transition-shadow">
                  <CardContent className="p-5 sm:p-6 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-brand-50 text-brand-800 border border-brand-200">
                            {proj.id.toUpperCase()}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              proj.status === "ACTIVE"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                : "bg-slate-100 text-slate-700 border-slate-300"
                            }`}
                          >
                            {proj.status === "ACTIVE" ? "Đang triển khai" : "Đã lưu trữ"}
                          </span>
                        </div>
                        <h3 className="font-bold text-base text-text-primary truncate">
                          <Link
                            to={`/projects/${proj.id}`}
                            className="hover:text-brand-700 hover:underline"
                          >
                            {proj.name}
                          </Link>
                        </h3>
                      </div>

                      <Link to={`/projects/${proj.id}`}>
                        <Button variant="outline" size="sm" className="gap-1 text-xs">
                          Chi tiết <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
                    </div>

                    <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">
                      {proj.description || "Chưa có mô tả chi tiết cho dự án này."}
                    </p>

                    {/* Progress bar */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-text-muted">Tiến độ dự án:</span>
                        <span className="font-mono text-brand-800">{stats.percent}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-700 rounded-full transition-all duration-300"
                          style={{ width: `${stats.percent}%` }}
                        />
                      </div>
                    </div>

                    {/* Stats counters */}
                    <div className="grid grid-cols-4 gap-2 pt-2 border-t border-border text-center text-xs">
                      <div className="p-2 rounded bg-slate-50">
                        <div className="text-text-muted text-[10px] uppercase font-bold">Tổng việc</div>
                        <div className="font-mono font-bold text-sm text-text-primary mt-0.5">
                          {stats.total}
                        </div>
                      </div>
                      <div className="p-2 rounded bg-blue-50/60 text-blue-900">
                        <div className="text-[10px] uppercase font-bold text-blue-700">Đang làm</div>
                        <div className="font-mono font-bold text-sm mt-0.5">{stats.inProgress}</div>
                      </div>
                      <div className="p-2 rounded bg-emerald-50/60 text-emerald-900">
                        <div className="text-[10px] uppercase font-bold text-emerald-700">Đã xong</div>
                        <div className="font-mono font-bold text-sm mt-0.5">{stats.completed}</div>
                      </div>
                      <div className="p-2 rounded bg-red-50/60 text-danger">
                        <div className="text-[10px] uppercase font-bold text-red-600">Quá hạn</div>
                        <div className="font-mono font-bold text-sm mt-0.5">{stats.overdue}</div>
                      </div>
                    </div>

                    {/* Footer Info */}
                    <div className="flex items-center justify-between text-[11px] text-text-muted pt-2 border-t border-border/60">
                      <div className="flex items-center gap-1.5">
                        <span>Chủ quản:</span>
                        <span className="font-medium text-text-primary flex items-center gap-1">
                          <UserAvatar name={owner?.displayName || "—"} size="sm" />
                          {owner?.displayName}
                        </span>
                      </div>

                      {proj.endAt && (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-text-muted" />
                          <span>Hạn chót: {formatDateTimeVN(proj.endAt)}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Modal: Thêm dự án mới (Manager) */}
        <ConfirmDialog
          isOpen={showCreateModal}
          title="Tạo dự án mới"
          description="Khởi tạo không gian dự án để gom nhóm và theo dõi các nhiệm vụ chiến lược."
          confirmLabel="Tạo dự án"
          isLoading={isSubmitting}
          onConfirm={handleCreateProject}
          onCancel={() => setShowCreateModal(false)}
        >
          <div className="space-y-4 pt-2 text-xs">
            <Input
              label="Tên dự án *"
              placeholder="Ví dụ: Nâng cấp cổng thông tin dịch vụ công..."
              required
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />

            <Textarea
              label="Mô tả mục tiêu dự án"
              placeholder="Nêu rõ phạm vi, mục tiêu và kết quả kỳ vọng..."
              rows={3}
              value={projectDesc}
              onChange={(e) => setProjectDesc(e.target.value)}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-text-primary mb-1">Ngày bắt đầu</label>
                <input
                  type="date"
                  value={projectStart}
                  onChange={(e) => setProjectStart(e.target.value)}
                  className="w-full h-10 px-3 rounded-btn bg-surface border border-border text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-700"
                />
              </div>
              <div>
                <label className="block font-semibold text-text-primary mb-1">Ngày kết thúc dự kiến</label>
                <input
                  type="date"
                  value={projectEnd}
                  onChange={(e) => setProjectEnd(e.target.value)}
                  className="w-full h-10 px-3 rounded-btn bg-surface border border-border text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-700"
                />
              </div>
            </div>
          </div>
        </ConfirmDialog>
      </div>
    </AppShell>
  );
}
