import { useState, useEffect, useCallback } from "react";
import {
  HardDrive,
  Download,
  Trash2,
  Loader2,
  Plus,
  Archive,
  Database,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { backupApi, type BackupItem } from "../../api/backup";
import ConfirmDialog from "../../components/ConfirmDialog";

/**
 * 格式化文件大小为人类可读格式
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * 格式化 ISO 8601 日期为本地可读格式
 */
function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const seconds = String(d.getSeconds()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch {
    return iso;
  }
}

// ── Toast ──

interface ToastState {
  message: string;
  type: "success" | "error";
}

function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-[var(--shadow-lg)] text-sm font-medium transition-all animate-in slide-in-from-bottom-2 ${
        toast.type === "success"
          ? "bg-emerald-600 text-[var(--text-inverse)]"
          : "bg-red-600 text-[var(--text-inverse)]"
      }`}
    >
      {toast.type === "success" ? (
        <Database className="w-4 h-4" />
      ) : (
        <AlertTriangle className="w-4 h-4" />
      )}
      {toast.message}
    </div>
  );
}

// ── Backup Page ──

export default function BackupPage() {
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deletingFile] = useState<string | null>(null);
  const [deleteConfirmFile, setDeleteConfirmFile] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
  }, []);

  const fetchBackups = useCallback(async () => {
    try {
      const data = await backupApi.list();
      setBackups(data.backups ?? []);
    } catch (e) {
      showToast((e as Error).message || "加载备份列表失败", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchBackups();
  }, [fetchBackups]);

  /** 创建备份 */
  const handleCreate = useCallback(async () => {
    setCreating(true);
    try {
      const result = await backupApi.create();
      showToast(`备份已创建：${result.filename}`, "success");
      await fetchBackups();
    } catch (e) {
      showToast((e as Error).message || "创建备份失败", "error");
    } finally {
      setCreating(false);
    }
  }, [showToast, fetchBackups]);

  /** 导出知识库 */
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const result = await backupApi.export();
      showToast(`知识库已导出：${result.filename}`, "success");
      await fetchBackups();
    } catch (e) {
      showToast((e as Error).message || "导出知识库失败", "error");
    } finally {
      setExporting(false);
    }
  }, [showToast, fetchBackups]);

  /** 确认删除 */
  const handleConfirmDelete = useCallback(async () => {
    if (!deleteConfirmFile) return;
    setDeleteLoading(true);
    try {
      await backupApi.delete(deleteConfirmFile);
      showToast(`已删除：${deleteConfirmFile}`, "success");
      setDeleteConfirmFile(null);
      await fetchBackups();
    } catch (e) {
      showToast((e as Error).message || "删除失败", "error");
    } finally {
      setDeleteLoading(false);
    }
  }, [deleteConfirmFile, showToast, fetchBackups]);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* ── Header ── */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
              <HardDrive className="w-5 h-5 text-[var(--accent-text)]" />
            </div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              数据管理
            </h1>
          </div>
          <p className="text-sm text-[var(--text-muted)] ml-12">
            创建备份、导出知识库，保障数据安全
          </p>
        </div>

        {/* ── Action Section ── */}
        <div className="bg-[var(--bg-card)] dark:bg-[var(--bg-card)] rounded-xl border border-black/10 dark:border-white/10 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_6px_16px_rgba(0,0,0,0.04)] dark:shadow-none p-6 mb-6">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 text-[var(--text-muted)]" />
            操作区
          </h2>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="taste-btn-primary text-sm flex items-center gap-2"
            >
              {creating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {creating ? "创建中..." : "创建备份"}
            </button>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="taste-btn-secondary text-sm flex items-center gap-2"
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {exporting ? "导出中..." : "导出知识库"}
            </button>
          </div>
        </div>

        {/* ── Backup List ── */}
        <div className="bg-[var(--bg-card)] dark:bg-[var(--bg-card)] rounded-xl border border-black/10 dark:border-white/10 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_6px_16px_rgba(0,0,0,0.04)] dark:shadow-none p-6">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Archive className="w-4 h-4 text-[var(--text-muted)]" />
            备份列表
            {backups.length > 0 && (
              <span className="text-xs font-normal text-[#a39e98] dark:text-[var(--text-muted)] ml-1">
                ({backups.length})
              </span>
            )}
          </h2>

          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-[#a39e98] dark:text-[var(--text-muted)]" />
            </div>
          )}

          {/* Empty state */}
          {!loading && backups.length === 0 && (
            <div className="text-center py-16">
              <Database className="w-12 h-12 mx-auto text-[#a39e98] dark:text-[var(--text-secondary)] mb-4" />
              <p className="text-[#615d59] dark:text-[var(--text-muted)] font-medium">暂无备份</p>
              <p className="text-sm text-[#a39e98] dark:text-[var(--text-muted)] mt-1">
                点击「创建备份」按钮生成第一个备份
              </p>
            </div>
          )}

          {/* Backup items */}
          {!loading && backups.length > 0 && (
            <div className="space-y-2">
              {backups.map((backup) => (
                <div
                  key={backup.filename}
                  className="group flex items-center justify-between p-4 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0">
                      <Archive className="w-4 h-4 text-[var(--accent-text)]" />
                    </div>
                    <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate font-mono">
                        {backup.filename}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-[#a39e98] dark:text-[var(--text-muted)]">
                        <span className="flex items-center gap-1">
                          <HardDrive className="w-3 h-3" />
                          {formatFileSize(backup.size)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(backup.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setDeleteConfirmFile(backup.filename)}
                    disabled={deletingFile === backup.filename}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#dc2626] dark:text-red-400 hover:bg-[var(--danger-soft)] dark:hover:bg-red-900/20 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                  >
                    {deletingFile === backup.filename ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    删除
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Confirm Dialog ── */}
      <ConfirmDialog
        open={!!deleteConfirmFile}
        title="确认删除备份"
        message={`确定要删除备份文件「${deleteConfirmFile ?? ""}」吗？此操作不可撤销。`}
        confirmLabel="确认删除"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirmFile(null)}
        loading={deleteLoading}
      />

      {/* ── Toast ── */}
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
