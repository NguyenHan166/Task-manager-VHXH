import React from "react";
import { cn } from "../../shared/utils";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "./Button";

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
  icon?: React.ReactNode;
}

export function ErrorState({
  title = "Đã xảy ra sự cố",
  message = "Không thể tải dữ liệu vào lúc này. Vui lòng thử lại sau.",
  onRetry,
  className,
  icon,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "rounded-card border border-red-200 bg-red-50/60 p-6 sm:p-8 text-center flex flex-col items-center justify-center max-w-lg mx-auto",
        className
      )}
    >
      <div className="w-12 h-12 rounded-full bg-red-100 text-danger flex items-center justify-center mb-3 shadow-xs">
        {icon || <AlertCircle className="w-6 h-6" />}
      </div>
      <h3 className="text-base font-semibold text-danger tracking-tight">
        {title}
      </h3>
      <p className="text-xs leading-[20px] text-text-secondary mt-1.5 max-w-sm">
        {message}
      </p>
      {onRetry && (
        <div className="mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="border-red-200 bg-white hover:bg-red-50 text-danger gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Thử lại
          </Button>
        </div>
      )}
    </div>
  );
}
