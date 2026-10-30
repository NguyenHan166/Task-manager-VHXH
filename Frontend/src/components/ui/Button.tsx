import React from "react";
import { cn } from "../../shared/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 disabled:opacity-50 disabled:pointer-events-none rounded-btn select-none";

    const variantStyles = {
      primary: "bg-brand-700 text-white hover:bg-brand-800 shadow-sm active:scale-[0.99]",
      secondary: "bg-brand-50 text-brand-700 hover:bg-brand-100 border border-brand-100",
      outline: "border border-border bg-surface text-text-primary hover:bg-gray-50",
      ghost: "text-text-secondary hover:text-text-primary hover:bg-gray-100",
      danger: "bg-danger text-white hover:bg-red-800 shadow-sm",
    };

    const sizeStyles = {
      sm: "h-7 px-2.5 text-xs gap-1.5",
      md: "h-8 px-3.5 text-sm gap-2",
      lg: "h-10 px-4 text-sm gap-2",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      >
        {isLoading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8H4z"
            ></path>
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
