import { Loader2, AlertCircle, AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
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
  confirmLabel = "确认",
  cancelLabel = "取消",
  variant = "danger",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  const iconBg = variant === "danger"
    ? "bg-red-500/10"
    : "bg-[var(--gold)]/10";
  const iconColor = variant === "danger"
    ? "text-red-500"
    : "text-[var(--gold)]";
  const Icon = variant === "danger" ? AlertCircle : AlertTriangle;

  const confirmBg = variant === "danger"
    ? "bg-red-500 hover:bg-red-600 text-white shadow-[0_0_12px_rgba(239,68,68,0.3)]"
    : "bg-[var(--gold)] hover:bg-[var(--gold)]/90 text-[var(--ink)] shadow-[0_0_12px_rgba(201,168,76,0.3)]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <div
        className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] shadow-xl w-full max-w-md overflow-hidden dao-bagua-corner"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-full ${iconBg} flex items-center justify-center`}>
              <Icon className={`w-5 h-5 ${iconColor}`} />
            </div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
          </div>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{message}</p>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--border-subtle)] bg-[var(--bg-secondary)]/50">
          <button
            onClick={onCancel}
            disabled={loading}
            className="dao-btn-ghost text-sm"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${confirmBg} disabled:opacity-50`}
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
