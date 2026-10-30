import { useState, useMemo, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSession } from "../auth/SessionContext";
import { workspaceRepository, httpRepository, isMockMode } from "../../shared/repository";
import { setSidebarCounts, type SidebarCounts } from "../../shared/sidebar-counts";
import type { Task, TaskParticipant } from "../../shared/data-contract";
import {
  getStaffDashboardStats,
  getStaffTodoList,
  getStaffWeekCalendar,
  isTaskOverdue,
  isTaskDueSoon,
} from "../tasks/task-selectors";
import {
  StatCard,
  StatusBadge,
  DueSoonBadge,
  OverdueBadge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  SkeletonCard,
} from "../../components/ui";
import { formatRelativeVN } from "../../shared/datetime";
import {
  CheckSquare,
  Users,
  Clock,
  AlertTriangle,
  FileText,
  User,
  PlusCircle,
  Calendar,
  Lock,
  ArrowRight,
  ChevronRight,
} from "lucide-react";

export function StaffDashboard() {
  const { currentUser } = useSession();
  const navigate = useNavigate();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [participants, setParticipants] = useState<TaskParticipant[]>([]);
  const [apiStaffStats, setApiStaffStats] = useState<Awaited<ReturnType<typeof httpRepository.getDashboardStats>> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    setIsLoading(true);
    try {
      if (isMockMode) {
        const [allTasks, allParts] = await Promise.all([
          workspaceRepository.getTasks(),
          workspaceRepository.getParticipants(),
        ]);
        setTasks(allTasks);
        setParticipants(allParts);
      } else {
        const [stats, allTasks] = await Promise.all([
          httpRepository.getDashboardStats("STAFF"),
          httpRepository.queryAllTasks({ page: 1, pageSize: 100, sortBy: "DUE_AT", sortDirection: "ASC" }),
        ]);
        const allParts = await httpRepository.getParticipantsForTasks(allTasks.map((task) => task.id));
        if (currentUser && stats.sidebarCounts && typeof stats.sidebarCounts === "object") {
          setSidebarCounts(currentUser.id, stats.sidebarCounts as SidebarCounts);
        }
        setApiStaffStats(stats);
        setTasks(allTasks);
        setParticipants(allParts);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const unsub = workspaceRepository.subscribe(loadData);
    return unsub;
  }, []);

  const now = useMemo(() => new Date(), []);

  // Compute staff metrics
  const staffStats = useMemo(() => {
    if (!currentUser) return null;
    if (!isMockMode && apiStaffStats) return apiStaffStats as unknown as ReturnType<typeof getStaffDashboardStats>;
    return getStaffDashboardStats(tasks, currentUser, participants, now);
  }, [tasks, currentUser, participants, now, apiStaffStats]);

  // Compute todo list sorted by urgency
  const todoList = useMemo(() => {
    if (!currentUser) return [];
    return getStaffTodoList(tasks, currentUser, participants, now);
  }, [tasks, currentUser, participants, now]);

  // Compute week calendar
  const weekCalendar = useMemo(() => {
    if (!currentUser) return [];
    return getStaffWeekCalendar(tasks, currentUser, participants, now);
  }, [tasks, currentUser, participants, now]);

  // Personal tasks
  const personalTasks = useMemo(() => {
    if (!currentUser) return [];
    return tasks.filter(
      (t) => t.type === "PERSONAL" && t.createdById === currentUser.id && t.status !== "CANCELLED"
    );
  }, [tasks, currentUser]);

  if (isLoading || !currentUser || !staffStats) {
    return (
      <div className="space-y-6">
        <div className="h-12 w-64 bg-slate-200 rounded animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {/* 1. Header with dynamic greeting based on current session */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/80">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1">
              <User className="w-3.5 h-3.5" /> Bàn làm việc Chuyên viên
            </span>
            <span className="text-xs text-text-muted">
              {new Intl.DateTimeFormat("vi-VN", { dateStyle: "full" }).format(now)}
            </span>
          </div>
          <h1 className="text-2xl sm:text-[28px] font-bold text-text-primary tracking-tight mt-1">
            Chào {currentUser.displayName}!
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Chúc bạn một ngày làm việc hiệu quả. Dưới đây là các nhiệm vụ bạn cần tập trung xử lý.
          </p>
        </div>

        {isMockMode && (
          <div className="flex items-center gap-2.5 shrink-0">
            <Link to="/tasks/create">
              <Button variant="primary" size="md" className="gap-2 shadow-sm">
                <PlusCircle className="w-4 h-4" /> Tạo việc mới
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* 2. Row of 5 Staff KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
        {/* Assigned */}
        <StatCard
          label="Việc tôi chủ trì"
          value={String(staffStats.totalAssigned).padStart(2, "0")}
          description="Chịu trách nhiệm chính"
          variant="brand"
          icon={<CheckSquare className="w-5 h-5" />}
          onClick={() => navigate("/tasks?scope=OWNED")}
        />

        {/* Collaborating */}
        <StatCard
          label="Việc phối hợp"
          value={String(staffStats.collaboratingCount).padStart(2, "0")}
          description="Đã nhận lời mời"
          variant="review"
          icon={<Users className="w-5 h-5" />}
          onClick={() => navigate("/tasks?scope=COLLABORATING")}
        />

        {/* Due soon */}
        <StatCard
          label="Sắp đến hạn"
          value={String(staffStats.dueSoonCount).padStart(2, "0")}
          description="Trong 48 giờ tới"
          variant="warning"
          icon={<Clock className="w-5 h-5" />}
          onClick={() => navigate("/tasks")}
        />

        {/* Overdue */}
        <StatCard
          label="Quá hạn"
          value={String(staffStats.overdueCount).padStart(2, "0")}
          description="Cần khẩn trương xử lý"
          variant="danger"
          icon={<AlertTriangle className="w-5 h-5" />}
          onClick={() => navigate("/tasks")}
        />

        {/* In review */}
        <StatCard
          label="Chờ duyệt"
          value={String(staffStats.inReviewCount).padStart(2, "0")}
          description="Đã gửi báo cáo"
          variant="info"
          icon={<FileText className="w-5 h-5" />}
          className="col-span-2 sm:col-span-1"
          onClick={() => navigate("/tasks?status=IN_REVIEW")}
        />
      </div>

      {/* 3. Main Grid: Todo List (Left 8 cols) & Mini Calendar + Personal Tasks (Right 4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (8 cols): Danh sách việc cần làm sắp xếp theo độ khẩn */}
        <div className="lg:col-span-8 space-y-6">
          <Card>
            <CardHeader className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-brand-700" />
                  Việc cần xử lý <span className="text-text-muted">({todoList.length})</span>
                </CardTitle>
                <CardDescription className="mt-1">Ưu tiên việc quá hạn và sắp đến hạn.</CardDescription>
              </div>
              <Link to="/tasks" className="self-start shrink-0">
                <Button variant="ghost" size="sm" className="text-xs text-brand-700">
                  Tất cả công việc <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-2 p-3 sm:p-4">
              {todoList.length === 0 ? (
                <div className="p-8 text-center text-text-muted text-xs">
                  Hiện bạn không có công việc nào đang tồn đọng.
                </div>
              ) : (
                <div className="space-y-2">
                  {todoList.slice(0, 5).map((t) => {
                    const isAssignee = t.primaryAssigneeId === currentUser.id;
                    const overdue = isTaskOverdue(t, now);
                    const dueSoon = !overdue && isTaskDueSoon(t, 48, now);

                    return (
                      <Link
                        key={t.id}
                        to={`/tasks/${t.id}`}
                        className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors hover:bg-slate-50 ${overdue ? "border-red-200" : "border-border"}`}
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-[10px] font-semibold text-text-muted">{t.code}</span>
                            <StatusBadge status={t.status} />
                            {overdue && <OverdueBadge className="px-2 py-0.5 text-[10px]" />}
                            {dueSoon && <DueSoonBadge className="px-2 py-0.5 text-[10px]" />}
                          </div>
                          <div className="truncate text-sm font-semibold text-text-primary">{t.title}</div>
                          <div className="flex flex-wrap gap-x-3 text-[11px] text-text-muted">
                            <span>{isAssignee ? "Chủ trì" : "Phối hợp"}</span>
                            <span className={overdue ? "font-semibold text-danger" : dueSoon ? "font-semibold text-amber-700" : ""}>
                              Hạn {t.dueAt ? formatRelativeVN(t.dueAt) : "chưa xác định"}
                            </span>
                          </div>
                        </div>
                        <div className="w-10 shrink-0 text-right">
                          <div className="text-[10px] font-bold font-mono text-text-secondary">{t.progressPercent}%</div>
                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-brand-700" style={{ width: `${t.progressPercent}%` }} />
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column (4 cols): Mini Week Calendar & Khu vực việc cá nhân */}
        <div className="lg:col-span-4 space-y-6">
          {/* Lịch tuần thu nhỏ (Mini 7-day Week Calendar) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-brand-700" />
                Lịch tuần thu nhỏ
              </CardTitle>
              <CardDescription>
                Hạn hoàn thành các công việc trong tuần hiện tại.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-2">
              <div className="grid grid-cols-7 gap-1 text-center select-none">
                {weekCalendar.map((day) => (
                  <div
                    key={day.dateKey}
                    className={`p-2 rounded-btn border text-xs transition-colors ${
                      day.isToday
                        ? "bg-brand-50 border-brand-700 font-bold text-brand-800 ring-1 ring-brand-700"
                        : day.tasks.length > 0
                        ? "bg-surface border-border hover:bg-slate-50 text-text-primary"
                        : "bg-slate-50/50 border-transparent text-text-muted"
                    }`}
                  >
                    <div className="text-[10px] font-medium">{day.dayLabel}</div>
                    <div className="text-sm font-mono mt-0.5">{day.formattedDate.split("/")[0]}</div>
                    <div className="mt-1">
                      {day.tasks.length > 0 ? (
                        <span className="inline-block w-4 h-4 rounded-full bg-brand-700 text-white text-[10px] font-bold leading-4">
                          {day.tasks.length}
                        </span>
                      ) : (
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-200" />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Tasks due today or nearby in calendar */}
              <div className="pt-2 space-y-1.5 border-t border-border/70 text-xs">
                <div className="font-semibold text-text-secondary text-[11px] uppercase tracking-wide">
                  Chi tiết hạn tuần này:
                </div>
                {weekCalendar.filter((d) => d.tasks.length > 0).length === 0 ? (
                  <div className="text-text-muted text-xs py-2">
                    Không có nhiệm vụ nào đến hạn trong tuần này.
                  </div>
                ) : (
                  weekCalendar
                    .filter((d) => d.tasks.length > 0)
                    .map((d) => (
                      <div key={d.dateKey} className="space-y-1">
                        <div className="font-semibold text-brand-700 text-[11px]">
                          {d.dayLabel} ({d.formattedDate}):
                        </div>
                        {d.tasks.map((task) => (
                          <div
                            key={task.id}
                            onClick={() => navigate(`/tasks/${task.id}`)}
                            className="p-1.5 rounded bg-slate-50 hover:bg-brand-50/60 cursor-pointer flex items-center justify-between transition-colors"
                          >
                            <span className="truncate font-medium text-text-primary">
                              [{task.code}] {task.title}
                            </span>
                            <StatusBadge status={task.status} />
                          </div>
                        ))}
                      </div>
                    ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Khu vực Việc cá nhân (Tách riêng có nhãn Riêng tư) */}
          <Card className="border-slate-300">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-4 h-4 text-slate-700" />
                  Việc cá nhân của tôi ({personalTasks.length})
                </CardTitle>
                <CardDescription className="flex items-center gap-1 text-[11px] text-slate-600">
                  <Lock className="w-3 h-3 text-slate-500" /> Nhãn Riêng tư • Không tính KPI đơn vị
                </CardDescription>
              </div>
              <Link to="/personal-tasks">
                <Button variant="ghost" size="sm" className="text-xs text-slate-700">
                  Mở rộng <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-4">
              {personalTasks.length === 0 ? (
                <div className="text-center py-4 text-text-muted text-xs space-y-2">
                  <p>Chưa có ghi chú việc cá nhân nào.</p>
                  {isMockMode && (
                    <Link to="/tasks/create">
                      <Button variant="outline" size="sm" className="h-7 text-xs">
                        <PlusCircle className="w-3 h-3 mr-1" /> Thêm việc cá nhân
                      </Button>
                    </Link>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {personalTasks.slice(0, 3).map((pt) => (
                    <div
                      key={pt.id}
                      onClick={() => navigate(`/tasks/${pt.id}`)}
                      className="p-2.5 rounded-btn bg-slate-50 border border-border/80 hover:bg-slate-100 cursor-pointer flex items-center justify-between transition-colors text-xs"
                    >
                      <div className="min-w-0 flex-1 mr-2">
                        <div className="font-semibold text-text-primary truncate">
                          {pt.title}
                        </div>
                        <div className="text-[11px] text-text-muted">
                          {pt.dueAt ? formatRelativeVN(pt.dueAt) : "Không có hạn"}
                        </div>
                      </div>
                      <StatusBadge status={pt.status} />
                    </div>
                  ))}

                  <div className="pt-2 text-center">
                    <Link to="/personal-tasks">
                      <Button variant="outline" size="sm" className="w-full text-xs">
                        Quản lý toàn bộ việc cá nhân
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
