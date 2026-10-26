import React from "react";
import { cn } from "../../shared/utils";

export type StatVariant = "brand" | "info" | "warning" | "danger" | "success" | "review" | "neutral";

export interface StatCardProps {
  label: string;
  value: number | string;
  description?: string;
  icon?: React.ReactNode;
  variant?: StatVariant;
  onClick?: () => void;
  className?: string;
  badge?: React.ReactNode;
}

export function StatCard({
  label,
  value,
  description,
  icon,
  variant = "brand",
  onClick,
  className,
  badge,
}: StatCardProps) {
  const variantStyles: Record<
    StatVariant,
    { iconBg: string; iconColor: string; valueColor: string; borderAccent?: string }
  > = {
    brand: {
      iconBg: "bg-brand-50",
      iconColor: "text-brand-700",
      valueColor: "text-brand-700",
      borderAccent: "border-l-4 border-l-brand-700",
    },
    info: {
      iconBg: "bg-blue-50",
      iconColor: "text-info",
      valueColor: "text-info",
      borderAccent: "border-l-4 border-l-info",
    },
    warning: {
      iconBg: "bg-amber-50",
      iconColor: "text-warning",
      valueColor: "text-warning",
      borderAccent: "border-l-4 border-l-warning",
    },
    danger: {
      iconBg: "bg-red-50",
      iconColor: "text-danger",
      valueColor: "text-danger",
      borderAccent: "border-l-4 border-l-danger",
    },
    success: {
      iconBg: "bg-emerald-50",
      iconColor: "text-success",
      valueColor: "text-success",
      borderAccent: "border-l-4 border-l-success",
    },
    review: {
      iconBg: "bg-purple-50",
      iconColor: "text-review",
      valueColor: "text-review",
      borderAccent: "border-l-4 border-l-review",
    },
    neutral: {
      iconBg: "bg-slate-100",
      iconColor: "text-text-secondary",
      valueColor: "text-text-primary",
      borderAccent: "border-l-4 border-l-slate-400",
    },
  };

  const style = variantStyles[variant];
  const isClickable = Boolean(onClick);

  return (
    <div
      onClick={onClick}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      className={cn(
        "rounded-card bg-surface border border-border shadow-card p-5 transition-all select-none",
        style.borderAccent,
        isClickable && "cursor-pointer hover:-translate-y-0.5 hover:shadow-md hover:border-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-700",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs leading-[18px] font-medium text-text-muted uppercase tracking-wider truncate">
              {label}
            </span>
            {badge}
          </div>
          <div
            className={cn(
              "text-[28px] sm:text-[30px] leading-[36px] font-bold tabular-nums tracking-tight",
              style.valueColor
            )}
          >
            {value}
          </div>
          {description && (
            <div className="text-xs leading-[18px] text-text-secondary line-clamp-1">
              {description}
            </div>
          )}
        </div>

        {icon && (
          <div
            className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 shadow-xs",
              style.iconBg,
              style.iconColor
            )}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
