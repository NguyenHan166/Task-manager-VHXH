import React from "react";
import { cn } from "../../shared/utils";

export interface SectionHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function SectionHeader({
  title,
  description,
  actions,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3",
        className
      )}
    >
      <div>
        <h2 className="text-[20px] leading-[28px] font-semibold text-text-primary tracking-tight">
          {title}
        </h2>
        {description && (
          <p className="text-xs leading-[18px] text-text-muted mt-0.5">
            {description}
          </p>
        )}
      </div>

      {actions && (
        <div className="flex items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
