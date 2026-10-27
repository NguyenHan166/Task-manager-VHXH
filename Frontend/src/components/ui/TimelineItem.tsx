import { cn } from "../../shared/utils";
import type { TaskEvent, User } from "../../shared/data-contract";
import { formatDateTimeVN, formatRelativeVN } from "../../shared/datetime";
import { UserAvatar } from "./Avatar";
import {
  PlusCircle,
  PlayCircle,
  FileCheck,
  CheckCircle2,
  RotateCcw,
  Clock,
  UserPlus,
  AlertOctagon,
  Ban,
  Activity,
} from "lucide-react";

export interface TimelineItemProps {
  event: TaskEvent;
  actor?: User | null;
  isLast?: boolean;
  className?: string;
}

export function TimelineItem({
  event,
  actor,
  isLast = false,
  className,
}: TimelineItemProps) {
  const getEventIcon = () => {
    switch (event.kind) {
      case "CREATED":
        return <PlusCircle className="w-3.5 h-3.5 text-blue-600" />;
      case "PUBLISHED":
      case "STARTED":
        return <PlayCircle className="w-3.5 h-3.5 text-amber-600" />;
      case "SUBMITTED":
        return <FileCheck className="w-3.5 h-3.5 text-purple-600" />;
      case "SUBMISSION_WITHDRAWN":
        return <RotateCcw className="w-3.5 h-3.5 text-amber-700" />;
      case "APPROVED":
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />;
      case "RETURNED":
        return <RotateCcw className="w-3.5 h-3.5 text-amber-700" />;
      case "DEADLINE_REQUESTED":
      case "DEADLINE_CHANGED":
        return <Clock className="w-3.5 h-3.5 text-blue-700" />;
      case "ASSIGNEE_REQUESTED":
      case "ASSIGNEE_CHANGED":
        return <UserPlus className="w-3.5 h-3.5 text-brand-700" />;
      case "BLOCKED":
        return <AlertOctagon className="w-3.5 h-3.5 text-danger" />;
      case "CANCELLED":
        return <Ban className="w-3.5 h-3.5 text-slate-500" />;
      default:
        return <Activity className="w-3.5 h-3.5 text-text-muted" />;
    }
  };

  return (
    <div className={cn("relative flex items-start gap-3.5 text-xs", className)}>
      {/* Vertical line connecting timeline events */}
      {!isLast && (
        <span
          className="absolute left-[15px] top-7 bottom-0 w-0.5 bg-border"
          aria-hidden="true"
        />
      )}

      {/* Circle Icon Container */}
      <div className="relative z-10 w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center shadow-xs shrink-0 mt-0.5">
        {getEventIcon()}
      </div>

      {/* Content */}
      <div className="flex-1 pb-5 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 font-medium text-text-primary">
            <UserAvatar user={actor} size="sm" />
            <span className="font-semibold">{actor?.displayName || "Hệ thống"}</span>
            <span className="text-text-muted font-normal">•</span>
            <span className="text-text-secondary font-medium">{event.note}</span>
          </div>

          <div
            className="text-[11px] text-text-muted whitespace-nowrap"
            title={formatDateTimeVN(event.createdAt)}
          >
            {formatRelativeVN(event.createdAt)}
          </div>
        </div>
      </div>
    </div>
  );
}
