import { useState } from "react";
import { AlertTriangle, Copy, Trash2, SkipForward } from "lucide-react";
import type { DuplicateInfo } from "../api/content";

interface DuplicateModalProps {
  filename: string;
  duplicates: DuplicateInfo[];
  onSkip: () => void;
  onOverwrite: (targetId: string) => void;
  onKeepBoth: () => void;
  onCancel: () => void;
  uploading: boolean;
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DuplicateModal({
  filename,
  duplicates,
  onSkip,
  onOverwrite,
  onKeepBoth,
  onCancel,
  uploading,
}: DuplicateModalProps) {
  const [selectedId, setSelectedId] = useState<string>(duplicates[0]?.id || "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[var(--bg-card)] dark:bg-[var(--bg-card)] rounded-2xl shadow-xl border border-[var(--border-subtle)] dark:border-[var(--border-subtle)] w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 bg-[var(--warning-soft)] dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800">
          <AlertTriangle className="w-6 h-6 text-[var(--warning)] dark:text-amber-400" />
          <div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">发现重复文件</h3>
            <p className="text-xs text-[var(--text-muted)] dark:text-[var(--text-muted)]">
              文件 &ldquo;{filename}&rdquo; 已存在
            </p>
          </div>
        </div>

        {/* Duplicates list — 可选择覆盖目标 */}
        <div className="px-6 py-4 space-y-3">
          <p className="text-sm text-[var(--text-secondary)] dark:text-[var(--text-muted)]">
            知识库中已存在以下匹配文件（选择要覆盖的目标）：
          </p>
          <div className="max-h-48 overflow-y-auto space-y-2">
            {duplicates.map((d) => (
              <label
                key={d.id}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedId === d.id
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-[var(--border-subtle)] dark:border-[var(--border-subtle)] hover:bg-[var(--bg-primary)] dark:hover:bg-[var(--bg-elevated)]"
                }`}
              >
                <input
                  type="radio"
                  name="overwrite-target"
                  checked={selectedId === d.id}
                  onChange={() => setSelectedId(d.id)}
                  className="accent-[var(--accent)]"
                />
                <Copy className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">
                    {d.title}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] dark:text-[var(--text-muted)]">
                    {d.content_type} · {formatSize(d.file_size)}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-[var(--border-subtle)] dark:border-[var(--border-subtle)] flex flex-col gap-2">
          <button
            onClick={onSkip}
            disabled={uploading}
            className="taste-btn-secondary text-sm w-full justify-center"
          >
            <SkipForward className="w-4 h-4" />
            跳过，不上传此文件
          </button>
          <button
            onClick={() => onOverwrite(selectedId)}
            disabled={uploading || !selectedId}
            className="flex items-center justify-center gap-2 w-full py-2.5 bg-[var(--warning-soft)] dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 rounded-lg text-sm font-medium hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors disabled:opacity-40"
          >
            <Trash2 className="w-4 h-4" />
            覆盖选中文件
          </button>
          <button
            onClick={onKeepBoth}
            disabled={uploading}
            className="flex items-center justify-center gap-2 w-full py-2.5 bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 rounded-lg text-sm font-medium hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors disabled:opacity-40"
          >
            <Copy className="w-4 h-4" />
            保留两者（额外创建一份）
          </button>
          <button
            onClick={onCancel}
            disabled={uploading}
            className="w-full py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-muted)] transition-colors disabled:opacity-40"
          >
            取消整个上传
          </button>
        </div>
      </div>
    </div>
  );
}
