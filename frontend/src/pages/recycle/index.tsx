import { useEffect, useState, useCallback } from "react";
import { fileApi, type DeletedItem } from "../../api/content";
import { recycleApi } from "../../api/recycle";
import {
  Trash2, RotateCcw, Search,
  FileText, FileAudio, FileVideo, Image, FileSpreadsheet,
  Globe, File, Loader2, CheckSquare, Square,
} from "lucide-react";
import ConfirmDialog from "../../components/ConfirmDialog";
import Toast from "../../components/Toast";
import { recycleCopy, useCopy } from "../../lib/copywriting";
import { useBrain } from "../../lib/brain-context";

// ── Type Filters ──

const TYPE_FILTERS = [
  { value: "", label: "全部类型" },
  { value: "note", label: "笔记" },
  { value: "image", label: "图片" },
  { value: "video", label: "视频" },
  { value: "audio", label: "音频" },
  { value: "pdf", label: "PDF" },
  { value: "doc", label: "文档" },
  { value: "web", label: "网页" },
] as const;

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

// ── Icon Mapping ──

const TYPE_ICON_MAP: Record<string, React.ReactNode> = {
  note: <FileText className="w-4 h-4 text-[var(--accent-text)]" />,
  image: <Image className="w-4 h-4 text-[var(--success)]" />,
  video: <FileVideo className="w-4 h-4 text-purple-500" />,
  audio: <FileAudio className="w-4 h-4 text-orange-500" />,
  pdf: <FileText className="w-4 h-4 text-[var(--danger)]" />,
  doc: <FileSpreadsheet className="w-4 h-4 text-indigo-500" />,
  web: <Globe className="w-4 h-4 text-cyan-500" />,
};

function getTypeIcon(type: string): React.ReactNode {
  return TYPE_ICON_MAP[type] ?? <File className="w-4 h-4 text-[var(--text-muted)]" />;
}

// ── Utility Functions ──

function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) {
    return "未知时间";
  }
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

// ── Main Component ──

