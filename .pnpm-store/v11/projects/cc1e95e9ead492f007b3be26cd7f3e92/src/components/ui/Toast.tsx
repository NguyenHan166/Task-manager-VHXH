import React, { createContext, useContext, useState, useCallback } from "react";
import { cn } from "../../shared/utils";
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = "success") => {
    const id = `toast_${Date.now()}_${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      removeToast(id);
    }, 4000);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast viewport */}
      <div
        aria-live="polite"
        className="fixed top-4 right-4 sm:top-5 sm:right-6 z-[9999] flex flex-col gap-2 max-w-sm w-[calc(100vw-32px)] sm:w-full pointer-events-none"
      >
        {toasts.map((t) => {
          const typeConfig: Record<
            ToastType,
            { bg: string; border: string; text: string; icon: React.ReactNode }
          > = {
            success: {
              bg: "bg-surface",
              border: "border-emerald-200 border-l-4 border-l-emerald-600",
              text: "text-text-primary",
              icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />,
            },
            error: {
              bg: "bg-surface",
              border: "border-red-200 border-l-4 border-l-danger",
              text: "text-text-primary",
              icon: <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />,
            },
            warning: {
              bg: "bg-surface",
              border: "border-amber-200 border-l-4 border-l-warning",
              text: "text-text-primary",
              icon: <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />,
            },
            info: {
              bg: "bg-surface",
              border: "border-blue-200 border-l-4 border-l-info",
              text: "text-text-primary",
              icon: <Info className="w-4 h-4 text-info shrink-0 mt-0.5" />,
            },
          };

          const cfg = typeConfig[t.type];

          return (
            <div
              key={t.id}
              className={cn(
                "pointer-events-auto rounded-btn shadow-xl border p-3.5 flex items-start gap-2.5 transition-all text-xs animate-slide-down",
                cfg.bg,
                cfg.border,
                cfg.text
              )}
            >
              {cfg.icon}
              <div className="flex-1 font-medium leading-relaxed">{t.message}</div>
              <button
                onClick={() => removeToast(t.id)}
                aria-label="Đóng thông báo"
                className="text-text-muted hover:text-text-primary transition-colors p-0.5 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
