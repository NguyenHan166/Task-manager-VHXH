import { cn } from "../../shared/utils";
import type { TaskPriority, TaskStatus, TaskType } from "../../shared/data-contract";

// Small outlined labels follow the light, semantic Ant Design tags used by the
// reference admin while keeping the task manager's Vietnamese labels.
const badgeBase =
  "inline-flex min-h-[22px] items-center rounded border px-2 py-0.5 text-xs font-medium leading-4 whitespace-nowrap";
const categoryBadgeBase =
  "inline-flex min-h-[22px] items-center rounded px-2 py-0.5 text-xs font-semibold leading-4 whitespace-nowrap text-white";

export interface StatusBadgeProps {
  status: TaskStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config: Record<TaskStatus, { label: string; style: string }> = {
    DRAFT: { label: "Nháp", style: "bg-[#fafafa] text-[#595959] border-[#d9d9d9]" },
    TODO: { label: "Chưa làm", style: "bg-[#e6f4ff] text-[#1677ff] border-[#91caff]" },
    IN_PROGRESS: { label: "Đang làm", style: "bg-[#fff7e6] text-[#d46b08] border-[#ffd591]" },
    IN_REVIEW: { label: "Chờ duyệt", style: "bg-[#f9f0ff] text-[#722ed1] border-[#d3adf7]" },
    DONE: { label: "Hoàn thành", style: "bg-[#f6ffed] text-[#389e0d] border-[#b7eb8f]" },
    CANCELLED: { label: "Đã hủy", style: "bg-[#fafafa] text-[#595959] border-[#d9d9d9]" },
  };

  const item = config[status] || {
    label: status,
    style: "bg-[#fafafa] text-[#595959] border-[#d9d9d9]",
  };

  return <span className={cn(badgeBase, item.style, className)}>{item.label}</span>;
}

export interface PriorityBadgeProps {
  priority: TaskPriority;
  className?: string;
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const config: Record<TaskPriority, { label: string; style: string }> = {
    LOW: { label: "Thấp", style: "bg-[#8c8c8c]" },
    NORMAL: { label: "Bình thường", style: "bg-[#1890ff]" },
    HIGH: { label: "Cao", style: "bg-[#fa8c16]" },
    URGENT: { label: "Khẩn cấp", style: "bg-[#ff4d4f]" },
  };

  const item = config[priority];

  return <span className={cn(categoryBadgeBase, item.style, className)}>{item.label}</span>;
}

export interface TaskTypeBadgeProps {
  type: TaskType;
  className?: string;
}

export function TaskTypeBadge({ type, className }: TaskTypeBadgeProps) {
  const config: Record<TaskType, { label: string; style: string }> = {
    OFFICIAL: {
      label: "Chính thức",
      style: "bg-[#1890ff]",
    },
    TEAM: {
      label: "Cộng tác nhóm",
      style: "bg-[#722ed1]",
    },
    PERSONAL: {
      label: "Cá nhân",
      style: "bg-[#8c8c8c]",
    },
  };

  const item = config[type];

  return <span className={cn(categoryBadgeBase, item.style, className)}>{item.label}</span>;
}

export function OverdueBadge({ className }: { className?: string }) {
  return (
    <span className={cn(badgeBase, "border-[#ffa39e] bg-[#fff1f0] text-[#cf1322]", className)}>
      Quá hạn
    </span>
  );
}

export function BlockedBadge({ reason, className }: { reason?: string | null; className?: string }) {
  return (
    <span
      title={reason || undefined}
      className={cn(badgeBase, "border-[#ffd591] bg-[#fff7e6] text-[#d46b08]", className)}
    >
      Vướng mắc
    </span>
  );
}

export function DueSoonBadge({ className }: { className?: string }) {
  return (
    <span className={cn(badgeBase, "border-[#ffd591] bg-[#fff7e6] text-[#d46b08]", className)}>
      Sắp đến hạn
    </span>
  );
}
