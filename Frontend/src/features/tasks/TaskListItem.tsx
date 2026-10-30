import { ArrowUpRight, CalendarClock, FolderOpen, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import { BlockedBadge, DueSoonBadge, OverdueBadge, PriorityBadge, StatusBadge } from "../../components/ui";
import type { Project, Task, User } from "../../shared/data-contract";
import { formatDateTimeVN, formatRelativeVN } from "../../shared/datetime";
import { isTaskDueSoon, isTaskOverdue } from "./task-selectors";

type Props = {
  task: Task;
  assignee?: User;
  project?: Project;
  currentUserId?: string;
  isLeader: boolean;
  roleLabel?: string;
};

export function TaskListItem({ task, assignee, project, currentUserId, isLeader, roleLabel }: Props) {
  const overdue = isTaskOverdue(task);
  const dueSoon = !overdue && isTaskDueSoon(task);
  const deliverable = task.deliverable?.trim();
  const showDeliverable = deliverable && deliverable.toLowerCase() !== "hoàn thành công việc được giao.";

  return (
    <article className={`rounded-xl border bg-white p-4 shadow-xs transition-colors hover:border-brand-200 hover:bg-brand-50/20 sm:p-5 ${overdue ? "border-red-200" : "border-border"}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] font-bold tracking-wide text-text-muted">{task.code}</span>
            <StatusBadge status={task.status} />
            {overdue && <OverdueBadge />}
            {dueSoon && <DueSoonBadge />}
            {task.isBlocked && <BlockedBadge reason={task.blockedReason} />}
          </div>

          <Link to={`/tasks/${task.id}`} className="block text-base font-bold leading-snug text-text-primary hover:text-brand-700 sm:text-[17px]">
            {task.title}
          </Link>
          {showDeliverable && (
            <p className="line-clamp-2 text-sm leading-relaxed text-text-secondary">
              <span className="font-semibold text-text-primary">Kết quả cần bàn giao:</span> {deliverable}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-text-secondary">
            <PriorityBadge priority={task.priority} />
            {project && <span className="inline-flex min-w-0 items-center gap-1"><FolderOpen className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Dự án: {project.name}</span></span>}
            {roleLabel && <span className="text-text-secondary">Vai trò: <strong className={roleLabel === "Chủ trì chính" ? "text-brand-700" : "text-purple-700"}>{roleLabel}</strong></span>}
            {!roleLabel && (isLeader || task.primaryAssigneeId !== currentUserId) && <span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />Chủ trì: {assignee?.displayName || "Chưa phân công"}</span>}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-3 lg:w-52 lg:flex-col lg:items-start lg:gap-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted"><CalendarClock className="h-3.5 w-3.5" /> Hạn hoàn thành</div>
            <div className={`text-sm font-semibold ${overdue ? "text-red-700" : dueSoon ? "text-amber-800" : "text-text-primary"}`}>{formatDateTimeVN(task.dueAt)}</div>
            <div className="text-xs text-text-muted">{formatRelativeVN(task.dueAt)}</div>
          </div>
          <Link to={`/tasks/${task.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-3 py-2 text-xs font-bold text-brand-700 hover:bg-brand-50">
            Xem công việc <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}
