import React from "react";
import { cn } from "../../shared/utils";
import { Search, X } from "lucide-react";

export interface FilterOption {
  label: string;
  value: string;
  count?: number;
}

export interface FilterBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: React.ReactNode;
  activeFilterCount?: number;
  onClearFilters?: () => void;
  className?: string;
}

export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Tìm kiếm theo từ khóa...",
  filters,
  activeFilterCount,
  onClearFilters,
  className,
}: FilterBarProps) {
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-surface rounded-card border border-border shadow-xs",
        className
      )}
    >
      <div className="flex flex-1 items-center gap-2.5 flex-wrap">
        {/* Search input (max-w 320px on desktop) */}
        <div className="relative w-full sm:w-[280px] lg:w-[320px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full h-9 pl-9 pr-8 rounded-btn bg-white border border-border text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-700"
          />
          {searchValue && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter slot */}
        {filters && (
          <div className="flex items-center gap-2 flex-wrap">
            {filters}
          </div>
        )}
      </div>

      {/* Clear filter indicator */}
      {activeFilterCount && activeFilterCount > 0 && onClearFilters && (
        <button
          onClick={onClearFilters}
          className="text-xs font-medium text-brand-700 hover:text-brand-800 flex items-center gap-1 self-center shrink-0 hover:underline"
        >
          <X className="w-3.5 h-3.5" />
          Xóa {activeFilterCount} bộ lọc
        </button>
      )}
    </div>
  );
}
