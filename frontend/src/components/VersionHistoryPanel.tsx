import { useState, useEffect, useCallback } from "react";
import { Clock, RotateCcw, Loader2, X, ChevronRight } from "lucide-react";
import { noteVersionApi, type NoteVersion } from "../api/notes";

interface Props {
  noteId: string;
  currentContent: string;
  onClose: () => void;
  onRestore: (title: string, content: string) => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  if (diffHour < 24) return `${diffHour} 小时前`;
  if (diffDay < 7) return `${diffDay} 天前`;

  return d.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function VersionHistoryPanel({
  noteId,
  currentContent,
  onClose,
  onRestore,
}: Props) {
  const [versions, setVersions] = useState<NoteVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);

  const loadVersions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await noteVersionApi.getVersions(noteId);
      setVersions(data || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [noteId]);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  async function handleRestore(versionId: string) {
    setRestoring(versionId);
    try {
      const result = await noteVersionApi.restoreVersion(noteId, versionId);
      onRestore(result.title, result.content);
      await loadVersions();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRestoring(null);
      setConfirmRestore(null);
    }
  }

  return (
    <div className="w-80 border-l border-[var(--border-subtle)] dark:border-[var(--border-subtle)] bg-[var(--bg-card)] dark:bg-[var(--bg-card)] flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)] dark:border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-[var(--text-muted)]" />
          <span className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
            版本历史
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-[var(--bg-secondary)] dark:hover:bg-[var(--bg-elevated)] transition-colors"
        >
          <X className="w-4 h-4 text-[var(--text-muted)]" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
          </div>
        )}

        {error && (
          <div className="p-4 text-center">
            <p className="text-sm text-[var(--danger)]">{error}</p>
            <button
              onClick={loadVersions}
              className="mt-2 text-xs text-[var(--accent-text)] hover:underline"
            >
              重试
            </button>
          </div>
        )}

        {!loading && !error && versions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
            <Clock className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">暂无历史版本</p>
          </div>
        )}

        {!loading && !error && versions.length > 0 && (
          <div className="divide-y divide-[var(--border-subtle)]">
            {/* Current version */}
            <div className="px-4 py-3 bg-[var(--accent-soft)]/50 dark:bg-blue-900/10">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-[var(--accent-text)] dark:text-[var(--accent-text)] bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">
                  当前
                </span>
                <span className="text-xs text-[var(--text-muted)]">当前版本</span>
              </div>
              <p className="text-xs text-[var(--text-muted)] line-clamp-2">
                {currentContent?.slice(0, 80) || "（空内容）"}
                {(currentContent?.length || 0) > 80 && "..."}
              </p>
            </div>

            {/* History versions */}
            {versions.map((v) => (
              <div key={v.id} className="group">
                <button
                  onClick={() =>
                    setPreviewId(previewId === v.id ? null : v.id)
                  }
                  className="w-full px-4 py-3 text-left hover:bg-[var(--bg-primary)] dark:hover:bg-[var(--bg-elevated)]/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-[var(--text-muted)]">
                      {formatTime(v.updated_at)}
                    </span>
                    <ChevronRight
                      className={`w-3 h-3 text-[var(--text-muted)] transition-transform ${
                        previewId === v.id ? "rotate-90" : ""
                      }`}
                    />
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-muted)] line-clamp-2">
                    {v.text_content?.slice(0, 80) || "（空内容）"}
                    {(v.text_content?.length || 0) > 80 && "..."}
                  </p>
                </button>

                {/* Preview */}
                {previewId === v.id && (
                  <div className="px-4 pb-3 border-t border-[var(--border-subtle)] dark:border-[var(--border-subtle)]">
                    <div className="mt-2 p-3 bg-[var(--bg-primary)] dark:bg-[var(--bg-elevated)] rounded-lg max-h-48 overflow-y-auto">
                      <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-muted)] whitespace-pre-wrap">
                        {v.text_content || "（空内容）"}
                      </p>
                    </div>
                    <div className="mt-2 flex gap-2">
                      {confirmRestore === v.id ? (
                        <>
                          <button
                            onClick={() => handleRestore(v.id)}
                            disabled={restoring === v.id}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--text-inverse)] bg-[var(--accent)] hover:bg-[var(--accent)] rounded transition-colors disabled:opacity-50"
                          >
                            {restoring === v.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <RotateCcw className="w-3 h-3" />
                            )}
                            确认恢复
                          </button>
                    <button
                          onClick={() => setConfirmRestore(null)}
                          className="dao-btn dao-btn-ghost text-xs"
                        >
                            取消
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmRestore(v.id)}
                          className="dao-btn dao-btn-secondary text-xs flex items-center gap-1.5"
                        >
                          <RotateCcw className="w-3 h-3" />
                          恢复此版本
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