export default function RecyclePage() {
  const rt = useCopy(recycleCopy);
  const { currentBrainId } = useBrain();
  const [items, setItems] = useState<DeletedItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(20);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  // 批量选择状态
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const [batchActionType, setBatchActionType] = useState<"restore" | "permanent">("permanent");
  const [batchLoading, setBatchLoading] = useState(false);

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: "restore" | "permanent";
    item: DeletedItem | null;
  }>({ open: false, type: "restore", item: null });

  // ── Load Data ──

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fileApi.getDeleted(page, pageSize, currentBrainId, {
        content_type: typeFilter || undefined,
        q: search.trim() || undefined,
      });
      setItems(res.items);
      setTotal(res.total);
      setSelectedIds([]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, currentBrainId, typeFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredItems = items;

  // ── Selection ──

  function toggleSelect(id: string) {
    setSelectedIds(prev =>
      prev.includes(id)
        ? prev.filter(itemId => itemId !== id)
        : [...prev, id]
    );
  }

  function toggleSelectAll() {
    if (filteredItems.length > 0 && filteredItems.every((item) => selectedIds.includes(item.id))) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredItems.map(item => item.id));
    }
  }

  function updatePageSize(value: number) {
    const nextPageSize = PAGE_SIZE_OPTIONS.includes(value as (typeof PAGE_SIZE_OPTIONS)[number])
      ? (value as (typeof PAGE_SIZE_OPTIONS)[number])
      : 20;
    setPageSize(nextPageSize);
    setPage(1);
  }

  // ── Actions ──

  function handleRestoreClick(item: DeletedItem) {
    setConfirmDialog({ open: true, type: "restore", item });
  }

  function handlePermanentDeleteClick(item: DeletedItem) {
    setConfirmDialog({ open: true, type: "permanent", item });
  }

  async function handleConfirm() {
    if (!confirmDialog.item) return;
    const { type, item } = confirmDialog;
    setActionLoading(item.id);

    try {
      if (type === "restore") {
        await fileApi.restore(item.id);
      } else {
        await recycleApi.permanentDelete(item.id);
      }
      await load();
      setToast({ type: "success", message: type === "restore" ? "内容已恢复" : "内容已永久删除" });
    } catch (err) {
      setToast({ type: "error", message: `${type === "restore" ? "恢复" : "永久删除"}失败: ${(err as Error).message}` });
    } finally {
      setActionLoading(null);
      setConfirmDialog({ open: false, type: "restore", item: null });
    }
  }

  // 批量恢复
  async function handleBatchRestore() {
    if (selectedIds.length === 0) return;
    setBatchLoading(true);
    try {
      await fileApi.batch(selectedIds, "restore", currentBrainId);
      await load();
      setShowBatchConfirm(false);
      setToast({ type: "success", message: `已恢复 ${selectedIds.length} 项内容` });
    } catch (err) {
      setToast({ type: "error", message: `批量恢复失败: ${(err as Error).message}` });
    } finally {
      setBatchLoading(false);
    }
  }

  // 批量永久删除
  async function handleBatchPermanentDelete() {
    if (selectedIds.length === 0) return;
    setBatchLoading(true);
    try {
      await fileApi.batch(selectedIds, "permanent_delete", currentBrainId);
      await load();
      setShowBatchConfirm(false);
      setToast({ type: "success", message: `已永久删除 ${selectedIds.length} 项内容` });
    } catch (err) {
      setToast({ type: "error", message: `批量永久删除失败: ${(err as Error).message}` });
    } finally {
      setBatchLoading(false);
    }
  }

  // ── Pagination ──

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex items-center gap-3">
            <Trash2 className="w-6 h-6 text-[var(--text-secondary)] dark:text-[var(--text-muted)]" />
            归墟
          </h1>
          <p className="text-sm text-[var(--text-muted)] dark:text-[var(--text-muted)] mt-2">
            已删除的内容将在 30 天后自动清除
          </p>
        </div>
        {/* 批量操作按钮 */}
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setBatchActionType("restore"); setShowBatchConfirm(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--accent-text)] bg-[var(--accent-soft)] rounded-lg hover:bg-blue-100 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              批量恢复 ({selectedIds.length})
            </button>
            <button
              onClick={() => { setBatchActionType("permanent"); setShowBatchConfirm(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--danger)] bg-[var(--danger-soft)] rounded-lg hover:bg-red-100 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              批量永久删除 ({selectedIds.length})
            </button>
          </div>
        )}
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex flex-wrap gap-1.5">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => {
                setTypeFilter(f.value);
                setPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                typeFilter === f.value
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder={rt.searchPlaceholder}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="dao-input w-48 pl-9"
          />
        </div>
      </div>

      {/* Content */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--text-muted)]" />
        </div>
      )}

      {error && (
        <div className="text-center py-20 text-[var(--danger)]">
          <p>加载失败: {error}</p>
          <button
            onClick={load}
            className="mt-4 px-4 py-2 text-sm bg-[var(--bg-secondary)] dark:bg-[var(--bg-elevated)] rounded-lg hover:bg-[var(--bg-secondary)] dark:hover:bg-zinc-700 transition-colors"
          >
            重试
          </button>
        </div>
      )}

      {!loading && !error && filteredItems.length === 0 && (
        <div className="text-center py-20">
          <Trash2 className="w-12 h-12 mx-auto text-[var(--text-muted)] dark:text-[var(--text-secondary)] mb-4" />
          <p className="text-[var(--text-muted)] dark:text-[var(--text-muted)]">
            {search || typeFilter
              ? "没有匹配的已删除内容"
              : rt.empty}
          </p>
          {!search && !typeFilter && (
            <p className="text-sm text-[var(--text-muted)] dark:text-[var(--text-muted)] mt-2">
              {rt.emptyHint}
            </p>
          )}
        </div>
      )}

      {/* List */}
      {!loading && !error && filteredItems.length > 0 && (
        <div className="border border-[var(--border-subtle)] dark:border-[var(--border-subtle)] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)]">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-2 text-xs text-[var(--text-muted)] hover:text-[var(--jade)] transition-colors"
            >
              {filteredItems.length > 0 && filteredItems.every((item) => selectedIds.includes(item.id)) ? (
                <CheckSquare className="w-4 h-4" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              {filteredItems.length > 0 && filteredItems.every((item) => selectedIds.includes(item.id)) ? "取消全选本页" : "全选本页"}
            </button>
            <span className="text-xs text-[var(--text-muted)]">
              已选择 {selectedIds.length} / 本页 {filteredItems.length} 项
            </span>
          </div>
          <div className="divide-y divide-[var(--border-subtle)]">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className={`flex items-center justify-between px-4 py-3 hover:bg-[var(--bg-secondary)] transition-colors ${
                  selectedIds.includes(item.id) ? "bg-[var(--accent-soft)]/30" : ""
                }`}
              >
                {/* 选择框 */}
                <button
                  onClick={() => toggleSelect(item.id)}
                  className="flex items-center justify-center mr-2"
                >
                  {selectedIds.includes(item.id) ? (
                    <CheckSquare className="w-4 h-4 text-[var(--jade)]" />
                  ) : (
                    <Square className="w-4 h-4 text-[var(--text-muted)]" />
                  )}
                </button>

                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {getTypeIcon(item.content_type)}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate max-w-md">
                      {item.title}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      {item.content_type} · {formatFileSize(item.file_size)} · 删除于{" "}
                      {formatDate(item.deleted_at)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                  <button
                    onClick={() => handleRestoreClick(item)}
                    disabled={actionLoading === item.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--accent-text)] dark:text-[var(--accent-text)] bg-[var(--accent-soft)] dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors disabled:opacity-50"
                    title="恢复"
                  >
                    {actionLoading === item.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3.5 h-3.5" />
                    )}
                    恢复
                  </button>
                  <button
                    onClick={() => handlePermanentDeleteClick(item)}
                    disabled={actionLoading === item.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--danger)] dark:text-red-400 bg-[var(--danger-soft)] dark:bg-red-900/20 rounded-lg hover:bg-[var(--danger-soft)] dark:hover:bg-red-900/40 transition-colors disabled:opacity-50"
                    title="永久删除"
                  >
                    永久删除
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* 全选行 */}
          <div className="flex items-center justify-between px-4 py-2 bg-[var(--bg-secondary)] border-t border-[var(--border-subtle)]">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-2 text-xs text-[var(--text-muted)] hover:text-[var(--jade)] transition-colors"
            >
              {filteredItems.length > 0 && filteredItems.every((item) => selectedIds.includes(item.id)) ? (
                <CheckSquare className="w-4 h-4" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              {filteredItems.length > 0 && filteredItems.every((item) => selectedIds.includes(item.id)) ? "取消全选本页" : "全选本页"}
            </button>
            <span className="text-xs text-[var(--text-muted)]">
              已选择 {selectedIds.length} / 本页 {filteredItems.length} 项
            </span>
          </div>
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 text-sm border border-[var(--border-subtle)] rounded-lg disabled:opacity-40 hover:bg-[var(--bg-secondary)] transition-colors"
            >
              上一页
            </button>
            <span className="text-sm text-[var(--text-secondary)] dark:text-[var(--text-muted)] px-2 tabular-nums">
              {page} / {Math.max(1, totalPages)}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 text-sm border border-[var(--border-subtle)] rounded-lg disabled:opacity-40 hover:bg-[var(--bg-secondary)] transition-colors"
            >
              下一页
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            每页
            <select
              value={pageSize}
              onChange={(event) => updatePageSize(Number(event.target.value))}
              className="dao-input h-9 w-24 text-sm"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>{size} 条</option>
              ))}
            </select>
          </label>
          <span className="text-xs text-[var(--text-muted)] tabular-nums">
            共 {total} 项
          </span>
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        title={
          confirmDialog.type === "restore"
            ? "恢复内容"
            : "永久删除"
        }
        message={
          confirmDialog.type === "restore"
            ? `确定要恢复「${confirmDialog.item?.title}」吗？`
            : `确定要永久删除「${confirmDialog.item?.title}」吗？此操作不可撤销。`
        }
        confirmLabel={confirmDialog.type === "restore" ? "恢复" : "永久删除"}
        variant={confirmDialog.type === "restore" ? "warning" : "danger"}
        onConfirm={handleConfirm}
        onCancel={() =>
          setConfirmDialog({ open: false, type: "restore", item: null })
        }
        loading={actionLoading !== null}
      />

      {/* 批量操作确认对话框 */}
      <ConfirmDialog
        open={showBatchConfirm}
        title={batchActionType === "restore" ? "批量恢复内容" : "批量永久删除"}
        message={
          batchActionType === "restore"
            ? `确定要恢复选中的 ${selectedIds.length} 项内容吗？`
            : `确定要永久删除选中的 ${selectedIds.length} 项内容吗？此操作不可撤销。`
        }
        confirmLabel={batchActionType === "restore" ? "确认恢复" : "确认删除"}
        variant={batchActionType === "restore" ? "warning" : "danger"}
        loading={batchLoading}
        onConfirm={batchActionType === "restore" ? handleBatchRestore : handleBatchPermanentDelete}
        onCancel={() => setShowBatchConfirm(false)}
      />
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}
