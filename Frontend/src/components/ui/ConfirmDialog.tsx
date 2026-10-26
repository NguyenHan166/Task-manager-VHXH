import React, { useEffect } from "react";
import { cn } from "../../shared/utils";
import { Button } from "./Button";
import { AlertTriangle, Info, X } from "lucide-react";

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  confirmText?: string;
  cancelLabel?: string;
  cancelText?: string;
  variant?: "danger" | "primary";
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
  onClose?: () => void;
  children?: React.ReactNode;
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel,
  confirmText,
  cancelLabel,
  cancelText,
  variant = "primary",
  isLoading = false,
  onConfirm,
  onCancel,
  onClose,
  children,
}: ConfirmDialogProps) {
  const handleClose = onCancel || onClose || (() => {});
  const finalConfirmLabel = confirmText || confirmLabel || "Xác nhận";
  const finalCancelLabel = cancelText || cancelLabel || "Hủy bỏ";
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isLoading) {
        handleClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isLoading, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity animate-fade-in"
        onClick={() => {
          if (!isLoading) handleClose();
        }}
      />

      {/* Modal Dialog */}
      <div
        className={cn(
          "relative bg-surface rounded-card border border-border shadow-2xl max-w-md w-full p-5 sm:p-6 z-10 animate-scale-up max-h-[90vh] overflow-y-auto"
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3.5">
            <div
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-xs",
                variant === "danger"
                  ? "bg-red-100 text-danger"
                  : "bg-brand-100 text-brand-700"
              )}
            >
              {variant === "danger" ? (
                <AlertTriangle className="w-5 h-5" />
              ) : (
                <Info className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="text-base font-bold text-text-primary tracking-tight">
                {title}
              </h3>
              {description && (
                <p className="text-xs leading-[20px] text-text-secondary mt-1">
                  {description}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isLoading}
            aria-label="Đóng hộp thoại"
            className="text-text-muted hover:text-text-primary p-1 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-brand-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {children && <div className="mt-4">{children}</div>}

        <div className="flex items-center justify-end gap-2.5 mt-6 pt-3 border-t border-border/80">
          <Button
            variant="outline"
            size="md"
            disabled={isLoading}
            onClick={handleClose}
          >
            {finalCancelLabel}
          </Button>
          <Button
            variant={variant === "danger" ? "danger" : "primary"}
            size="md"
            isLoading={isLoading}
            onClick={onConfirm}
          >
            {finalConfirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
