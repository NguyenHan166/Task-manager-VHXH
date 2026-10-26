import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../auth/SessionContext";
import { mockRepository } from "../../mocks/mock-repository";
import type {
  Task,
  Project,
  TaskParticipant,
} from "../../shared/data-contract";
import { isTaskOverdue } from "../tasks/task-selectors";
import { AppShell } from "../../components/layout/AppShell";
import {
  Breadcrumb,
  PageHeader,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  StatCard,
  StatusBadge,
  PriorityBadge,
  OverdueBadge,
  UserAvatar,
  SkeletonCard,
  useToast,
} from "../../components/ui";
import { formatDateTimeVN, formatDateVN } from "../../shared/datetime";
import {
  Download,
  Filter,
  Info,
  Calendar,
  AlertTriangle,
  Clock,
  CheckCircle2,
  ListFilter,
  Users,
  ShieldAlert,
  ArrowUpRight,
  TrendingUp,
  FileSpreadsheet,
} from "lucide-react";

type TimeRangePreset = "ALL" | "THIS_WEEK" | "THIS_MONTH" | "THIS_QUARTER" | "THIS_YEAR" | "CUSTOM";

export function ReportsPage() {
  const { currentUser, users, isManager } = useSession();
  const { showToast } = useToast();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [participants, setParticipants] = useState<TaskParticipant[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filter states
  const [timeRange, setTimeRange] = useState<TimeRangePreset>("ALL");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [filterAssigneeId, setFilterAssigneeId] = useState<string>("ALL");
  const [filterProjectId, setFilterProjectId] = useState<string>("ALL");
  const [filterPriority, setFilterPriority] = useState<string>("ALL");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [includeTeam, setIncludeTeam] = useState<boolean>(false);

  // Tab for detail tables
  const [activeTab, setActiveTab] = useState<"WORKLOAD" | "OVERDUE" | "IN_REVIEW" | "ALL_TASKS">("WORKLOAD");

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [allTasks, allProjects, allParticipants] = await Promise.all([
        mockRepository.getTasks(),
        mockRepository.getProjects(),
        mockRepository.getParticipants(),
      ]);
      setTasks(allTasks);
      setProjects(allProjects);
      setParticipants(allParticipants);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const unsub = mockRepository.subscribe(loadData);
    return unsub;
  }, []);

  const now = useMemo(() => new Date(), []);

  // Compute time boundaries for presets
  const timeBounds = useMemo(() => {
    const current = new Date();
    const currentYear = current.getFullYear();
    const currentMonth = current.getMonth();

    // Start of week (Monday)
    const day = current.getDay();
    const diffToMonday = current.getDate() - day + (day === 0 ? -6 : 1);
    const startOfWeek = new Date(current.setDate(diffToMonday));
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    // Start of month
    const startOfMonth = new Date(currentYear, currentMonth, 1, 0, 0, 0, 0);
    const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);

    // Start of quarter
    const quarterMonth = Math.floor(currentMonth / 3) * 3;
    const startOfQuarter = new Date(currentYear, quarterMonth, 1, 0, 0, 0, 0);
    const endOfQuarter = new Date(currentYear, quarterMonth + 3, 0, 23, 59, 59, 999);

    // Start of year
    const startOfYear = new Date(currentYear, 0, 1, 0, 0, 0, 0);
    const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999);

    return {
      startOfWeek,
      endOfWeek,
      startOfMonth,
      endOfMonth,
      startOfQuarter,
      endOfQuarter,
      startOfYear,
      endOfYear,
    };
  }, []);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // Rule 1: PERSONAL tasks are NEVER in department reports
      if (task.type === "PERSONAL") {
        return false;
      }

      // Rule 2: Exclude DRAFT and CANCELLED from official KPIs
      if (task.status === "DRAFT" || task.status === "CANCELLED") {
        return false;
      }

      // Rule 3: Official vs Team
      if (task.type === "TEAM" && !includeTeam) {
        return false;
      }

      // Rule 4: Staff viewer isolation
      if (!isManager && currentUser) {
        // Staff only sees tasks where they are primary assignee or accepted collaborator
        const isPrimary = task.primaryAssigneeId === currentUser.id;
        const isCollab = participants.some(
          (p) =>
            p.taskId === task.id &&
            p.userId === currentUser.id &&
            p.invitationStatus === "ACCEPTED"
        );
        if (!isPrimary && !isCollab) return false;
      }

      // Project filter
      if (filterProjectId !== "ALL" && task.projectId !== filterProjectId) {
        return false;
      }

      // Assignee filter
      if (filterAssigneeId !== "ALL" && task.primaryAssigneeId !== filterAssigneeId) {
        return false;
      }

      // Priority filter
      if (filterPriority !== "ALL" && task.priority !== filterPriority) {
        return false;
      }

      // Status filter
      if (filterStatus !== "ALL" && task.status !== filterStatus) {
        return false;
      }

      // Time range filter (by dueAt, fallback to createdAt if no dueAt)
      if (timeRange !== "ALL") {
        const targetDate = task.dueAt ? new Date(task.dueAt) : new Date(task.createdAt);
        const targetTime = targetDate.getTime();

        if (timeRange === "THIS_WEEK") {
          if (targetTime < timeBounds.startOfWeek.getTime() || targetTime > timeBounds.endOfWeek.getTime()) {
            return false;
          }
        } else if (timeRange === "THIS_MONTH") {
          if (targetTime < timeBounds.startOfMonth.getTime() || targetTime > timeBounds.endOfMonth.getTime()) {
            return false;
          }
        } else if (timeRange === "THIS_QUARTER") {
          if (targetTime < timeBounds.startOfQuarter.getTime() || targetTime > timeBounds.endOfQuarter.getTime()) {
            return false;
          }
        } else if (timeRange === "THIS_YEAR") {
          if (targetTime < timeBounds.startOfYear.getTime() || targetTime > timeBounds.endOfYear.getTime()) {
            return false;
          }
        } else if (timeRange === "CUSTOM") {
          if (customFrom) {
            const fromTime = new Date(`${customFrom}T00:00:00`).getTime();
            if (targetTime < fromTime) return false;
          }
          if (customTo) {
            const toTime = new Date(`${customTo}T23:59:59`).getTime();
            if (targetTime > toTime) return false;
          }
        }
      }

      return true;
    });
  }, [
    tasks,
    includeTeam,
    isManager,
    currentUser,
    participants,
    filterProjectId,
    filterAssigneeId,
    filterPriority,
    filterStatus,
    timeRange,
    customFrom,
    customTo,
    timeBounds,
  ]);

  // Overall KPIs calculation
  const stats = useMemo(() => {
    let todo = 0;
    let inProgress = 0;
    let inReview = 0;
    let done = 0;
    let overdue = 0;
    let onTime = 0;

    filteredTasks.forEach((t) => {
      if (t.status === "TODO") todo++;
      else if (t.status === "IN_PROGRESS") inProgress++;
      else if (t.status === "IN_REVIEW") inReview++;
      else if (t.status === "DONE") {
        done++;
        if (t.completedAt && t.dueAt) {
          const cTime = new Date(t.completedAt).getTime();
          const dTime = new Date(t.dueAt).getTime();
          if (cTime <= dTime) {
            onTime++;
          }
        }
      }

      if (isTaskOverdue(t, now)) {
        overdue++;
      }
    });

    const late = done - onTime;
    const onTimeRate = done > 0 ? Math.round((onTime / done) * 100) : 0;

    return {
      total: filteredTasks.length,
      todo,
      inProgress,
      inReview,
      done,
      overdue,
      onTime,
      late,
      onTimeRate,
    };
  }, [filteredTasks, now]);

  // Staff Workload Breakdown
  const staffWorkload = useMemo(() => {
    // Only active users for workload display
    const activeUsers = users.filter((u) => u.status === "ACTIVE");

    return activeUsers.map((user) => {
      // Primary tasks assigned to this user from the filtered set
      const userPrimary = filteredTasks.filter((t) => t.primaryAssigneeId === user.id);

      const todo = userPrimary.filter((t) => t.status === "TODO").length;
      const inProgress = userPrimary.filter((t) => t.status === "IN_PROGRESS").length;
      const inReview = userPrimary.filter((t) => t.status === "IN_REVIEW").length;
      const done = userPrimary.filter((t) => t.status === "DONE").length;

      let onTime = 0;
      userPrimary
        .filter((t) => t.status === "DONE")
        .forEach((t) => {
          if (t.completedAt && t.dueAt) {
            if (new Date(t.completedAt).getTime() <= new Date(t.dueAt).getTime()) {
              onTime++;
            }
          }
        });
      const late = done - onTime;
      const onTimeRate = done > 0 ? Math.round((onTime / done) * 100) : 0;

      // Collab count: strictly counted from accepted invitations
      const userCollabTaskIds = new Set(
        participants
          .filter(
            (p) =>
              p.userId === user.id &&
              p.role === "COLLABORATOR" &&
              p.invitationStatus === "ACCEPTED"
          )
          .map((p) => p.taskId)
      );

      const collabCount = tasks.filter(
        (t) =>
          userCollabTaskIds.has(t.id) &&
          t.primaryAssigneeId !== user.id &&
          t.status !== "DRAFT" &&
          t.status !== "CANCELLED"
      ).length;

      return {
        user,
        primaryCount: userPrimary.length,
        todo,
        inProgress,
        inReview,
        done,
        onTime,
        late,
        onTimeRate,
        collabCount,
      };
    });
  }, [users, filteredTasks, participants, tasks]);

  // Urgent lists
  const overdueTasks = useMemo(() => {
    return filteredTasks.filter((t) => isTaskOverdue(t, now));
  }, [filteredTasks, now]);

  const inReviewTasks = useMemo(() => {
    return filteredTasks.filter((t) => t.status === "IN_REVIEW");
  }, [filteredTasks]);

  // CSV Export
  const handleExportCsv = () => {
    if (!isManager) {
      showToast("Chỉ Trưởng phòng mới có quyền xuất báo cáo toàn phòng", "warning");
      return;
    }

    try {
      const exportTime = formatDateTimeVN(new Date().toISOString());
      const exporterName = currentUser?.displayName || "Quản trị viên";
      const exporterRole = currentUser?.role === "MANAGER" ? "Trưởng phòng" : "Chuyên viên";

      let timeLabel = "Toàn thời gian";
      if (timeRange === "THIS_WEEK") timeLabel = "Tuần này";
      else if (timeRange === "THIS_MONTH") timeLabel = "Tháng này";
      else if (timeRange === "THIS_QUARTER") timeLabel = "Quý này";
      else if (timeRange === "THIS_YEAR") timeLabel = "Năm nay";
      else if (timeRange === "CUSTOM") timeLabel = `Tùy chọn (${customFrom || "..."} đến ${customTo || "..."})`;

      const lines: string[] = [];

      // Metadata section
      lines.push("BÁO CÁO TIẾN ĐỘ VÀ CHỈ SỐ KPI ĐƠN VỊ - OFFICE WORKSPACE");
      lines.push(`Thời điểm xuất báo cáo:,"${exportTime}"`);
      lines.push(`Người xuất:,"${exporterName} (${exporterRole})"`);
      lines.push(`Phạm vi thời gian:,"${timeLabel}"`);
      lines.push(`Bao gồm việc nhóm (TEAM):,"${includeTeam ? "Có" : "Không (Chỉ việc chính thức OFFICIAL)"}"`);
      lines.push("");

      // KPI Summary
      lines.push("TỔNG HỢP CHỈ SỐ KPI");
      lines.push("Tổng nhiệm vụ,Chưa làm (TODO),Đang làm (IN_PROGRESS),Chờ duyệt (IN_REVIEW),Đã hoàn thành (DONE),Đúng hạn,Trễ hạn,Tỷ lệ đúng hạn (%),Quá hạn hiện tại");
      lines.push(
        `${stats.total},${stats.todo},${stats.inProgress},${stats.inReview},${stats.done},${stats.onTime},${stats.late},${stats.onTimeRate}%,${stats.overdue}`
      );
      lines.push("");

      // Workload Table
      lines.push("BẢNG 1: PHÂN BỔ KHỐI LƯỢNG CÔNG VIỆC THEO NGƯỜI CHỦ TRÌ");
      lines.push("STT,Họ và tên,Tài khoản,Chức vụ,Tổng việc chủ trì,Chưa làm,Đang làm,Chờ duyệt,Đã xong,Đúng hạn,Trễ hạn,Tỷ lệ đúng hạn (%),Số việc phối hợp (Cột riêng)");
      staffWorkload.forEach((item, index) => {
        lines.push(
          `${index + 1},"${item.user.displayName}","${item.user.username}","${item.user.jobTitle}",${item.primaryCount},${item.todo},${item.inProgress},${item.inReview},${item.done},${item.onTime},${item.late},${item.onTimeRate}%,${item.collabCount}`
        );
      });
      lines.push("");

      // Task Details Table
      lines.push("BẢNG 2: DANH SÁCH CHI TIẾT CÁC CÔNG VIỆC THEO BỘ LỌC");
      lines.push("STT,Mã công việc,Tên công việc,Loại việc,Người chủ trì,Ưu tiên,Trạng thái,Hạn hoàn thành,Ngày nộp/hoàn thành,Đúng hạn/Trễ hạn,Dự án");
      filteredTasks.forEach((t, index) => {
        const assignee = users.find((u) => u.id === t.primaryAssigneeId)?.displayName || "—";
        const project = projects.find((p) => p.id === t.projectId)?.name || "—";
        let onTimeStatus = "—";
        if (t.status === "DONE") {
          if (t.completedAt && t.dueAt && new Date(t.completedAt) <= new Date(t.dueAt)) {
            onTimeStatus = "Đúng hạn";
          } else {
            onTimeStatus = "Trễ hạn";
          }
        } else if (isTaskOverdue(t, now)) {
          onTimeStatus = "Đang quá hạn";
        }

        const safeTitle = t.title.replace(/"/g, '""');
        lines.push(
          `${index + 1},"${t.code}","${safeTitle}","${t.type}","${assignee}","${t.priority}","${t.status}","${formatDateVN(t.dueAt)}","${formatDateVN(t.completedAt)}","${onTimeStatus}","${project}"`
        );
      });

      const csvContent = lines.join("\r\n");
      // Prepend UTF-8 BOM (\uFEFF) for Microsoft Excel compatibility
      const blob = new Blob(["\uFEFF" + csvContent], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const cleanDate = new Date().toISOString().slice(0, 10);
      link.setAttribute("href", url);
      link.setAttribute("download", `Bao_Cao_KPI_OfficeWorkspace_${cleanDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast("Xuất tệp CSV báo cáo thành công", "success");
    } catch (err) {
      console.error(err);
      showToast("Lỗi khi tạo tệp CSV", "error");
    }
  };

  const activeFiltersCount =
    (timeRange !== "ALL" ? 1 : 0) +
    (filterProjectId !== "ALL" ? 1 : 0) +
    (filterAssigneeId !== "ALL" ? 1 : 0) +
    (filterPriority !== "ALL" ? 1 : 0) +
    (filterStatus !== "ALL" ? 1 : 0) +
    (includeTeam ? 1 : 0);

  const resetFilters = () => {
    setTimeRange("ALL");
    setCustomFrom("");
    setCustomTo("");
    setFilterAssigneeId("ALL");
    setFilterProjectId("ALL");
    setFilterPriority("ALL");
    setFilterStatus("ALL");
    setIncludeTeam(false);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <Breadcrumb items={[{ label: "Báo cáo" }]} />

        {/* Page Header */}
        <PageHeader
          title="Báo cáo quản trị & Thống kê KPI"
          subtitle="Đánh giá tiến độ hoàn thành, tỷ lệ đúng hạn và phân tích khối lượng công việc toàn đơn vị."
          actions={
            isManager ? (
              <Button
                variant="primary"
                onClick={handleExportCsv}
                className="gap-2 shadow-sm font-medium"
              >
                <Download className="w-4 h-4" />
                Xuất báo cáo CSV
              </Button>
            ) : undefined
          }
        />

        {/* Staff view notification banner */}
        {!isManager && (
          <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">Chế độ xem cá nhân dành cho Chuyên viên</p>
              <p className="mt-0.5 text-blue-800">
                Bạn đang xem dữ liệu thống kê khối lượng công việc và tỷ lệ hoàn thành của riêng bạn. Báo cáo phân bổ toàn phòng và chức năng xuất tệp CSV tổng hợp chỉ dành cho Trưởng phòng.
              </p>
            </div>
          </div>
        )}

        {/* Filter Toolbar Card */}
        <Card className="p-4 sm:p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <div className="flex items-center gap-2 text-xs font-bold text-text-primary uppercase tracking-wider">
                <Filter className="w-4 h-4 text-brand-700" />
                Bộ lọc báo cáo & kỳ đánh giá
                {activeFiltersCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-brand-100 text-brand-800 font-semibold">
                    {activeFiltersCount} đang chọn
                  </span>
                )}
              </div>

              {activeFiltersCount > 0 && (
                <button
                  onClick={resetFilters}
                  className="text-xs text-brand-700 hover:text-brand-800 font-medium hover:underline"
                >
                  Xóa tất cả bộ lọc
                </button>
              )}
            </div>

            {/* Filter controls row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
              {/* Time Range */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">
                  Kỳ thời gian
                </label>
                <select
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value as TimeRangePreset)}
                  className="w-full h-9 px-2.5 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                >
                  <option value="ALL">Toàn thời gian</option>
                  <option value="THIS_WEEK">Tuần này</option>
                  <option value="THIS_MONTH">Tháng này</option>
                  <option value="THIS_QUARTER">Quý này</option>
                  <option value="THIS_YEAR">Năm nay</option>
                  <option value="CUSTOM">Tùy chọn khoảng ngày</option>
                </select>
              </div>

              {/* Assignee (Manager only) */}
              {isManager && (
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1">
                    Người chủ trì
                  </label>
                  <select
                    value={filterAssigneeId}
                    onChange={(e) => setFilterAssigneeId(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                  >
                    <option value="ALL">Tất cả người chủ trì</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.displayName} ({u.jobTitle})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Project */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">
                  Dự án / Chuyên đề
                </label>
                <select
                  value={filterProjectId}
                  onChange={(e) => setFilterProjectId(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                >
                  <option value="ALL">Tất cả dự án</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">
                  Mức độ ưu tiên
                </label>
                <select
                  value={filterPriority}
                  onChange={(e) => setFilterPriority(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                >
                  <option value="ALL">Tất cả ưu tiên</option>
                  <option value="URGENT">Khẩn cấp</option>
                  <option value="HIGH">Cao</option>
                  <option value="NORMAL">Bình thường</option>
                  <option value="LOW">Thấp</option>
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">
                  Trạng thái
                </label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                >
                  <option value="ALL">Tất cả trạng thái</option>
                  <option value="TODO">Chưa thực hiện</option>
                  <option value="IN_PROGRESS">Đang thực hiện</option>
                  <option value="IN_REVIEW">Chờ phê duyệt</option>
                  <option value="DONE">Đã hoàn thành</option>
                </select>
              </div>
            </div>

            {/* Custom Date Inputs if CUSTOM selected */}
            {timeRange === "CUSTOM" && (
              <div className="flex flex-wrap items-center gap-3 pt-2 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
                <span className="font-medium text-text-secondary flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-brand-700" />
                  Khoảng ngày đánh giá:
                </span>
                <div className="flex items-center gap-2">
                  <span>Từ ngày:</span>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="h-8 px-2 rounded border border-border bg-surface text-xs"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span>Đến ngày:</span>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="h-8 px-2 rounded border border-border bg-surface text-xs"
                  />
                </div>
              </div>
            )}

            {/* Include Team Tasks Checkbox */}
            {isManager && (
              <div className="flex items-center gap-2 pt-2 border-t border-border/60">
                <input
                  type="checkbox"
                  id="includeTeamTasks"
                  checked={includeTeam}
                  onChange={(e) => setIncludeTeam(e.target.checked)}
                  className="rounded text-brand-700 focus:ring-brand-700 w-4 h-4 cursor-pointer"
                />
                <label
                  htmlFor="includeTeamTasks"
                  className="text-xs text-text-primary font-medium cursor-pointer flex items-center gap-1.5"
                >
                  Bao gồm nhiệm vụ nhóm (TEAM)
                  <span className="text-[11px] text-text-muted font-normal italic">
                    (Nhiệm vụ nhóm nằm ngoài chỉ tiêu KPI chính thức của đơn vị)
                  </span>
                </label>
              </div>
            )}
          </div>
        </Card>

        {/* KPI Cards Row */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard
              label="Tổng công việc"
              value={stats.total}
              variant="brand"
              icon={<ListFilter className="w-5 h-5 text-brand-700" />}
              description={includeTeam ? "Bao gồm OFFICIAL & TEAM" : "Chính thức (OFFICIAL) hợp lệ"}
            />
            <StatCard
              label="Chưa thực hiện"
              value={stats.todo}
              variant="neutral"
              icon={<Clock className="w-5 h-5 text-slate-500" />}
              description="Trạng thái TODO"
            />
            <StatCard
              label="Đang thực hiện"
              value={stats.inProgress}
              variant="info"
              icon={<TrendingUp className="w-5 h-5 text-blue-600" />}
              description="Trạng thái IN_PROGRESS"
            />
            <StatCard
              label="Chờ phê duyệt"
              value={stats.inReview}
              variant="warning"
              icon={<AlertTriangle className="w-5 h-5 text-amber-500" />}
              description="Trạng thái IN_REVIEW"
            />
            <StatCard
              label="Đã hoàn thành"
              value={stats.done}
              variant="success"
              icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
              description={`Đúng: ${stats.onTime} • Trễ: ${stats.late}`}
            />
            <StatCard
              label="Đang quá hạn"
              value={stats.overdue}
              variant="danger"
              icon={<ShieldAlert className="w-5 h-5 text-danger" />}
              description="Chưa xong & quá hạn"
              badge={stats.overdue > 0 ? <span className="text-[10px] text-danger font-bold">Khẩn</span> : undefined}
            />
          </div>
        )}

        {/* Quality & On-time Rate Banner */}
        <div className="p-4 sm:p-5 rounded-card bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 border border-emerald-200/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-base text-emerald-950 flex items-center gap-1.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                Tỷ lệ hoàn thành đúng hạn:
              </span>
              <span className="text-2xl font-black text-emerald-800 tracking-tight">
                {stats.onTimeRate}%
              </span>
              <span className="text-xs text-emerald-700 font-medium">
                ({stats.onTime} / {stats.done} việc hoàn thành)
              </span>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">
              Công thức: Số nhiệm vụ hoàn thành có thời điểm nộp <code className="bg-white/80 px-1 py-0.5 rounded text-emerald-900 font-mono">completedAt ≤ dueAt</code> chia cho Tổng số nhiệm vụ đã hoàn thành (<code className="bg-white/80 px-1 py-0.5 rounded text-emerald-900 font-mono">DONE</code>).
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-semibold bg-white/80 px-4 py-2.5 rounded-lg border border-emerald-200 shadow-2xs">
            <div className="text-center">
              <div className="text-emerald-700 text-lg font-bold">{stats.onTime}</div>
              <div className="text-[11px] text-text-muted">Đúng hạn</div>
            </div>
            <div className="h-6 w-px bg-emerald-200" />
            <div className="text-center">
              <div className="text-amber-700 text-lg font-bold">{stats.late}</div>
              <div className="text-[11px] text-text-muted">Trễ hạn</div>
            </div>
            <div className="h-6 w-px bg-emerald-200" />
            <div className="text-center">
              <div className="text-danger text-lg font-bold">{stats.overdue}</div>
              <div className="text-[11px] text-text-muted">Quá hạn chưa xong</div>
            </div>
          </div>
        </div>

        {/* Detailed Sections Tabs */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border">
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={() => setActiveTab("WORKLOAD")}
                className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                  activeTab === "WORKLOAD"
                    ? "border-brand-700 text-brand-700"
                    : "border-transparent text-text-secondary hover:text-text-primary"
                }`}
              >
                <Users className="w-4 h-4" />
                Khối lượng theo Chủ trì ({staffWorkload.length})
              </button>
              <button
                onClick={() => setActiveTab("OVERDUE")}
                className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                  activeTab === "OVERDUE"
                    ? "border-danger text-danger"
                    : "border-transparent text-text-secondary hover:text-text-primary"
                }`}
              >
                <AlertTriangle className="w-4 h-4 text-danger" />
                Việc đang quá hạn ({overdueTasks.length})
              </button>
              <button
                onClick={() => setActiveTab("IN_REVIEW")}
                className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                  activeTab === "IN_REVIEW"
                    ? "border-amber-600 text-amber-700"
                    : "border-transparent text-text-secondary hover:text-text-primary"
                }`}
              >
                <Clock className="w-4 h-4 text-amber-600" />
                Việc chờ duyệt ({inReviewTasks.length})
              </button>
              <button
                onClick={() => setActiveTab("ALL_TASKS")}
                className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                  activeTab === "ALL_TASKS"
                    ? "border-brand-700 text-brand-700"
                    : "border-transparent text-text-secondary hover:text-text-primary"
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                Chi tiết toàn bộ ({filteredTasks.length})
              </button>
            </div>

            <div className="text-[11px] text-text-muted flex items-center gap-1">
              <Info className="w-3.5 h-3.5" />
              Báo cáo tự động cập nhật theo Mock Repository
            </div>
          </div>

          {/* TAB 1: Workload Table */}
          {activeTab === "WORKLOAD" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Bảng phân bổ khối lượng công việc theo Người chủ trì</CardTitle>
                <CardDescription className="text-xs">
                  Mỗi nhiệm vụ chỉ ghi nhận 01 người chủ trì. Số lượng nhiệm vụ phối hợp được thống kê ở cột riêng biệt để tránh cộng dồn sai lệch.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {/* Desktop View (>= 768px) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-y border-border text-text-secondary font-semibold">
                        <th className="py-2.5 px-3">Thành viên</th>
                        <th className="py-2.5 px-3 text-center">Việc chủ trì</th>
                        <th className="py-2.5 px-3 text-center">Chưa làm</th>
                        <th className="py-2.5 px-3 text-center">Đang làm</th>
                        <th className="py-2.5 px-3 text-center">Chờ duyệt</th>
                        <th className="py-2.5 px-3 text-center">Đã xong</th>
                        <th className="py-2.5 px-3 text-center text-emerald-700">Đúng hạn</th>
                        <th className="py-2.5 px-3 text-center text-amber-700">Trễ hạn</th>
                        <th className="py-2.5 px-3 text-center">Tỷ lệ đúng hạn</th>
                        <th className="py-2.5 px-3 text-center bg-blue-50/60 text-blue-900 border-l border-border">
                          Việc phối hợp
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {staffWorkload.map((row) => (
                        <tr key={row.user.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2.5">
                              <UserAvatar user={row.user} size="sm" showRoleBadge />
                              <div>
                                <div className="font-semibold text-text-primary">
                                  {row.user.displayName}
                                </div>
                                <div className="text-[11px] text-text-muted">
                                  {row.user.jobTitle} • <code className="font-mono text-brand-700">{row.user.username}</code>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center font-bold text-sm text-text-primary">
                            {row.primaryCount}
                          </td>
                          <td className="py-3 px-3 text-center text-slate-600">
                            {row.todo > 0 ? (
                              <span className="font-medium">{row.todo}</span>
                            ) : (
                              <span className="text-text-muted">0</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center text-blue-700">
                            {row.inProgress > 0 ? (
                              <span className="font-medium">{row.inProgress}</span>
                            ) : (
                              <span className="text-text-muted">0</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center text-amber-700">
                            {row.inReview > 0 ? (
                              <span className="font-medium">{row.inReview}</span>
                            ) : (
                              <span className="text-text-muted">0</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center text-emerald-700">
                            {row.done > 0 ? (
                              <span className="font-semibold">{row.done}</span>
                            ) : (
                              <span className="text-text-muted">0</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center text-emerald-800 font-semibold">
                            {row.onTime}
                          </td>
                          <td className="py-3 px-3 text-center text-amber-800 font-semibold">
                            {row.late}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {row.done > 0 ? (
                              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                                {row.onTimeRate}%
                              </div>
                            ) : (
                              <span className="text-text-muted text-[11px]">Chưa có</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center bg-blue-50/40 border-l border-border font-bold text-blue-900">
                            {row.collabCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile View (< 768px) */}
                <div className="block md:hidden p-3 space-y-3">
                  {staffWorkload.map((row) => (
                    <div
                      key={row.user.id}
                      className="p-3.5 bg-surface rounded-card border border-border shadow-xs space-y-2.5"
                    >
                      {/* Top: User info */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <UserAvatar user={row.user} size="md" showRoleBadge />
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-text-primary truncate">
                              {row.user.displayName}
                            </div>
                            <div className="text-[11px] text-text-muted truncate">
                              {row.user.jobTitle}
                            </div>
                          </div>
                        </div>

                        {row.done > 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 shrink-0">
                            Đúng hạn: {row.onTimeRate}%
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] text-text-muted bg-slate-100 shrink-0">
                            Chưa có nộp
                          </span>
                        )}
                      </div>

                      {/* Workload summary pill grid */}
                      <div className="grid grid-cols-4 gap-1.5 text-center text-xs pt-1">
                        <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200/60">
                          <div className="text-[10px] text-text-muted uppercase font-bold">Chủ trì</div>
                          <div className="font-bold text-text-primary text-sm mt-0.5">{row.primaryCount}</div>
                        </div>
                        <div className="bg-blue-50/60 p-1.5 rounded-lg border border-blue-200/60">
                          <div className="text-[10px] text-blue-700 uppercase font-bold">Đang làm</div>
                          <div className="font-bold text-blue-900 text-sm mt-0.5">{row.inProgress}</div>
                        </div>
                        <div className="bg-amber-50/60 p-1.5 rounded-lg border border-amber-200/60">
                          <div className="text-[10px] text-amber-700 uppercase font-bold">Chờ duyệt</div>
                          <div className="font-bold text-amber-900 text-sm mt-0.5">{row.inReview}</div>
                        </div>
                        <div className="bg-emerald-50/60 p-1.5 rounded-lg border border-emerald-200/60">
                          <div className="text-[10px] text-emerald-700 uppercase font-bold">Đã xong</div>
                          <div className="font-bold text-emerald-900 text-sm mt-0.5">{row.done}</div>
                        </div>
                      </div>

                      {/* Detail row */}
                      <div className="flex items-center justify-between text-[11px] text-text-secondary pt-1 border-t border-border/70">
                        <span>Đúng hạn: <strong className="text-emerald-700">{row.onTime}</strong> • Trễ hạn: <strong className="text-amber-700">{row.late}</strong></span>
                        <span className="text-blue-800 bg-blue-50 px-2 py-0.5 rounded font-medium">
                          Phối hợp: {row.collabCount} việc
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* TAB 2: Overdue Tasks List */}
          {activeTab === "OVERDUE" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-danger flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-danger" />
                  Danh sách nhiệm vụ đang quá hạn ({overdueTasks.length})
                </CardTitle>
                <CardDescription className="text-xs">
                  Các công việc chưa hoàn thành và thời hạn đã qua thời điểm hiện tại.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {overdueTasks.length === 0 ? (
                  <div className="p-8 text-center text-xs text-text-muted">
                    Hiện tại không có nhiệm vụ nào bị quá hạn.
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {overdueTasks.map((t) => {
                      const assignee = users.find((u) => u.id === t.primaryAssigneeId);
                      return (
                        <div
                          key={t.id}
                          className="p-3.5 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-brand-700">
                                {t.code}
                              </span>
                              <OverdueBadge />
                              <StatusBadge status={t.status} />
                              <PriorityBadge priority={t.priority} />
                            </div>
                            <h4 className="font-semibold text-sm text-text-primary hover:text-brand-700 transition-colors">
                              <Link to={`/tasks/${t.id}`}>{t.title}</Link>
                            </h4>
                            <div className="text-xs text-text-muted flex items-center gap-3">
                              <span>Hạn chót: <strong className="text-danger">{formatDateTimeVN(t.dueAt)}</strong></span>
                              <span>•</span>
                              <span>Chủ trì: <strong>{assignee?.displayName || "—"}</strong></span>
                            </div>
                          </div>

                          <Link to={`/tasks/${t.id}`}>
                            <Button variant="outline" size="sm" className="gap-1 shrink-0 text-xs">
                              Mở chi tiết
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* TAB 3: In Review Tasks List */}
          {activeTab === "IN_REVIEW" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-amber-800 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600" />
                  Danh sách nhiệm vụ đang chờ phê duyệt ({inReviewTasks.length})
                </CardTitle>
                <CardDescription className="text-xs">
                  Báo cáo kết quả đã được chuyên viên nộp và đang chờ Trưởng phòng xem xét duyệt hoặc trả lại.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {inReviewTasks.length === 0 ? (
                  <div className="p-8 text-center text-xs text-text-muted">
                    Hiện tại không có nhiệm vụ nào đang chờ phê duyệt.
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {inReviewTasks.map((t) => {
                      const assignee = users.find((u) => u.id === t.primaryAssigneeId);
                      return (
                        <div
                          key={t.id}
                          className="p-3.5 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-brand-700">
                                {t.code}
                              </span>
                              <StatusBadge status={t.status} />
                              <PriorityBadge priority={t.priority} />
                            </div>
                            <h4 className="font-semibold text-sm text-text-primary hover:text-brand-700 transition-colors">
                              <Link to={`/tasks/${t.id}`}>{t.title}</Link>
                            </h4>
                            <div className="text-xs text-text-muted flex items-center gap-3">
                              <span>Chủ trì nộp: <strong>{assignee?.displayName || "—"}</strong></span>
                              <span>•</span>
                              <span>Hạn ban đầu: {formatDateTimeVN(t.dueAt)}</span>
                            </div>
                          </div>

                          <Link to={`/tasks/${t.id}`}>
                            <Button variant="outline" size="sm" className="gap-1 shrink-0 text-xs">
                              Xem xét duyệt
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* TAB 4: All Filtered Tasks */}
          {activeTab === "ALL_TASKS" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Danh sách chi tiết ({filteredTasks.length} nhiệm vụ)</CardTitle>
                <CardDescription className="text-xs">
                  Các nhiệm vụ thỏa mãn bộ lọc hiện tại. Bấm vào tiêu đề để xem toàn bộ hồ sơ.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {/* Desktop View (>= 768px) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-y border-border text-text-secondary font-semibold">
                        <th className="py-2.5 px-3">Mã</th>
                        <th className="py-2.5 px-3">Tiêu đề nhiệm vụ</th>
                        <th className="py-2.5 px-3">Chủ trì</th>
                        <th className="py-2.5 px-3">Ưu tiên</th>
                        <th className="py-2.5 px-3">Trạng thái</th>
                        <th className="py-2.5 px-3">Hạn hoàn thành</th>
                        <th className="py-2.5 px-3">Ngày hoàn thành</th>
                        <th className="py-2.5 px-3">Đúng / Trễ hạn</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredTasks.map((t) => {
                        const assignee = users.find((u) => u.id === t.primaryAssigneeId);
                        let onTimeLabel = "—";
                        let onTimeClass = "text-text-muted";

                        if (t.status === "DONE") {
                          if (t.completedAt && t.dueAt && new Date(t.completedAt) <= new Date(t.dueAt)) {
                            onTimeLabel = "Đúng hạn";
                            onTimeClass = "text-emerald-700 font-semibold";
                          } else {
                            onTimeLabel = "Trễ hạn";
                            onTimeClass = "text-amber-700 font-semibold";
                          }
                        } else if (isTaskOverdue(t, now)) {
                          onTimeLabel = "Đang quá hạn";
                          onTimeClass = "text-danger font-semibold";
                        }

                        return (
                          <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="py-2.5 px-3 font-mono font-bold text-brand-700">
                              {t.code}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-text-primary max-w-xs">
                              <Link to={`/tasks/${t.id}`} className="hover:underline">
                                {t.title}
                              </Link>
                            </td>
                            <td className="py-2.5 px-3 text-text-secondary">
                              {assignee?.displayName || "—"}
                            </td>
                            <td className="py-2.5 px-3">
                              <PriorityBadge priority={t.priority} />
                            </td>
                            <td className="py-2.5 px-3">
                              <StatusBadge status={t.status} />
                            </td>
                            <td className="py-2.5 px-3 text-text-secondary">
                              {formatDateVN(t.dueAt)}
                            </td>
                            <td className="py-2.5 px-3 text-text-secondary">
                              {formatDateVN(t.completedAt)}
                            </td>
                            <td className={`py-2.5 px-3 ${onTimeClass}`}>
                              {onTimeLabel}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile View (< 768px) */}
                <div className="block md:hidden p-3 space-y-3">
                  {filteredTasks.map((t) => {
                    const assignee = users.find((u) => u.id === t.primaryAssigneeId);
                    let onTimeLabel = "—";
                    let onTimeBadgeClass = "bg-slate-100 text-slate-700 border-slate-200";

                    if (t.status === "DONE") {
                      if (t.completedAt && t.dueAt && new Date(t.completedAt) <= new Date(t.dueAt)) {
                        onTimeLabel = "Đúng hạn";
                        onTimeBadgeClass = "bg-emerald-100 text-emerald-800 border-emerald-300";
                      } else {
                        onTimeLabel = "Trễ hạn";
                        onTimeBadgeClass = "bg-amber-100 text-amber-800 border-amber-300";
                      }
                    } else if (isTaskOverdue(t, now)) {
                      onTimeLabel = "Đang quá hạn";
                      onTimeBadgeClass = "bg-red-100 text-danger border-red-300";
                    }

                    return (
                      <div
                        key={t.id}
                        className="p-3.5 bg-surface rounded-card border border-border shadow-xs space-y-2.5"
                      >
                        {/* Top: Code & Badges */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-mono font-bold text-xs bg-slate-100 text-brand-800 px-2 py-0.5 rounded">
                              {t.code}
                            </span>
                            <PriorityBadge priority={t.priority} />
                            {onTimeLabel !== "—" && (
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${onTimeBadgeClass}`}>
                                {onTimeLabel}
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

                        {/* Detail rows */}
                        <div className="text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200/70 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-text-muted text-[11px]">Chủ trì:</span>
                            <span className="font-semibold text-text-primary">{assignee?.displayName || "—"}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-text-muted text-[11px]">Hạn hoàn thành:</span>
                            <span className="text-text-primary font-medium">{formatDateVN(t.dueAt)}</span>
                          </div>
                          {t.completedAt && (
                            <div className="flex items-center justify-between">
                              <span className="text-text-muted text-[11px]">Ngày hoàn thành:</span>
                              <span className="text-emerald-800 font-medium">{formatDateVN(t.completedAt)}</span>
                            </div>
                          )}
                        </div>

                        <Link
                          to={`/tasks/${t.id}`}
                          className="block text-center w-full py-1.5 bg-brand-50 text-brand-700 font-semibold rounded hover:bg-brand-100 transition-colors text-xs"
                        >
                          Xem chi tiết công việc →
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}
