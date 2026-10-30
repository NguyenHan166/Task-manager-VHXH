import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../auth/SessionContext";
import { workspaceRepository, httpRepository, isMockMode } from "../../shared/repository";
import type {
  TaskEvent,
  Task,
} from "../../shared/data-contract";
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
  UserAvatar,
  ConfirmDialog,
  useToast,
} from "../../components/ui";
import { formatDateTimeVN } from "../../shared/datetime";
import {
  Settings,
  History,
  Save,
  RotateCcw,
  AlertTriangle,
  Search,
  CheckCircle2,
  Clock,
  ExternalLink,
  ShieldCheck,
  Send,
  Calendar,
} from "lucide-react";

export function SettingsPage() {
  const { currentUser, users, refreshSession } = useSession();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<"SETTINGS" | "AUDIT_LOGS">("SETTINGS");

  // Settings State
  const [workspaceName, setWorkspaceName] = useState("");
  const [defaultDueHour, setDefaultDueHour] = useState<number>(17);
  const [reminderBeforeHours, setReminderBeforeHours] = useState<number>(24);
  const [maxFileSizeMb, setMaxFileSizeMb] = useState<number>(20);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState("");

  // Audit Logs State
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [searchAudit, setSearchAudit] = useState("");
  const [filterEventKind, setFilterEventKind] = useState<string>("ALL");

  // Reset Seed State
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const loadSettingsAndEvents = async () => {
    try {
      const [currSettings, rawEvents, allTasks] = await Promise.all([
        workspaceRepository.getSettings(),
        isMockMode ? workspaceRepository.getEvents() : httpRepository.getAuditLogs({ page: 1, pageSize: 100 }),
        workspaceRepository.getTasks(),
      ]);
      setWorkspaceName(currSettings.workspaceName);
      setDefaultDueHour(currSettings.defaultDueHour);
      setReminderBeforeHours(currSettings.reminderBeforeHours);
      setMaxFileSizeMb(currSettings.maxFileSizeMb);

      // Sort events newest first
      const allEvents = isMockMode ? rawEvents as TaskEvent[] : (rawEvents as Array<Record<string, unknown>>).map((entry) => ({
        id: String(entry.id),
        taskId: entry.entityType === "Task" ? String(entry.entityId ?? "") : "",
        actorId: String(entry.actorId ?? ""),
        kind: String(entry.kind ?? "AUDIT") as TaskEvent["kind"],
        note: `${String(entry.kind ?? "EVENT")} · ${String(entry.entityType ?? "")}`,
        before: (entry.before as Record<string, unknown> | null) ?? null,
        after: (entry.after as Record<string, unknown> | null) ?? null,
        createdAt: String(entry.createdAt ?? ""),
      }));
      const sortedEvents = [...allEvents].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setEvents(sortedEvents);
      setTasks(allTasks);
    } catch {
      // Handled silently
    }
  };

  useEffect(() => {
    loadSettingsAndEvents();
    const unsub = workspaceRepository.subscribe(loadSettingsAndEvents);
    return unsub;
  }, []);

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setSettingsError("");

    if (!workspaceName.trim()) {
      setSettingsError("Tên không gian làm việc không được để trống");
      return;
    }
    if (defaultDueHour < 0 || defaultDueHour > 23 || isNaN(defaultDueHour)) {
      setSettingsError("Giờ đến hạn mặc định phải từ 0 đến 23 giờ");
      return;
    }
    if (reminderBeforeHours <= 0 || isNaN(reminderBeforeHours)) {
      setSettingsError("Mốc giờ nhắc hạn trước phải lớn hơn 0");
      return;
    }
    if (maxFileSizeMb <= 0 || isNaN(maxFileSizeMb)) {
      setSettingsError("Giới hạn dung lượng tệp phải lớn hơn 0 MB");
      return;
    }

    setIsSavingSettings(true);
    try {
      await workspaceRepository.updateSettings({
        workspaceName: workspaceName.trim(),
        defaultDueHour: Number(defaultDueHour),
        reminderBeforeHours: Number(reminderBeforeHours),
        maxFileSizeMb: Number(maxFileSizeMb),
      });
      showToast("Đã lưu cấu hình hệ thống thành công", "success");
    } catch (err: any) {
      setSettingsError(err.message || "Lỗi khi lưu cấu hình");
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Reset Seed
  const handleConfirmResetSeed = async () => {
    setIsResetting(true);
    try {
      if (!isMockMode) return;
      await workspaceRepository.resetSeed();
      showToast("Đã khôi phục cơ sở dữ liệu mẫu về trạng thái gốc", "success");
      setIsResetConfirmOpen(false);
      await refreshSession();
      await loadSettingsAndEvents();
    } catch (err: any) {
      showToast(err.message || "Lỗi khi khôi phục dữ liệu", "error");
    } finally {
      setIsResetting(false);
    }
  };

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (filterEventKind !== "ALL" && ev.kind !== filterEventKind) {
        return false;
      }

      if (searchAudit.trim()) {
        const q = searchAudit.toLowerCase().trim();
        const actor = users.find((u) => u.id === ev.actorId);
        const task = tasks.find((t) => t.id === ev.taskId);

        const matchActor = actor?.displayName.toLowerCase().includes(q) || false;
        const matchTaskTitle = task?.title.toLowerCase().includes(q) || false;
        const matchTaskCode = task?.code.toLowerCase().includes(q) || false;
        const matchNote = ev.note?.toLowerCase().includes(q) || false;

        if (!matchActor && !matchTaskTitle && !matchTaskCode && !matchNote) {
          return false;
        }
      }

      return true;
    });
  }, [events, filterEventKind, searchAudit, users, tasks]);

  // Helper for Event Kind Badges
  const renderKindBadge = (kind: TaskEvent["kind"]) => {
    switch (kind) {
      case "PUBLISHED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
            <Send className="w-3 h-3 text-blue-600" /> Giao việc (PUBLISHED)
          </span>
        );
      case "SUBMITTED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-600" /> Nộp kết quả (SUBMITTED)
          </span>
        );
      case "APPROVED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Phê duyệt (APPROVED)
          </span>
        );
      case "RETURNED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-200">
            <RotateCcw className="w-3 h-3 text-red-600" /> Trả lại (RETURNED)
          </span>
        );
      case "DEADLINE_REQUESTED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
            <Calendar className="w-3 h-3 text-purple-600" /> Xin gia hạn
          </span>
        );
      case "DEADLINE_REQUEST_DECIDED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
            <ShieldCheck className="w-3 h-3 text-indigo-600" /> Duyệt gia hạn
          </span>
        );
      case "PROGRESS_UPDATED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
            Tiến độ
          </span>
        );
      case "CREATED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            Tạo nháp
          </span>
        );
      case "BLOCKED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-danger border border-red-200">
            Báo vướng mắc
          </span>
        );
      case "CANCELLED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
            Hủy việc
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700">
            {kind}
          </span>
        );
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <Breadcrumb items={[{ label: "Cài đặt & Nhật ký" }]} />

        <PageHeader
          title="Cài đặt hệ thống & Nhật ký kiểm toán"
          subtitle="Cấu hình tham số vận hành không gian làm việc và tra cứu lịch sử sự kiện kiểm toán bất biến."
        />

        {/* Tab switcher */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab("SETTINGS")}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === "SETTINGS"
                ? "border-brand-700 text-brand-700"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            <Settings className="w-4 h-4" />
            Cấu hình hệ thống
          </button>
          <button
            onClick={() => setActiveTab("AUDIT_LOGS")}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === "AUDIT_LOGS"
                ? "border-brand-700 text-brand-700"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            <History className="w-4 h-4" />
            Nhật ký kiểm toán ({events.length} sự kiện)
          </button>
        </div>

        {/* TAB 1: SETTINGS */}
        {activeTab === "SETTINGS" && (
          <div className="space-y-6 max-w-3xl">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Tham số vận hành đơn vị</CardTitle>
                <CardDescription className="text-xs">
                  Các thiết lập thời gian mặc định, giới hạn dung lượng tệp và múi giờ chuẩn hóa.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {settingsError && (
                  <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-danger font-medium flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {settingsError}
                  </div>
                )}

                <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
                  {/* Workspace Name */}
                  <div>
                    <label className="block font-semibold text-text-secondary mb-1">
                      Tên không gian làm việc đơn vị <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={workspaceName}
                      onChange={(e) => setWorkspaceName(e.target.value)}
                      className="w-full h-9 px-3 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                    />
                    <p className="text-[11px] text-text-muted mt-0.5">
                      Hiển thị tại thanh thương hiệu phía trên và các biểu mẫu xuất báo cáo.
                    </p>
                  </div>

                  {/* Timezone */}
                  <div>
                    <label className="block font-semibold text-text-secondary mb-1">
                      Múi giờ chuẩn hóa hệ thống (Bất biến)
                    </label>
                    <input
                      type="text"
                      disabled
                      value="Asia/Ho_Chi_Minh (UTC+7 - Giờ chuẩn Việt Nam)"
                      className="w-full h-9 px-3 rounded-btn bg-slate-50 border border-border text-xs font-mono text-text-muted cursor-not-allowed"
                    />
                    <p className="text-[11px] text-text-muted mt-0.5">
                      Tất cả mốc thời hạn được lưu trữ theo UTC và quy đổi hiển thị theo múi giờ này.
                    </p>
                  </div>

                  {/* Default Due Hour & Reminder Hours */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-semibold text-text-secondary mb-1">
                        Giờ đến hạn mặc định trong ngày (0..23) <span className="text-danger">*</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={23}
                          required
                          value={defaultDueHour}
                          onChange={(e) => setDefaultDueHour(Number(e.target.value))}
                          className="w-full h-9 px-3 rounded-btn bg-surface border border-border text-xs font-mono focus:ring-2 focus:ring-brand-700 outline-none"
                        />
                        <span className="text-xs text-text-secondary whitespace-nowrap">
                          ({defaultDueHour}:00 hàng ngày)
                        </span>
                      </div>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        Tự động điền khi tạo nhiệm vụ chỉ chọn ngày mà không chọn giờ cụ thể.
                      </p>
                    </div>

                    <div>
                      <label className="block font-semibold text-text-secondary mb-1">
                        Mốc giờ gửi thông báo nhắc hạn trước <span className="text-danger">*</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          required
                          value={reminderBeforeHours}
                          onChange={(e) => setReminderBeforeHours(Number(e.target.value))}
                          className="w-full h-9 px-3 rounded-btn bg-surface border border-border text-xs font-mono focus:ring-2 focus:ring-brand-700 outline-none"
                        />
                        <span className="text-xs text-text-secondary whitespace-nowrap">giờ</span>
                      </div>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        Hệ thống sẽ gửi chuông thông báo khi nhiệm vụ còn đúng số giờ này.
                      </p>
                    </div>
                  </div>

                  {/* Max File Size */}
                  <div>
                    <label className="block font-semibold text-text-secondary mb-1">
                      Giới hạn dung lượng tệp đính kèm (MB) <span className="text-danger">*</span>
                    </label>
                    <div className="flex items-center gap-2 max-w-xs">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        required
                        value={maxFileSizeMb}
                        onChange={(e) => setMaxFileSizeMb(Number(e.target.value))}
                        className="w-full h-9 px-3 rounded-btn bg-surface border border-border text-xs font-mono focus:ring-2 focus:ring-brand-700 outline-none"
                      />
                      <span className="text-xs text-text-secondary whitespace-nowrap">MB mỗi tệp</span>
                    </div>
                    <p className="text-[11px] text-text-muted mt-0.5">
                      Áp dụng cho các tệp đính kèm giao việc, tài liệu báo cáo kết quả và thảo luận.
                    </p>
                  </div>

                  <div className="pt-3 flex items-center justify-end">
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      isLoading={isSavingSettings}
                      className="gap-1.5 shadow-sm"
                    >
                      <Save className="w-4 h-4" />
                      Lưu cấu hình hệ thống
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Danger Zone: Reset Seed */}
            {isMockMode && <Card className="border-red-200 bg-red-50/20">
              <CardHeader>
                <div className="flex items-center gap-2 text-danger">
                  <AlertTriangle className="w-4 h-4" />
                  <CardTitle className="text-sm text-danger">Vùng quản trị: Khôi phục kho dữ liệu mẫu (Seed)</CardTitle>
                </div>
                <CardDescription className="text-xs text-text-secondary">
                  Đặt lại toàn bộ dữ liệu (công việc, tài khoản, chat, nhật ký, thông báo) về trạng thái khởi tạo chuẩn của Prompt 00 & Prompt 01. Các dữ liệu thử nghiệm phát sinh sẽ bị xóa.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsResetConfirmOpen(true)}
                  className="text-danger hover:bg-red-50 hover:border-danger gap-1.5 font-medium"
                >
                  <RotateCcw className="w-4 h-4" />
                  Khôi phục dữ liệu mẫu (Reset Seed)
                </Button>
              </CardContent>
            </Card>}
          </div>
        )}

        {/* TAB 2: AUDIT LOGS */}
        {activeTab === "AUDIT_LOGS" && (
          <div className="space-y-5">
            <Card className="border-border/80 p-4 sm:p-5">
              <div className="grid grid-cols-1 gap-4 text-xs lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
                {/* Search */}
                <div className="min-w-0">
                  <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
                    Tìm kiếm sự kiện kiểm toán
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                    <input
                      type="text"
                      placeholder="Tìm theo công việc, mã, người thực hiện hoặc ghi chú…"
                      value={searchAudit}
                      onChange={(e) => setSearchAudit(e.target.value)}
                      className="h-10 w-full rounded-lg border border-border bg-white pl-10 pr-3 text-xs shadow-sm outline-none transition placeholder:text-text-muted focus:border-brand-700 focus:ring-4 focus:ring-brand-100"
                    />
                  </div>
                </div>

                {/* Event Kind Filter */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
                    Loại hành động
                  </label>
                  <select
                    value={filterEventKind}
                    onChange={(e) => setFilterEventKind(e.target.value)}
                    className="h-10 w-full rounded-lg border border-border bg-white px-3 text-xs shadow-sm outline-none transition focus:border-brand-700 focus:ring-4 focus:ring-brand-100"
                  >
                    <option value="ALL">Tất cả hành động</option>
                    <option value="PUBLISHED">Giao việc (PUBLISHED)</option>
                    <option value="SUBMITTED">Nộp kết quả (SUBMITTED)</option>
                    <option value="APPROVED">Phê duyệt (APPROVED)</option>
                    <option value="RETURNED">Trả lại (RETURNED)</option>
                    <option value="DEADLINE_REQUESTED">Xin gia hạn</option>
                    <option value="DEADLINE_REQUEST_DECIDED">Duyệt gia hạn</option>
                    <option value="PROGRESS_UPDATED">Cập nhật tiến độ</option>
                    <option value="BLOCKED">Báo vướng mắc</option>
                    <option value="CREATED">Tạo nháp</option>
                    <option value="CANCELLED">Hủy việc</option>
                  </select>
                </div>
              </div>
            </Card>

            {/* Audit Logs Table */}
            <Card className="border-border/80">
              <CardHeader className="border-b border-border/70 bg-gradient-to-r from-brand-50/70 to-white px-4 pb-3 pt-4 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-base">
                      Dòng thời gian kiểm toán
                    </CardTitle>
                    <CardDescription className="text-xs leading-relaxed">
                      Lịch sử hoạt động chỉ đọc, dùng để tra cứu thay đổi trong không gian làm việc.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-center">
                    <span className="rounded-full border border-border bg-white px-2.5 py-1 text-[11px] font-semibold text-text-secondary">
                      {filteredEvents.length} sự kiện
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-[10px] font-semibold text-brand-800">
                      <ShieldCheck className="h-3.5 w-3.5" /> Chỉ đọc
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {filteredEvents.length === 0 ? (
                  <div className="px-5 py-12 text-center">
                    <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-text-muted"><Search className="h-5 w-5" /></span>
                    <p className="mt-3 text-sm font-semibold text-text-primary">Không tìm thấy sự kiện</p>
                    <p className="mt-1 text-xs text-text-muted">Thử đổi từ khóa hoặc loại hành động để xem thêm kết quả.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/70">
                    {filteredEvents.map((ev) => {
                      const actor = users.find((u) => u.id === ev.actorId);
                      const task = tasks.find((t) => t.id === ev.taskId);

                      let diffSummary: string | null = null;
                      if (ev.before || ev.after) {
                        const keys = Object.keys(ev.after || ev.before || {});
                        if (keys.length > 0) {
                          diffSummary = keys
                            .map((k) => {
                              const bVal = ev.before ? String((ev.before as any)[k] ?? "") : "—";
                              const aVal = ev.after ? String((ev.after as any)[k] ?? "") : "—";
                              return `${k}: ${bVal} → ${aVal}`;
                            })
                            .join(", ");
                        }
                      }

                      return (
                        <article key={ev.id} className="grid gap-x-4 gap-y-3 px-4 py-4 transition-colors hover:bg-brand-50/30 sm:px-5 lg:grid-cols-[150px_minmax(170px,0.85fr)_minmax(220px,1.3fr)]">
                          <div className="flex items-start gap-2 text-xs text-text-secondary">
                            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
                            <span className="font-medium">{formatDateTimeVN(ev.createdAt)}</span>
                          </div>
                          <div className="flex min-w-0 items-center gap-2.5">
                            <UserAvatar user={actor} size="sm" />
                            <div className="min-w-0">
                              <div className="truncate text-xs font-semibold text-text-primary">{actor?.displayName || ev.actorId}</div>
                              <div className="mt-0.5 text-[10px] text-text-muted">{actor?.role === "MANAGER" ? "Trưởng phòng" : "Chuyên viên"}</div>
                            </div>
                          </div>
                          <div className="min-w-0">
                            {renderKindBadge(ev.kind)}
                            <div className="mt-1.5 min-w-0">
                              {task ? (
                                <Link to={`/tasks/${task.id}`} className="inline-flex min-w-0 max-w-full items-center gap-1 text-xs font-medium text-brand-700 hover:underline" title={`${task.code} · ${task.title}`}>
                                  <span className="shrink-0 font-mono font-bold">{task.code}</span>
                                  <span className="min-w-0 truncate text-text-secondary">{task.title}</span>
                                  <ExternalLink className="h-3 w-3 shrink-0" />
                                </Link>
                              ) : (
                                <span className="truncate font-mono text-[11px] text-text-muted" title={ev.taskId || "Không liên kết công việc"}>{ev.taskId || "Không liên kết công việc"}</span>
                              )}
                            </div>
                          </div>
                          <div className="grid gap-2 border-t border-border/60 pt-3 sm:grid-cols-2 lg:col-span-3">
                            <div className="min-w-0 rounded-lg bg-slate-50/80 px-3 py-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Chi tiết thay đổi</p>
                              <p className="mt-1 line-clamp-2 break-words font-mono text-[11px] text-text-secondary" title={diffSummary || undefined}>{diffSummary || "Không có dữ liệu thay đổi."}</p>
                            </div>
                            <div className="min-w-0 rounded-lg bg-slate-50/80 px-3 py-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Ghi chú / lý do</p>
                              <p className="mt-1 line-clamp-2 break-words text-xs text-text-secondary" title={ev.note || undefined}>{ev.note ? `“${ev.note}”` : "Không có ghi chú."}</p>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Confirm Reset Seed Dialog */}
        {isMockMode && <ConfirmDialog
          isOpen={isResetConfirmOpen}
          title="Khôi phục toàn bộ dữ liệu mẫu?"
          description="Hệ thống sẽ làm mới kho dữ liệu mock về cấu hình chuẩn ban đầu. Mọi tài khoản, nhiệm vụ, bình luận và nhật ký bạn đã thao tác trong phiên thử nghiệm sẽ được đặt lại."
          confirmText="Xác nhận khôi phục"
          cancelText="Hủy bỏ"
          variant="danger"
          isLoading={isResetting}
          onConfirm={handleConfirmResetSeed}
          onCancel={() => setIsResetConfirmOpen(false)}
        />}
      </div>
    </AppShell>
  );
}
