import { type ReactNode } from "react";

export interface BadgeProps {
  variant?: "default" | "gold";
  children: ReactNode;
  className?: string;
}

export function Badge({ variant = "default", children, className = "" }: BadgeProps) {
  const baseStyles = "dao-badge";
  
  const variantStyles = {
    default: "",
    gold: "dao-badge-gold",
  };

  return (
    <span className={`${baseStyles} ${variantStyles[variant]} ${className}`}>
      {children}
    </span>
  );
}

export default Badge;
