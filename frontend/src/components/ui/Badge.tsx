import React from "react";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "error";
  className?: string;
}

const variantStyles = {
  default: "bg-[var(--bg-secondary)] text-[var(--text-secondary)] dark:bg-[var(--bg-elevated)] dark:text-[var(--text-muted)]",
  success: "bg-[var(--success-soft)] text-green-700 dark:bg-green-900/30 dark:text-green-400",
  warning: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  error: "bg-[var(--danger-soft)] text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export function Badge({ children, variant = "default", className = "" }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${variantStyles[variant]} ${className}`}>
      {children}
    </span>
  );
}
