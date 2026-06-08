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
  RotateCcw,
} from "lucide-react";
import { backupApi, type BackupConfigPreview, type BackupInspection, type BackupItem } from "../../api/backup";
import ConfirmDialog from "../../components/ConfirmDialog";
import { backupCopy, useCopy } from "../../lib/copywriting";

type RestoreMode = "all" | "files" | "config";

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

const restoreModeOptions: Array<{
  mode: RestoreMode;
  label: string;
  detail: string;
}> = [
  { mode: "all", label: "全部恢复", detail: "文件、数据库和配置" },
  { mode: "files", label: "仅文件", detail: "只覆盖备份内文件" },
  { mode: "config", label: "仅配置", detail: "模型、功能绑定、工作区" },
];

function formatConfigPreview(preview: BackupConfigPreview): string {
  const parts = [
    preview.new > 0 ? `新增 ${preview.new}` : "",
    preview.overwrite > 0 ? `覆盖 ${preview.overwrite}` : "",
    preview.invalid > 0 ? `无效 ${preview.invalid}` : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : "无变更";
}

// ── Backup Page ──

export default function BackupPage() {
  const bt = useCopy(backupCopy);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deletingFile] = useState<string | null>(null);
  const [deleteConfirmFile, setDeleteConfirmFile] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [restoreConfirmFile, setRestoreConfirmFile] = useState<string | null>(null);
  const [restoreInspection, setRestoreInspection] = useState<BackupInspection | null>(null);
  const [restoreMode, setRestoreMode] = useState<RestoreMode>("all");
  const [restoreLoading, setRestoreLoading] = useState(false);
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

  const handleRequestRestore = useCallback(async (filename: string) => {
    setRestoreLoading(true);
    try {
      const inspection = await backupApi.inspect(filename);
      setRestoreInspection(inspection);
      setRestoreMode("all");
      setRestoreConfirmFile(filename);
    } catch (e) {
      showToast((e as Error).message || "读取备份信息失败", "error");
    } finally {
      setRestoreLoading(false);
    }
  }, [showToast]);

  const handleConfirmRestore = useCallback(async () => {
    if (!restoreConfirmFile) return;
    setRestoreLoading(true);
    try {
      const result = await backupApi.restore(restoreConfirmFile, restoreMode);
      const configCount = result.restored_config.providers + result.restored_config.function_bindings + result.restored_config.brains;
      showToast(`恢复完成：${result.restored_files} 个文件，${configCount} 项配置，数据库：${result.database_status}`, "success");
      setRestoreConfirmFile(null);
      setRestoreInspection(null);
      await fetchBackups();
    } catch (e) {
      showToast((e as Error).message || "恢复失败", "error");
    } finally {
      setRestoreLoading(false);
    }
  }, [restoreConfirmFile, restoreMode, showToast, fetchBackups]);

  const restoreMessage = restoreInspection
    ? `将从「${restoreInspection.filename}」恢复：${restoreInspection.file_count} 个文件，${restoreInspection.brain_configs} 个工作区配置，${restoreInspection.provider_configs} 个模型供应商配置，${restoreInspection.function_bindings} 个功能绑定。${restoreInspection.has_database_sql ? "包含 database.sql，将尝试恢复数据库。" : "不包含可恢复的 database.sql。"}API Keys ${restoreInspection.api_keys_included ? "可能包含在备份中，请谨慎确认。" : "未包含在备份元数据中。"}当前同名文件可能被覆盖。`
    : `将从「${restoreConfirmFile ?? ""}」恢复文件，并在备份包含 database.sql 时尝试恢复数据库。当前同名文件可能被覆盖。`;

  const restoreConfirmLabel = restoreMode === "all"
    ? "确认全部恢复"
    : restoreMode === "files"
      ? "确认仅恢复文件"
      : "确认仅恢复配置";

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* ── Header ── */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
              <HardDrive className="w-5 h-5 text-[var(--accent-text)]" />
            </div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              {bt.title}
            </h1>
          </div>
          <p className="text-sm text-[var(--text-muted)] ml-12">
            {bt.subtitle}
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
              className="dao-btn dao-btn-primary text-sm flex items-center gap-2"
            >
              {creating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {creating ? bt.creating : bt.btnCreate}
            </button>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="dao-btn dao-btn-secondary text-sm flex items-center gap-2"
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
              <p className="text-[#615d59] dark:text-[var(--text-muted)] font-medium">{bt.empty}</p>
              <p className="text-sm text-[#a39e98] dark:text-[var(--text-muted)] mt-1">
                {bt.emptyHint}
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
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleRequestRestore(backup.filename)}
                      disabled={restoreLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--accent-text)] hover:bg-[var(--accent-soft)] rounded-md transition-colors disabled:opacity-50"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      恢复
                    </button>
                    <button
                      onClick={() => setDeleteConfirmFile(backup.filename)}
                      disabled={deletingFile === backup.filename}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#dc2626] dark:text-red-400 hover:bg-[var(--danger-soft)] dark:hover:bg-red-900/20 rounded-md transition-colors"
                    >
                    {deletingFile === backup.filename ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    删除
                    </button>
                  </div>
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

      <ConfirmDialog
        open={!!restoreConfirmFile}
        title="确认恢复备份"
        message={restoreMessage}
        confirmLabel={restoreConfirmLabel}
        variant="warning"
        onConfirm={handleConfirmRestore}
        onCancel={() => {
          setRestoreConfirmFile(null);
          setRestoreInspection(null);
        }}
        loading={restoreLoading}
      >
        {restoreInspection?.config_preview && (
          <div className="mt-5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-3">
            <div className="text-sm font-semibold text-[var(--text-primary)]">配置影响预览</div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--text-secondary)]">模型供应商</span>
                <span className="text-xs text-[var(--text-muted)]">{formatConfigPreview(restoreInspection.config_preview.providers)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--text-secondary)]">功能绑定</span>
                <span className="text-xs text-[var(--text-muted)]">{formatConfigPreview(restoreInspection.config_preview.function_bindings)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--text-secondary)]">工作区配置</span>
                <span className="text-xs text-[var(--text-muted)]">{formatConfigPreview(restoreInspection.config_preview.brains)}</span>
              </div>
            </div>
          </div>
        )}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2">
          {restoreModeOptions.map((option) => {
            const selected = restoreMode === option.mode;
            return (
              <button
                key={option.mode}
                type="button"
                onClick={() => setRestoreMode(option.mode)}
                disabled={restoreLoading}
                className={`text-left rounded-lg border px-3 py-2.5 transition-colors disabled:opacity-50 ${
                  selected
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]"
                    : "border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
                }`}
              >
                <span className="block text-sm font-semibold">{option.label}</span>
                <span className="mt-1 block text-xs text-[var(--text-muted)] leading-snug">{option.detail}</span>
              </button>
            );
          })}
        </div>
      </ConfirmDialog>

      {/* ── Toast ── */}
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
