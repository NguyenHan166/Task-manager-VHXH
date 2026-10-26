import { cn } from "../../shared/utils";
import type { Task, User } from "../../shared/data-contract";
import {
  StatusBadge,
  PriorityBadge,
  TaskTypeBadge,
  OverdueBadge,
  BlockedBadge,
} from "./Badge";
import { UserAvatar } from "./Avatar";
import { formatDateTimeVN, formatRelativeVN } from "../../shared/datetime";
import { isTaskOverdue } from "../../features/tasks/task-selectors";
import { Calendar } from "lucide-react";

export interface TaskCardProps {
  task: Task;
  assignee?: User | null;
  onClick?: () => void;
  className?: string;
}

export function TaskCard({ task, assignee, onClick, className }: TaskCardProps) {
  const overdue = isTaskOverdue(task);
  const isClickable = Boolean(onClick);

  return (
    <div
      onClick={onClick}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      className={cn(
        "rounded-card bg-surface border border-border shadow-card p-4 transition-all space-y-3",
        isClickable &&
          "cursor-pointer hover:border-brand-700/40 hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-brand-700",
        overdue && "border-l-4 border-l-danger",
        className
      )}
    >
      {/* Top Header: Code & Badges */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs font-semibold text-text-primary">
            {task.code}
          </span>
          <TaskTypeBadge type={task.type} />
        </div>
        <div className="flex items-center gap-1.5">
          <PriorityBadge priority={task.priority} />
          <StatusBadge status={task.status} />
        </div>
      </div>

      {/* Title & Deliverable */}
      <div>
        <h4 className="text-sm font-semibold text-text-primary line-clamp-2 leading-snug">
          {task.title}
        </h4>
        {task.deliverable && (
          <p className="text-xs text-text-muted line-clamp-1 mt-1">
            {task.deliverable}
          </p>
        )}
      </div>

      {/* Warnings: Overdue / Blocked */}
      {(overdue || task.isBlocked) && (
        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          {overdue && <OverdueBadge />}
          {task.isBlocked && <BlockedBadge reason={task.blockedReason} />}
        </div>
      )}

      {/* Footer: Assignee & Due date */}
      <div className="flex items-center justify-between pt-2.5 border-t border-border/70 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <UserAvatar user={assignee} size="sm" />
          <span className="truncate text-text-secondary font-medium">
            {assignee?.displayName || "Chưa giao"}
          </span>
        </div>

        <div className="flex items-center gap-1 text-[11px] shrink-0">
          <Calendar className="w-3.5 h-3.5 text-text-muted" />
          <span
            className={cn(
              overdue ? "text-danger font-semibold" : "text-text-muted"
            )}
            title={formatDateTimeVN(task.dueAt)}
          >
            {task.dueAt ? formatRelativeVN(task.dueAt) : "Không có hạn"}
          </span>
        </div>
      </div>
    </div>
  );
}
