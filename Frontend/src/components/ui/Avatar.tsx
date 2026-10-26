import { cn } from "../../shared/utils";
import type { User } from "../../shared/data-contract";

export interface UserAvatarProps {
  user?: User | null;
  name?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  showRoleBadge?: boolean;
}

export function UserAvatar({
  user,
  name,
  size = "md",
  className,
  showRoleBadge = false,
}: UserAvatarProps) {
  const displayName = user?.displayName || name || "Người dùng";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(-2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  const sizeStyles = {
    sm: "w-7 h-7 text-xs",
    md: "w-9 h-9 text-sm",
    lg: "w-11 h-11 text-base",
  };

  const isManager = user?.role === "MANAGER";

  return (
    <div className="relative inline-block">
      <div
        className={cn(
          "rounded-full flex items-center justify-center font-semibold select-none border border-border shadow-xs",
          isManager
            ? "bg-teal-700 text-white"
            : "bg-slate-200 text-slate-700",
          sizeStyles[size],
          className
        )}
        title={`${displayName} (${user?.jobTitle || (isManager ? "Trưởng phòng" : "Chuyên viên")})`}
      >
        {initials}
      </div>
      {showRoleBadge && user && (
        <span
          className={cn(
            "absolute -bottom-1 -right-1 text-[9px] font-bold px-1 rounded-full border",
            isManager
              ? "bg-emerald-600 text-white border-white"
              : "bg-slate-600 text-white border-white"
          )}
        >
          {isManager ? "M" : "S"}
        </span>
      )}
    </div>
  );
}
