import { useMemo } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Clock3, FileCheck2, PlusCircle, Repeat2, Send } from "lucide-react";
import type { RecurrenceInstance, RecurrenceRule, Task, TaskSubmission, User } from "../../shared/data-contract";
import { formatDateTimeVN } from "../../shared/datetime";
import { Button, Card, CardContent, PageHeader, PriorityBadge } from "../../components/ui";

type Row = { task: Task; rule: RecurrenceRule; instance: RecurrenceInstance };
type Filter = "ALL" | "ACTIVE" | "PAUSED";

type Props = {
  currentUserId?: string;
  isLeader: boolean;
  isLoading: boolean;
  users: User[];
  rules: RecurrenceRule[];
  visibleRules: RecurrenceRule[];
  instances: RecurrenceInstance[];
  tasks: Task[];
  submissions: TaskSubmission[];
  filterTab: Filter;
  onFilterChange: (filter: Filter) => void;
  onCreate: () => void;
  onEdit: (rule: RecurrenceRule) => void;
  onToggle: (rule: RecurrenceRule) => void;
  onDelete: (rule: RecurrenceRule) => void;
  onGenerate: (rule: RecurrenceRule) => void;
  generatingRuleId: string | null;
  onReport: (task: Task, rule: RecurrenceRule) => void;
  onViewReport: (task: Task) => void;
};

function periodLabel(key: string): string {
  const week = /^(\d{4})-W(\d{1,2})$/.exec(key);
  if (week) return `Tuần ${Number(week[2])}/${week[1]}`;
  const month = /^(\d{4})-(\d{1,2})$/.exec(key);
  if (month) return `Tháng ${Number(month[2])}/${month[1]}`;
  return key;
}

function statusLabel(status: Task["status"]): string {
  switch (status) {
    case "TODO": return "Chưa thực hiện";
    case "IN_PROGRESS": return "Đang thực hiện";
    case "IN_REVIEW": return "Đã nộp, chờ duyệt";
    case "DONE": return "Đã duyệt";
    case "CANCELLED": return "Đã thu hồi";
    default: return "Bản nháp";
  }
}

