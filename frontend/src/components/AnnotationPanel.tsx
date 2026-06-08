import { useState } from "react";
import { Trash2, Loader2, MessageSquare, X } from "lucide-react";
import { annotationApi, type Annotation } from "../api/annotations";
import ConfirmDialog from "./ConfirmDialog";
import Toast from "./Toast";

interface AnnotationPanelProps {
  annotations: Annotation[];
  loading: boolean;
  onLocate: (annotation: Annotation) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function AnnotationPanel({
  annotations,
  loading,
  onLocate,
  onDelete,
  onClose,
}: AnnotationPanelProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Annotation | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    try {
      await annotationApi.delete(deleteTarget.id);
      onDelete(deleteTarget.id);
      setDeleteTarget(null);
      setToast({ type: "success", message: "批注已删除" });
    } catch (err) {
      setToast({ type: "error", message: "删除失败: " + (err as Error).message });
    } finally {
      setDeletingId(null);
    }
  }

  function formatTime(dateStr: string) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "刚刚";
    if (minutes < 60) return `${minutes} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    if (days < 7) return `${days} 天前`;
    return date.toLocaleDateString("zh-CN");
  }

  return (
        <div className="w-80 bg-[var(--bg-primary)] dark:bg-[var(--bg-card)] border-l border-[var(--border-subtle)] dark:border-[var(--border-subtle)] h-full overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)] dark:border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[var(--text-muted)]" />
          <h3 className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
            批注
          </h3>
          <span className="text-xs text-[var(--text-muted)] dark:text-[var(--text-muted)] bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded-full">
            {annotations.length}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] dark:hover:bg-[var(--bg-elevated)] rounded-md transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-[var(--text-muted)] animate-spin" />
          </div>
        ) : annotations.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare className="w-8 h-8 text-[var(--text-muted)] dark:text-[var(--text-secondary)] mx-auto mb-2" />
            <p className="text-sm text-[var(--text-muted)] dark:text-[var(--text-muted)]">
              暂无批注
            </p>
            <p className="text-xs text-[var(--text-muted)] dark:text-[var(--text-muted)] mt-1">
              选中文本后可添加批注
            </p>
          </div>
        ) : (
          annotations.map((ann) => (
            <div
              key={ann.id}
              className="bg-[var(--bg-card)] dark:bg-[var(--bg-elevated)] rounded-xl p-3 shadow-[var(--shadow-sm)] border border-[var(--border-subtle)] dark:border-[var(--border-subtle)] hover:shadow-[var(--shadow-md)] transition-shadow"
            >
              {/* Selected text quote */}
              <div
                onClick={() => onLocate(ann)}
                className="cursor-pointer mb-2"
              >
                <div className="flex items-start gap-2">
                  <div className="w-0.5 h-4 bg-yellow-400 dark:bg-yellow-500 rounded-full mt-1 flex-shrink-0" />
                  <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-muted)] line-clamp-2 italic">
                    &ldquo;{ann.selected_text}&rdquo;
                  </p>
                </div>
              </div>

              {/* Annotation text */}
              <p className="text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-2">
                {ann.annotation_text}
              </p>

              {/* Footer */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-muted)] dark:text-[var(--text-muted)]">
                  {formatTime(ann.created_at)}
                </span>
                <button
                  onClick={() => setDeleteTarget(ann)}
                  disabled={deletingId === ann.id}
                  className="p-1 text-[var(--text-muted)] hover:text-[var(--danger)] dark:hover:text-red-400 hover:bg-[var(--danger-soft)] dark:hover:bg-red-950/30 rounded-md transition-colors disabled:opacity-50"
                >
                  {deletingId === ann.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Trash2 className="w-3 h-3" />
                  )}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除批注"
        message="确定要删除此批注吗？"
        confirmLabel="删除"
        cancelLabel="取消"
        variant="danger"
        loading={deletingId !== null}
        onConfirm={handleDelete}
        onCancel={() => { if (!deletingId) setDeleteTarget(null); }}
      />
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}
