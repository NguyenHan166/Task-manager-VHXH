import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../auth/SessionContext";
import { mockRepository } from "../../mocks/mock-repository";
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
      const [currSettings, allEvents, allTasks] = await Promise.all([
        mockRepository.getSettings(),
        mockRepository.getEvents(),
        mockRepository.getTasks(),
      ]);
      setWorkspaceName(currSettings.workspaceName);
      setDefaultDueHour(currSettings.defaultDueHour);
      setReminderBeforeHours(currSettings.reminderBeforeHours);
      setMaxFileSizeMb(currSettings.maxFileSizeMb);

      // Sort events newest first
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
    const unsub = mockRepository.subscribe(loadSettingsAndEvents);
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
      await mockRepository.updateSettings({
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
      await mockRepository.resetSeed();
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
            <Card className="border-red-200 bg-red-50/20">
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
            </Card>
          </div>
        )}

        {/* TAB 2: AUDIT LOGS */}
        {activeTab === "AUDIT_LOGS" && (
          <div className="space-y-4">
            <Card className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                {/* Search */}
                <div className="sm:col-span-2 relative">
                  <label className="block text-xs font-semibold text-text-secondary mb-1">
                    Tìm kiếm sự kiện kiểm toán
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-text-muted absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Tìm theo tiêu đề nhiệm vụ, mã công việc, tên người thực hiện, ghi chú..."
                      value={searchAudit}
                      onChange={(e) => setSearchAudit(e.target.value)}
                      className="w-full h-9 pl-9 pr-3 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                    />
                  </div>
                </div>

                {/* Event Kind Filter */}
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1">
                    Loại hành động (Event Kind)
                  </label>
                  <select
                    value={filterEventKind}
                    onChange={(e) => setFilterEventKind(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
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
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">
                      Dòng thời gian kiểm toán ({filteredEvents.length} sự kiện)
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Bản ghi kiểm toán bất biến (Immutable Audit Logs). Hệ thống không hỗ trợ chỉnh sửa hoặc xóa sự kiện.
                    </CardDescription>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                    Bất biến (Read-only)
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-y border-border text-text-secondary font-semibold">
                        <th className="py-2.5 px-3">Thời gian</th>
                        <th className="py-2.5 px-3">Người thực hiện</th>
                        <th className="py-2.5 px-3">Hành động</th>
                        <th className="py-2.5 px-3">Công việc liên quan</th>
                        <th className="py-2.5 px-3">Chi tiết thay đổi</th>
                        <th className="py-2.5 px-3">Ghi chú / Lý do</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredEvents.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-text-muted">
                            Không tìm thấy sự kiện nào thỏa mãn điều kiện tìm kiếm.
                          </td>
                        </tr>
                      ) : (
                        filteredEvents.map((ev) => {
                          const actor = users.find((u) => u.id === ev.actorId);
                          const task = tasks.find((t) => t.id === ev.taskId);

                          // Summarize before/after diff if available
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
                            <tr key={ev.id} className="hover:bg-slate-50/60 transition-colors">
                              <td className="py-3 px-3 whitespace-nowrap text-text-muted">
                                {formatDateTimeVN(ev.createdAt)}
                              </td>
                              <td className="py-3 px-3 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <UserAvatar user={actor} size="sm" />
                                  <div>
                                    <div className="font-semibold text-text-primary">
                                      {actor?.displayName || ev.actorId}
                                    </div>
                                    <div className="text-[10px] text-text-muted">
                                      {actor?.role === "MANAGER" ? "Trưởng phòng" : "Chuyên viên"}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-3 whitespace-nowrap">
                                {renderKindBadge(ev.kind)}
                              </td>
                              <td className="py-3 px-3 max-w-xs">
                                {task ? (
                                  <div>
                                    <Link
                                      to={`/tasks/${task.id}`}
                                      className="font-medium text-brand-700 hover:underline flex items-center gap-1"
                                    >
                                      <span className="font-mono font-bold">[{task.code}]</span>
                                      <span className="truncate">{task.title}</span>
                                      <ExternalLink className="w-3 h-3 shrink-0" />
                                    </Link>
                                  </div>
                                ) : (
                                  <span className="text-text-muted font-mono">{ev.taskId}</span>
                                )}
                              </td>
                              <td className="py-3 px-3 max-w-xs font-mono text-[11px] text-text-secondary">
                                {diffSummary ? (
                                  <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                    {diffSummary}
                                  </span>
                                ) : (
                                  <span className="text-text-muted">—</span>
                                )}
                              </td>
                              <td className="py-3 px-3 max-w-xs text-text-secondary">
                                {ev.note ? (
                                  <span className="italic">"{ev.note}"</span>
                                ) : (
                                  <span className="text-text-muted">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Confirm Reset Seed Dialog */}
        <ConfirmDialog
          isOpen={isResetConfirmOpen}
          title="Khôi phục toàn bộ dữ liệu mẫu?"
          description="Hệ thống sẽ làm mới kho dữ liệu mock về cấu hình chuẩn ban đầu. Mọi tài khoản, nhiệm vụ, bình luận và nhật ký bạn đã thao tác trong phiên thử nghiệm sẽ được đặt lại."
          confirmText="Xác nhận khôi phục"
          cancelText="Hủy bỏ"
          variant="danger"
          isLoading={isResetting}
          onConfirm={handleConfirmResetSeed}
          onCancel={() => setIsResetConfirmOpen(false)}
        />
      </div>
    </AppShell>
  );
}