export function RecurrenceOverview(props: Props) {
  const {
    currentUserId, isLeader, isLoading, users, rules, visibleRules, instances, tasks,
    submissions, filterTab, onFilterChange, onCreate, onEdit, onToggle, onDelete,
    onGenerate, generatingRuleId, onReport, onViewReport,
  } = props;

  const rows = useMemo(() => {
    const rulesById = new Map(rules.map((rule) => [rule.id, rule]));
    const tasksById = new Map(tasks.map((task) => [task.id, task]));
    return instances.flatMap((instance): Row[] => {
      const rule = rulesById.get(instance.ruleId);
      if (!rule) return [];
      const taskIds = instance.taskIds?.length ? instance.taskIds : instance.taskId ? [instance.taskId] : [];
      return taskIds.flatMap((id) => {
        const task = tasksById.get(id);
        if (!task || (!isLeader && task.primaryAssigneeId !== currentUserId)) return [];
        return [{ task, rule, instance }];
      });
    }).sort((a, b) => Date.parse(b.instance.createdAt) - Date.parse(a.instance.createdAt));
  }, [rules, instances, tasks, isLeader, currentUserId]);

  const needsAction = rows.filter(({ task }) => isLeader
    ? task.status === "IN_REVIEW"
    : task.status === "TODO" || task.status === "IN_PROGRESS" || task.status === "IN_REVIEW");
  const latestSubmissionIds = new Set(submissions.map((submission) => submission.taskId));

  const taskActions = (row: Row) => (
    <div className="flex flex-wrap items-center gap-2">
      {!isLeader && (row.task.status === "TODO" || row.task.status === "IN_PROGRESS") && (
        <Button type="button" size="sm" variant="primary" className="gap-1.5" onClick={() => onReport(row.task, row.rule)}>
          <Send className="h-3.5 w-3.5" /> Nộp báo cáo
        </Button>
      )}
      {!isLeader && latestSubmissionIds.has(row.task.id) && (row.task.status === "IN_REVIEW" || row.task.status === "DONE") && (
        <Button type="button" size="sm" variant="outline" onClick={() => onViewReport(row.task)}>Xem báo cáo đã nộp</Button>
      )}
      <Link to={`/tasks/${row.task.id}`} className="inline-flex h-8 items-center rounded-lg border border-border bg-white px-3 text-xs font-semibold text-brand-700 hover:bg-brand-50">
        {isLeader && row.task.status === "IN_REVIEW" ? "Xem và duyệt" : "Mở nhiệm vụ"}
      </Link>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nhiệm vụ định kỳ"
        subtitle={isLeader
          ? "Theo dõi các kỳ đã giao, duyệt báo cáo và thiết lập lịch giao việc hằng tuần hoặc hằng tháng."
          : "Xem kỳ được giao, mở nhiệm vụ và nộp báo cáo tại đây."}
        actions={isLeader ? <Button variant="primary" size="sm" onClick={onCreate} className="gap-1.5"><PlusCircle className="h-4 w-4" /> Tạo lịch giao việc</Button> : undefined}
      />

      <Card className="border-brand-200 bg-brand-50/30">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            {isLeader ? <FileCheck2 className="mt-0.5 h-5 w-5 text-brand-700" /> : <Clock3 className="mt-0.5 h-5 w-5 text-brand-700" />}
            <div>
              <h2 className="text-base font-bold text-text-primary">{isLeader ? `Báo cáo cần duyệt (${needsAction.length})` : `Kỳ cần theo dõi (${needsAction.length})`}</h2>
              <p className="text-xs text-text-secondary">{isLeader ? "Mở nhiệm vụ để xem kết quả và phê duyệt." : "Bấm Nộp báo cáo ở kỳ chưa hoàn thành; bấm Mở nhiệm vụ để xem đầy đủ yêu cầu và tệp đính kèm."}</p>
            </div>
          </div>
          {needsAction.length === 0 ? (
            <p className="rounded-lg bg-white p-4 text-sm text-text-muted">{isLoading ? "Đang tải nhiệm vụ…" : isLeader ? "Hiện không có báo cáo chờ duyệt." : "Hiện không có kỳ nào cần xử lý. Các kỳ trước nằm trong từng lịch bên dưới."}</p>
          ) : (
            <div className="grid gap-3">
              {needsAction.map((row) => (
                <div key={row.task.id} className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-white p-4 md:flex-row md:items-center">
                  <div className="min-w-0 space-y-1">
                    <div className="text-sm font-semibold text-text-primary">{row.rule.title} · {periodLabel(row.instance.periodKey)}</div>
                    <div className="text-xs text-text-secondary">{isLeader ? `${users.find((user) => user.id === row.task.primaryAssigneeId)?.displayName || "Chuyên viên"} · ` : ""}{statusLabel(row.task.status)} · Hạn nộp {formatDateTimeVN(row.task.dueAt)}</div>
                  </div>
                  {taskActions(row)}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-text-primary">{isLeader ? "Lịch giao việc định kỳ" : "Các kỳ đã được giao"}</h2>
            <p className="text-xs text-text-secondary">{isLeader ? "Mỗi lịch sẽ tạo một nhiệm vụ riêng cho từng người vào mỗi kỳ." : "Mở từng lịch để xem lại nhiệm vụ và báo cáo của các kỳ trước."}</p>
          </div>
          {isLeader && <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-white p-1 text-xs">
            {(["ALL", "ACTIVE", "PAUSED"] as const).map((filter) => (
              <button key={filter} type="button" onClick={() => onFilterChange(filter)} className={`rounded-md px-3 py-1.5 font-semibold ${filterTab === filter ? "bg-brand-50 text-brand-800" : "text-text-secondary hover:bg-slate-50"}`}>
                {filter === "ALL" ? "Tất cả" : filter === "ACTIVE" ? "Đang áp dụng" : "Tạm dừng"}
              </button>
            ))}
          </div>}
        </div>

        {visibleRules.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-text-muted">{isLoading ? "Đang tải lịch…" : isLeader ? "Chưa có lịch giao việc ở mục này. Bấm Tạo lịch giao việc để bắt đầu." : "Bạn chưa được phân công nhiệm vụ định kỳ."}</CardContent></Card>
        ) : visibleRules.map((rule) => {
          const ruleInstances = instances.filter((instance) => instance.ruleId === rule.id).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
          const assigneeCount = rule.scope === "ALL" ? users.filter((user) => user.role === "STAFF" && user.status === "ACTIVE").length : rule.assigneeIds?.length || 0;
          return (
            <Card key={rule.id} className="overflow-hidden">
              <CardContent className="space-y-4 p-4 sm:p-5">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-text-primary">{rule.title}</h3>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-text-secondary">{rule.frequency === "WEEKLY" ? "Hằng tuần" : "Hằng tháng"}</span>
                      {isLeader && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${rule.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{rule.active ? "Đang áp dụng" : "Đã tạm dừng"}</span>}
                      {isLeader && <PriorityBadge priority={rule.priority} />}
                    </div>
                    {isLeader && rule.description && <p className="whitespace-pre-wrap text-sm text-text-secondary">{rule.description}</p>}
                    {isLeader && <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-text-secondary">
                      <span>{rule.scope === "ALL" ? `Giao cho cả phòng (${assigneeCount} chuyên viên)` : `Giao cho ${assigneeCount} chuyên viên`}</span>
                      <span>Hạn nộp: {rule.dueAfterHours} giờ sau khi giao</span>
                    </div>}
                  </div>
                  {isLeader && <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Button variant="primary" size="sm" disabled={!rule.active || generatingRuleId === rule.id} onClick={() => onGenerate(rule)} className="gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> {generatingRuleId === rule.id ? "Đang giao…" : "Giao kỳ tiếp theo ngay"}</Button>
                    <details className="relative"><summary className="cursor-pointer list-none rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold text-text-secondary hover:bg-slate-50">Quản lý lịch ▾</summary><div className="absolute right-0 z-10 mt-1 flex min-w-36 flex-col gap-1 rounded-lg border border-border bg-white p-2 shadow-lg"><button type="button" className="rounded px-2 py-1.5 text-left text-xs hover:bg-slate-50" onClick={() => onEdit(rule)}>Sửa lịch</button><button type="button" className="rounded px-2 py-1.5 text-left text-xs hover:bg-slate-50" onClick={() => onToggle(rule)}>{rule.active ? "Tạm dừng lịch" : "Áp dụng lại"}</button><button type="button" className="rounded px-2 py-1.5 text-left text-xs text-red-700 hover:bg-red-50" onClick={() => onDelete(rule)}>Xóa lịch</button></div></details>
                  </div>}
                </div>

                {isLeader && <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-text-secondary">
                  <Repeat2 className="h-4 w-4 text-brand-700" />
                  {rule.active ? <>Dự kiến giao lần tới: <strong className="text-text-primary">{formatDateTimeVN(rule.nextRunAt)}</strong></> : <span>Lịch đang tạm dừng, chưa giao kỳ mới.</span>}
                  {isLeader && rule.active && <span className="text-text-muted">Nút “Giao kỳ tiếp theo ngay” sẽ giao trước thời điểm này.</span>}
                </div>}

                <details className="group border-t border-border pt-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-brand-700 hover:text-brand-800">
                    <span>Xem các kỳ đã giao ({ruleInstances.length})</span><span className="text-xs group-open:hidden">Mở ▾</span><span className="hidden text-xs group-open:inline">Thu gọn ▴</span>
                  </summary>
                  <div className="mt-4 space-y-3">
                    {ruleInstances.length === 0 ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-text-muted">Chưa giao kỳ nào.</p> : ruleInstances.map((instance) => {
                      const periodRows = rows.filter((row) => row.instance.id === instance.id);
                      const completedCount = periodRows.filter((row) => row.task.status === "IN_REVIEW" || row.task.status === "DONE").length;
                      return <div key={instance.id} className="rounded-lg border border-border p-3">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm"><strong>{periodLabel(instance.periodKey)}</strong><span className="text-xs text-text-muted">{isLeader ? `Đã nộp ${completedCount}/${periodRows.length}` : formatDateTimeVN(instance.createdAt)}</span></div>
                        <div className="space-y-2">{periodRows.map((row) => <div key={row.task.id} className="flex flex-col justify-between gap-2 rounded-lg bg-slate-50 p-3 md:flex-row md:items-center"><div className="text-xs"><div className="font-semibold text-text-primary">{isLeader ? users.find((user) => user.id === row.task.primaryAssigneeId)?.displayName || "Chuyên viên" : row.task.code}</div><div className="text-text-secondary">{statusLabel(row.task.status)} · Hạn {formatDateTimeVN(row.task.dueAt)}</div></div>{taskActions(row)}</div>)}{periodRows.length === 0 && <p className="text-xs text-text-muted">Không còn nhiệm vụ nào trong kỳ này.</p>}</div>
                      </div>;
                    })}
                  </div>
                </details>
              </CardContent>
            </Card>
          );
        })}
      </section>
    </div>
  );
}
