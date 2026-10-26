import { cn } from "../../shared/utils";
import type { TaskPriority, TaskStatus, TaskType } from "../../shared/data-contract";

export interface StatusBadgeProps {
  status: TaskStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config: Record<TaskStatus, { label: string; textClass: string; bgClass: string }> = {
    DRAFT: { label: "Nháp", textClass: "text-[#475569]", bgClass: "bg-[#F1F5F9]" },
    TODO: { label: "Chưa làm", textClass: "text-[#1D4ED8]", bgClass: "bg-[#DBEAFE]" },
    IN_PROGRESS: { label: "Đang làm", textClass: "text-[#B45309]", bgClass: "bg-[#FEF3C7]" },
    IN_REVIEW: { label: "Chờ duyệt", textClass: "text-[#7C3AED]", bgClass: "bg-[#F3E8FF]" },
    DONE: { label: "Hoàn thành", textClass: "text-[#15803D]", bgClass: "bg-[#DCFCE7]" },
    CANCELLED: { label: "Đã hủy", textClass: "text-[#64748B]", bgClass: "bg-[#E2E8F0]" },
  };

  const item = config[status] || { label: status, textClass: "text-text-secondary", bgClass: "bg-gray-100" };

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-transparent",
        item.bgClass,
        item.textClass,
        className
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-current opacity-70" />
      {item.label}
    </span>
  );
}

export interface PriorityBadgeProps {
  priority: TaskPriority;
  className?: string;
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const config: Record<TaskPriority, { label: string; colorClass: string; bgClass: string }> = {
    LOW: { label: "Thấp", colorClass: "text-slate-600", bgClass: "bg-slate-100" },
    NORMAL: { label: "Bình thường", colorClass: "text-blue-700", bgClass: "bg-blue-50" },
    HIGH: { label: "Cao", colorClass: "text-amber-700", bgClass: "bg-amber-50" },
    URGENT: { label: "Khẩn cấp", colorClass: "text-red-700", bgClass: "bg-red-50" },
  };

  const item = config[priority];

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-wide",
        item.bgClass,
        item.colorClass,
        className
      )}
    >
      {item.label}
    </span>
  );
}

export interface TaskTypeBadgeProps {
  type: TaskType;
  className?: string;
}

export function TaskTypeBadge({ type, className }: TaskTypeBadgeProps) {
  const config: Record<TaskType, { label: string; style: string }> = {
    OFFICIAL: {
      label: "Chính thức",
      style: "bg-brand-50 text-brand-700 border border-brand-100",
    },
    TEAM: {
      label: "Cộng tác nhóm",
      style: "bg-purple-50 text-purple-700 border border-purple-100",
    },
    PERSONAL: {
      label: "Cá nhân",
      style: "bg-gray-100 text-gray-700 border border-gray-200",
    },
  };

  const item = config[type];

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium",
        item.style,
        className
      )}
    >
      {item.label}
    </span>
  );
}

export function OverdueBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-danger border border-red-200",
        className
      )}
    >
      Quá hạn
    </span>
  );
}

export function BlockedBadge({ reason, className }: { reason?: string | null; className?: string }) {
  return (
    <span
      title={reason || undefined}
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-warning border border-amber-200",
        className
      )}
    >
      Vướng mắc
    </span>
  );
}
