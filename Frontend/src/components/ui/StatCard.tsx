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
        "rounded-card bg-surface border border-border shadow-card p-3 sm:p-5 transition-all select-none flex flex-col justify-between h-full min-w-0",
        style.borderAccent,
        isClickable && "cursor-pointer hover:-translate-y-0.5 hover:shadow-md hover:border-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-700 active:scale-[0.98]",
        className
      )}
    >
      {/* Top Row: Label & Icon */}
      <div className="flex items-start justify-between gap-1.5 sm:gap-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1 min-h-[28px] sm:min-h-0">
          <span
            className="text-[11px] sm:text-xs font-semibold text-text-muted uppercase tracking-tight sm:tracking-wider line-clamp-2 leading-tight"
            title={label}
          >
            {label}
          </span>
          {badge}
        </div>

        {icon && (
          <div
            className={cn(
              "w-7 h-7 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0 shadow-xs",
              style.iconBg,
              style.iconColor
            )}
          >
            <span className="[&>svg]:w-3.5 [&>svg]:h-3.5 sm:[&>svg]:w-5 sm:[&>svg]:h-5 flex items-center justify-center">
              {icon}
            </span>
          </div>
        )}
      </div>

      {/* Middle: Big Value */}
      <div
        className={cn(
          "text-2xl sm:text-[30px] leading-tight font-bold tabular-nums tracking-tight mt-1.5 sm:mt-2",
          style.valueColor
        )}
      >
        {value}
      </div>

      {/* Bottom: Description (Full Width) */}
      {description && (
        <div
          className="text-[11px] sm:text-xs leading-normal text-text-secondary line-clamp-1 mt-1 truncate"
          title={description}
        >
          {description}
        </div>
      )}
    </div>
  );
}
