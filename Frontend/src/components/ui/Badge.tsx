import { cn } from "../../shared/utils";
import type { TaskPriority, TaskStatus, TaskType } from "../../shared/data-contract";

export interface StatusBadgeProps {
  status: TaskStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config: Record<TaskStatus, { label: string; style: string }> = {
    DRAFT: { label: "Nháp", style: "bg-slate-50 text-slate-700 border-slate-200" },
    TODO: { label: "Chưa làm", style: "bg-blue-50 text-blue-700 border-blue-200" },
    IN_PROGRESS: { label: "Đang làm", style: "bg-amber-50 text-amber-800 border-amber-200" },
    IN_REVIEW: { label: "Chờ duyệt", style: "bg-violet-50 text-violet-700 border-violet-200" },
    DONE: { label: "Hoàn thành", style: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    CANCELLED: { label: "Đã hủy", style: "bg-slate-50 text-slate-600 border-slate-200" },
  };

  const item = config[status] || { label: status, style: "bg-gray-50 text-text-secondary border-gray-200" };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold leading-none shadow-[0_1px_2px_rgba(15,23,42,0.05)]",
        item.style,
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-75" />
      {item.label}
    </span>
  );
}

export interface PriorityBadgeProps {
  priority: TaskPriority;
  className?: string;
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const config: Record<TaskPriority, { label: string; style: string }> = {
    LOW: { label: "Thấp", style: "bg-slate-50 text-slate-600 border-slate-200" },
    NORMAL: { label: "Bình thường", style: "bg-blue-50 text-blue-700 border-blue-200" },
    HIGH: { label: "Cao", style: "bg-amber-50 text-amber-800 border-amber-200" },
    URGENT: { label: "Khẩn cấp", style: "bg-red-50 text-red-700 border-red-200" },
  };

  const item = config[priority];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[11px] font-semibold leading-none",
        item.style,
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-75" />
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
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold leading-none",
        item.style,
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-75" />
      {item.label}
    </span>
  );
}

export function OverdueBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold leading-none text-red-700",
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-75" />
      Quá hạn
    </span>
  );
}

export function BlockedBadge({ reason, className }: { reason?: string | null; className?: string }) {
  return (
    <span
      title={reason || undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold leading-none text-amber-800",
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-75" />
      Vướng mắc
    </span>
  );
}

export function DueSoonBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold leading-none text-amber-800",
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-75" />
      Sắp đến hạn
    </span>
  );
}
