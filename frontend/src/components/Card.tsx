import { type ReactNode } from "react";

export interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className = "", onClick }: CardProps) {
  return (
    <div
      className={`dao-card dao-bagua-corner ${className}`}
      onClick={onClick}
      style={onClick ? { cursor: "pointer" } : {}}
    >
      {children}
    </div>
  );
}

export default Card;
