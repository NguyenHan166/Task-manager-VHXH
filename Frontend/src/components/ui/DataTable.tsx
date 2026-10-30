import React from "react";
import { cn } from "../../shared/utils";

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  width?: string;
  className?: string;
  render: (item: T, index: number) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  onRowClick?: (item: T) => void;
  isLoading?: boolean;
  emptyContent?: React.ReactNode;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  isLoading,
  emptyContent,
  className,
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div className="rounded-card border border-transparent bg-surface overflow-hidden shadow-card">
        <div className="h-11 bg-slate-50 border-b border-border flex items-center px-4">
          <div className="h-4 bg-slate-200 rounded w-1/4 animate-pulse" />
        </div>
        <div className="divide-y divide-border/60">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-[52px] px-4 flex items-center gap-4">
              <div className="h-4 bg-slate-100 rounded w-16 animate-pulse" />
              <div className="h-4 bg-slate-100 rounded w-1/3 animate-pulse" />
              <div className="h-4 bg-slate-100 rounded w-20 animate-pulse ml-auto" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-card border border-transparent bg-surface p-8 text-center shadow-card">
        {emptyContent || <p className="text-sm text-text-muted">Không có dữ liệu để hiển thị.</p>}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-card border border-transparent bg-surface overflow-hidden shadow-card",
        className
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead className="bg-[#fafafa] border-b border-[#f0f0f0] text-[13px] font-semibold text-text-secondary select-none">
            <tr className="h-11">
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  className={cn("px-4 py-2 font-medium tracking-tight whitespace-nowrap", col.className)}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f0f0] text-text-primary">
            {data.map((item, idx) => {
              const isClickable = Boolean(onRowClick);
              return (
                <tr
                  key={keyExtractor(item)}
                  onClick={() => onRowClick?.(item)}
                  onKeyDown={(e) => {
                    if (isClickable && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onRowClick?.(item);
                    }
                  }}
                  role={isClickable ? "button" : undefined}
                  tabIndex={isClickable ? 0 : undefined}
                  className={cn(
                    "h-[52px] transition-colors group",
                    isClickable
                      ? "cursor-pointer hover:bg-brand-50/60 focus:bg-brand-50/60 focus:outline-none"
                      : "hover:bg-slate-50/70"
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn("px-4 py-2 text-[13px]", col.className)}
                    >
                      {col.render(item, idx)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
