import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { useSession } from "../auth/SessionContext";
import { mockRepository } from "../../mocks/mock-repository";
import type {
  RecurrenceRule,
  RecurrenceInstance,
  TaskPriority,
  Id,
} from "../../shared/data-contract";
import {
  Breadcrumb,
  PageHeader,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  Input,
  Textarea,
  Select,
  PriorityBadge,
  UserAvatar,
  EmptyState,
  useToast,
} from "../../components/ui";
import { formatDateTimeVN } from "../../shared/datetime";
import {
  Repeat,
  PlusCircle,
  Play,
  CheckCircle2,
  Calendar,
  ArrowRight,
} from "lucide-react";

export function RecurrencePage() {
  const { currentUser, isManager, users } = useSession();
  const { showToast } = useToast();

  const [rules, setRules] = useState<RecurrenceRule[]>([]);
  const [instances, setInstances] = useState<RecurrenceInstance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState<string | null>(null);

  // Modal create rule
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [primaryAssigneeId, setPrimaryAssigneeId] = useState<Id>("u02");
  const [priority, setPriority] = useState<TaskPriority>("NORMAL");
  const [frequency, setFrequency] = useState<"WEEKLY" | "MONTHLY">("MONTHLY");
  const [dueAfterHours, setDueAfterHours] = useState(120);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [rList, iList] = await Promise.all([
        mockRepository.getRecurrenceRules(),
        mockRepository.getRecurrenceInstances(),
      ]);
      setRules(rList);
      setInstances(iList);
    } catch {
      showToast("Không thể tải danh sách nhiệm vụ định kỳ", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const unsub = mockRepository.subscribe(loadData);
    return unsub;
  }, []);

  const handleToggleActive = async (rule: RecurrenceRule) => {
    try {
      await mockRepository.toggleRecurrenceRule(rule.id, !rule.active);
      showToast(
        rule.active
          ? `Đã tạm dừng mẫu "${rule.title}"`
          : `Đã kích hoạt mẫu "${rule.title}"`,
        "success"
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Thao tác thất bại";
      showToast(msg, "error");
    }
  };

  const handleGenerateNext = async (rule: RecurrenceRule) => {
    if (!currentUser) return;
    setIsGenerating(rule.id);
    try {
      const res = await mockRepository.generateRecurrenceNext(
        rule.id,
        currentUser.id
      );
      showToast(
        `Đã sinh kỳ [${res.instance.periodKey}] thành công! Nhiệm vụ tạo mới: ${res.task.code}`,
        "success"
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Thao tác thất bại";
      showToast(msg, "error");
    } finally {
      setIsGenerating(null);
    }
  };

  const handleCreateRule = async () => {
    if (!currentUser) return;
    if (!title.trim()) {
      showToast("Vui lòng nhập tên mẫu công việc định kỳ", "error");
      return;
    }

    try {
      const now = new Date();
      const nextRun = new Date(
        now.getTime() + (frequency === "WEEKLY" ? 7 : 30) * 86400000
      );
      await mockRepository.createRecurrenceRule({
        title: title.trim(),
        description: description.trim(),
        ownerId: currentUser.id,
        primaryAssigneeId,
        priority,
        frequency,
        dueAfterHours: Number(dueAfterHours) || 72,
        nextRunAt: nextRun.toISOString(),
        active: true,
      });

      showToast("Đã tạo mẫu định kỳ mới thành công", "success");
      setIsCreateModalOpen(false);
      setTitle("");
      setDescription("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể tạo quy tắc";
      showToast(msg, "error");
    }
  };

  // Compute upcoming period key preview for display
  const computeNextPeriodPreview = (rule: RecurrenceRule) => {
    const nextDate = new Date(rule.nextRunAt || Date.now());
    const year = nextDate.getFullYear();
    const month = String(nextDate.getMonth() + 1).padStart(2, "0");
    const oneJan = new Date(nextDate.getFullYear(), 0, 1);
    const numberOfDays = Math.floor(
      (nextDate.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000)
    );
    const weekNumber = Math.ceil((nextDate.getDay() + 1 + numberOfDays) / 7);
    return rule.frequency === "WEEKLY"
      ? `${year}-W${String(weekNumber).padStart(2, "0")}`
      : `${year}-${month}`;
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <Breadcrumb
          items={[
            { label: "Tổng quan", href: "/dashboard" },
            { label: "Nhiệm vụ định kỳ" },
          ]}
        />

        <PageHeader
          title="Nhiệm vụ định kỳ (Recurrence Rules)"
          subtitle="Tự động hóa phát hành nhiệm vụ định kỳ theo tuần hoặc theo tháng. Hệ thống ngăn chặn việc sinh trùng lặp trong cùng một chu kỳ."
          badge={
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-100 text-brand-800 border border-brand-200">
              Bản xem trước P1
            </span>
          }
          actions={
            isManager ? (
              <Button
                variant="primary"
                size="sm"
                className="gap-1.5"
                onClick={() => setIsCreateModalOpen(true)}
              >
                <PlusCircle className="w-3.5 h-3.5" /> Tạo mẫu định kỳ
              </Button>
            ) : undefined
          }
        />

        {rules.length === 0 && !isLoading ? (
          <EmptyState
            title="Chưa có mẫu nhiệm vụ định kỳ"
            description="Tạo mẫu công việc lặp lại để phòng ban tự động hóa quy trình nộp báo cáo định kỳ hàng tháng/hàng tuần."
            icon={<Repeat className="w-8 h-8 text-slate-400" />}
            action={
              isManager ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setIsCreateModalOpen(true)}
                >
                  <PlusCircle className="w-3.5 h-3.5 mr-1" /> Tạo mẫu đầu tiên
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-6">
            {rules.map((rule) => {
              const assignee = users.find(
                (u) => u.id === rule.primaryAssigneeId
              );
              const ruleInstances = instances.filter(
                (inst) => inst.ruleId === rule.id
              );
              const nextPeriod = computeNextPeriodPreview(rule);

              return (
                <Card key={rule.id} className="overflow-hidden border-border/80">
                  <div className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border/60 bg-surface">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-text-muted bg-slate-100 px-2 py-0.5 rounded">
                          {rule.id}
                        </span>
                        <h2 className="text-base font-bold text-text-primary">
                          {rule.title}
                        </h2>
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
                            rule.frequency === "WEEKLY"
                              ? "bg-purple-50 text-purple-700 border-purple-200"
                              : "bg-blue-50 text-blue-700 border-blue-200"
                          }`}
                        >
                          {rule.frequency === "WEEKLY"
                            ? "Lặp hàng tuần"
                            : "Lặp hàng tháng"}
                        </span>
                        <PriorityBadge priority={rule.priority} />
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                            rule.active
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-slate-100 text-slate-500 border border-slate-200"
                          }`}
                        >
                          {rule.active ? "Đang hiệu lực" : "Tạm dừng"}
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary leading-relaxed max-w-2xl">
                        {rule.description || "Không có ghi chú mô tả"}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 self-start lg:self-center">
                      {isManager && (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleToggleActive(rule)}
                          >
                            {rule.active ? "Tạm dừng" : "Kích hoạt"}
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            className="gap-1.5 shadow-sm"
                            disabled={!rule.active || isGenerating === rule.id}
                            onClick={() => handleGenerateNext(rule)}
                          >
                            <Play className="w-3.5 h-3.5" />
                            {isGenerating === rule.id
                              ? "Đang sinh..."
                              : "Sinh kỳ tiếp theo (Demo)"}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  <CardContent className="p-5 grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-50/50">
                    <div className="space-y-3">
                      <div className="text-xs font-bold text-text-muted uppercase tracking-wider">
                        Phân công & Thời hạn
                      </div>
                      <div className="bg-surface p-3 rounded-lg border border-border/80 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-text-secondary">Chủ trì:</span>
                          <div className="flex items-center gap-1.5 font-medium text-text-primary">
                            <UserAvatar
                              name={assignee?.displayName || "N/A"}
                              size="sm"
                            />
                            <span>{assignee?.displayName || rule.primaryAssigneeId}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-text-secondary">Hạn nộp sau:</span>
                          <span className="font-semibold text-text-primary">
                            {rule.dueAfterHours} giờ ({Math.round(rule.dueAfterHours / 24)} ngày)
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="text-xs font-bold text-text-muted uppercase tracking-wider">
                        Dự kiến phát hành kỳ tới
                      </div>
                      <div className="bg-surface p-3 rounded-lg border border-border/80 space-y-2">
                        <div className="flex items-center gap-2 text-xs text-text-secondary">
                          <Calendar className="w-3.5 h-3.5 text-text-muted" />
                          <span>Mốc chạy:</span>
                          <span className="font-medium text-text-primary">
                            {formatDateTimeVN(rule.nextRunAt)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-text-secondary">Mã kỳ (Period):</span>
                          <span className="font-mono font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded">
                            {nextPeriod}
                          </span>
                        </div>
                        <div className="text-[11px] text-text-muted truncate">
                          Tiêu đề sinh:{" "}
                          <span className="font-medium text-text-secondary">
                            {rule.title} - Kỳ {nextPeriod}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="text-xs font-bold text-text-muted uppercase tracking-wider">
                        Lịch sử đã sinh ({ruleInstances.length} kỳ)
                      </div>
                      <div className="bg-surface p-3 rounded-lg border border-border/80 max-h-36 overflow-y-auto space-y-1.5">
                        {ruleInstances.length === 0 ? (
                          <div className="text-xs text-text-muted italic py-2 text-center">
                            Chưa có kỳ nào được tạo từ mẫu này.
                          </div>
                        ) : (
                          ruleInstances.map((inst) => (
                            <div
                              key={inst.id}
                              className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-slate-50 transition-colors"
                            >
                              <div className="flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="font-mono font-semibold text-text-primary">
                                  {inst.periodKey}
                                </span>
                              </div>
                              <Link
                                to={`/tasks/${inst.taskId}`}
                                className="text-brand-700 font-medium hover:underline flex items-center gap-0.5 text-[11px]"
                              >
                                {inst.taskId}
                                <ArrowRight className="w-3 h-3" />
                              </Link>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Modal Tạo mẫu định kỳ */}
        <ConfirmDialog
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onConfirm={handleCreateRule}
          title="Tạo mẫu nhiệm vụ định kỳ mới"
          confirmText="Lưu quy tắc"
          cancelText="Hủy"
        >
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-text-secondary">
                Tên mẫu công việc định kỳ <span className="text-danger-600">*</span>
              </label>
              <Input
                placeholder="VD: Báo cáo công tác tuần / Báo cáo tài chính quý..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-text-secondary">
                  Tần suất phát hành
                </label>
                <Select
                  value={frequency}
                  onChange={(e) =>
                    setFrequency(e.target.value as "WEEKLY" | "MONTHLY")
                  }
                >
                  <option value="WEEKLY">Hàng tuần (Weekly)</option>
                  <option value="MONTHLY">Hàng tháng (Monthly)</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-text-secondary">
                  Mức độ ưu tiên
                </label>
                <Select
                  value={priority}
                  onChange={(e) =>
                    setPriority(e.target.value as TaskPriority)
                  }
                >
                  <option value="LOW">Thấp (LOW)</option>
                  <option value="NORMAL">Bình thường (NORMAL)</option>
                  <option value="HIGH">Cao (HIGH)</option>
                  <option value="URGENT">Khẩn cấp (URGENT)</option>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-text-secondary">
                  Chuyên viên chủ trì mặc định
                </label>
                <Select
                  value={primaryAssigneeId}
                  onChange={(e) => setPrimaryAssigneeId(e.target.value)}
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName} ({u.role === "MANAGER" ? "Trưởng phòng" : "Chuyên viên"})
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-text-secondary">
                  Hạn hoàn thành (giờ sau khi sinh)
                </label>
                <Input
                  type="number"
                  min={12}
                  max={720}
                  step={12}
                  value={dueAfterHours}
                  onChange={(e) => setDueAfterHours(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-text-secondary">
                Mô tả chi tiết và hướng dẫn nộp
              </label>
              <Textarea
                rows={3}
                placeholder="Nêu rõ yêu cầu biểu mẫu báo cáo, các mục cần chuẩn bị..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
        </ConfirmDialog>
      </div>
    </AppShell>
  );
}
