import { forwardRef, type ReactNode } from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  error?: ReactNode;
  icon?: ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    { 
      label, 
      error, 
      icon, 
      className = "", 
      placeholder,
      ...props 
    },
    ref
  ) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="text-sm font-medium text-text-secondary">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            className={`dao-input ${icon ? "pl-9" : ""} ${className}`}
            placeholder={placeholder}
            {...props}
          />
        </div>
        {error && (
          <span className="text-sm text-danger">{error}</span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export default Input;
