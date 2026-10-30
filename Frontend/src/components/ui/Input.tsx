import React from "react";
import { cn } from "../../shared/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, required, id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="space-y-2 w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-[13px] font-medium text-text-primary select-none"
          >
            {label}
            {required && <span className="text-danger ml-0.5">*</span>}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          className={cn(
            "w-full h-9 px-3 rounded-btn bg-surface border text-sm text-text-primary placeholder:text-text-muted transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-brand-700 focus:border-transparent",
            "disabled:bg-slate-50 disabled:text-text-muted disabled:cursor-not-allowed",
            error ? "border-danger focus:ring-danger" : "border-border",
            className
          )}
          {...props}
        />
        {hint && !error && (
          <p className="text-[11px] text-text-muted leading-tight">{hint}</p>
        )}
        {error && (
          <p className="text-[11px] text-danger font-medium leading-tight">{error}</p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, required, id, rows = 3, ...props }, ref) => {
    const textareaId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="space-y-2 w-full">
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-[13px] font-medium text-text-primary select-none"
          >
            {label}
            {required && <span className="text-danger ml-0.5">*</span>}
          </label>
        )}
        <textarea
          id={textareaId}
          ref={ref}
          rows={rows}
          className={cn(
            "w-full p-3 rounded-btn bg-surface border text-sm text-text-primary placeholder:text-text-muted transition-colors resize-y",
            "focus:outline-none focus:ring-2 focus:ring-brand-700 focus:border-transparent",
            "disabled:bg-slate-50 disabled:text-text-muted disabled:cursor-not-allowed",
            error ? "border-danger focus:ring-danger" : "border-border",
            className
          )}
          {...props}
        />
        {hint && !error && (
          <p className="text-[11px] text-text-muted leading-tight">{hint}</p>
        )}
        {error && (
          <p className="text-[11px] text-danger font-medium leading-tight">{error}</p>
        )}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  options?: Array<{ label: string; value: string }>;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, hint, required, id, options, children, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="space-y-2 w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-[13px] font-medium text-text-primary select-none"
          >
            {label}
            {required && <span className="text-danger ml-0.5">*</span>}
          </label>
        )}
        <select
          id={selectId}
          ref={ref}
          className={cn(
            "w-full h-9 px-3 rounded-btn bg-surface border text-sm text-text-primary transition-colors cursor-pointer",
            "focus:outline-none focus:ring-2 focus:ring-brand-700 focus:border-transparent",
            "disabled:bg-slate-50 disabled:text-text-muted disabled:cursor-not-allowed",
            error ? "border-danger focus:ring-danger" : "border-border",
            className
          )}
          {...props}
        >
          {options
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        {hint && !error && (
          <p className="text-[11px] text-text-muted leading-tight">{hint}</p>
        )}
        {error && (
          <p className="text-[11px] text-danger font-medium leading-tight">{error}</p>
        )}
      </div>
    );
  }
);
Select.displayName = "Select";
