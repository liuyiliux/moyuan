import { Loader2, AlertCircle, AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  children,
  confirmLabel = "确认",
  cancelLabel = "取消",
  variant = "danger",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  const iconBg = variant === "danger"
    ? "bg-red-500/15"
    : "bg-[var(--gold)]/15";
  const iconColor = variant === "danger"
    ? "text-red-500"
    : "text-[var(--gold)]";
  const Icon = variant === "danger" ? AlertCircle : AlertTriangle;

  const confirmBg = variant === "danger"
    ? "bg-red-500 hover:bg-red-600 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)]"
    : "bg-[var(--gold)] hover:bg-[var(--gold)]/90 text-[var(--ink)] shadow-[0_0_20px_rgba(201,168,76,0.4)]";

  return createPortal(
    <div
      className="fixed top-0 left-0 right-0 bottom-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 min-h-screen"
      onClick={onCancel}
      style={{ isolation: "isolate" }}
    >
      <div
        className="relative bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[var(--jade)] to-transparent opacity-60"></div>
        <div className="p-7">
          <div className="flex items-center gap-4 mb-5">
            <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center shadow-inner`}>
              <Icon className={`w-6 h-6 ${iconColor}`} />
            </div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] tracking-wide">{title}</h2>
          </div>
          <p className="text-base text-[var(--text-secondary)] leading-relaxed">{message}</p>
          {children}
        </div>
        <div className="flex justify-end gap-3 px-7 py-5 border-t border-[var(--border-subtle)] bg-[var(--bg-secondary)]/70 backdrop-blur-sm">
          <button
            onClick={onCancel}
            disabled={loading}
            className="dao-btn-ghost text-sm px-5"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium rounded-xl transition-all ${confirmBg} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
