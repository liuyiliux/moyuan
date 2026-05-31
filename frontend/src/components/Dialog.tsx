import { type ReactNode } from "react";
import { X } from "lucide-react";
import Button from "./Button";

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  confirmText?: string;
  onConfirm?: () => void;
  cancelText?: string;
}

export function Dialog({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  confirmText = "确定", 
  onConfirm,
  cancelText = "取消"
}: DialogProps) {
  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="dao-dialog-overlay"
      onClick={handleOverlayClick}
    >
      <div className="dao-dialog">
        {title && (
          <div className="dao-dialog-header">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{title}</h3>
              <button 
                onClick={onClose}
                className="p-1.5 rounded hover:bg-bg-secondary transition-colors"
              >
                <X className="w-4 h-4 text-text-muted" />
              </button>
            </div>
          </div>
        )}
        <div className="dao-dialog-body">
          {children}
        </div>
        <div className="dao-dialog-footer">
          <Button variant="ghost" onClick={onClose}>
            {cancelText}
          </Button>
          {onConfirm && (
            <Button variant="primary" onClick={onConfirm}>
              {confirmText}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dialog;
