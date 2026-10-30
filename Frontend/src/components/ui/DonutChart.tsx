import { useState } from "react";
import { cn } from "../../shared/utils";

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

export interface DonutChartProps {
  segments: DonutSegment[];
  totalLabel?: string;
  size?: number;
  thickness?: number;
  className?: string;
}

export function DonutChart({
  segments,
  totalLabel = "Tổng cộng",
  size = 200,
  thickness = 28,
  className,
}: DonutChartProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const total = segments.reduce((sum, s) => sum + s.value, 0);

  // SVG calculations
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let accumulatedOffset = 0;

  const hoveredSegment = segments.find((s) => s.key === hoveredKey);

  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-6", className)}>
      {/* SVG Donut Circle */}
      <div className="relative shrink-0 flex items-center justify-center" style={{ width: size, height: size }}>
        <svg
          role="img"
          aria-label={`Biểu đồ phân bố ${totalLabel}`}
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="transform -rotate-90"
        >
          {/* Background circle if total is 0 */}
          {total === 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="#E2E8F0"
              strokeWidth={thickness}
              fill="transparent"
            />
          )}

          {total > 0 &&
            segments.map((seg) => {
              if (seg.value === 0) return null;
              const strokeLength = (seg.value / total) * circumference;
              const strokeDasharray = `${strokeLength} ${circumference - strokeLength}`;
              const strokeDashoffset = -accumulatedOffset;
              accumulatedOffset += strokeLength;

              const isHovered = hoveredKey === seg.key;

              return (
                <circle
                  key={seg.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={seg.color}
                  strokeWidth={isHovered ? thickness + 4 : thickness}
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  fill="transparent"
                  onMouseEnter={() => setHoveredKey(seg.key)}
                  onMouseLeave={() => setHoveredKey(null)}
                  className="transition-all duration-200 cursor-pointer"
                />
              );
            })}
        </svg>

        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
          <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">
            {hoveredSegment ? hoveredSegment.label : totalLabel}
          </span>
          <span className="text-2xl font-bold font-mono text-text-primary tracking-tight">
            {hoveredSegment ? hoveredSegment.value : total}
          </span>
          {hoveredSegment && total > 0 && (
            <span className="text-[10px] text-text-secondary font-medium">
              {Math.round((hoveredSegment.value / total) * 100)}%
            </span>
          )}
        </div>
      </div>

      {/* Legend & Breakdown List (Accessible on both desktop and mobile) */}
      <div className="flex-1 w-full min-w-[180px] space-y-2">
        {segments.map((seg) => {
          const percent = total > 0 ? Math.round((seg.value / total) * 100) : 0;
          const isHovered = hoveredKey === seg.key;

          return (
            <div
              key={seg.key}
              onMouseEnter={() => setHoveredKey(seg.key)}
              onMouseLeave={() => setHoveredKey(null)}
              className={cn(
                "flex items-center justify-between p-2 rounded-btn text-xs transition-colors cursor-pointer",
                isHovered ? "bg-slate-100 font-semibold" : "hover:bg-slate-50 text-text-secondary"
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-3 h-3 rounded-full shrink-0 shadow-2xs"
                  style={{ backgroundColor: seg.color }}
                />
                <span className="truncate text-text-primary">{seg.label}</span>
              </div>

              <div className="flex items-center gap-2 tabular-nums shrink-0">
                <span className="font-bold text-text-primary">{seg.value}</span>
                <span className="text-[11px] text-text-muted w-9 text-right font-mono">
                  {percent}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
