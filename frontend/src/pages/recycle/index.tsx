import { useEffect, useState, useCallback } from "react";
import { fileApi, type DeletedItem } from "../../api/content";
import {
  Trash2, RotateCcw, Search,
  FileText, FileAudio, FileVideo, Image, FileSpreadsheet,
  Globe, File, Loader2,
} from "lucide-react";
import ConfirmDialog from "../../components/ConfirmDialog";

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
  return new Date(iso).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

// ── Main Component ──

export default function RecyclePage() {
  const [items, setItems] = useState<DeletedItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: "restore" | "permanent";
    item: DeletedItem | null;
  }>({ open: false, type: "restore", item: null });

  const PAGE_SIZE = 20;

  // ── Load Data ──

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fileApi.getDeleted(page, PAGE_SIZE);
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Filtered Items (client-side search) ──

  const filteredItems = items.filter((item) => {
    if (typeFilter && item.content_type !== typeFilter) return false;
    if (search) {
      const searchLower = search.toLowerCase();
      return item.title.toLowerCase().includes(searchLower);
    }
    return true;
  });

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
        await fileApi.permanentDelete(item.id);
      }
      // Reload after action
      await load();
    } catch (err) {
      alert(`${type === "restore" ? "恢复" : "永久删除"}失败: ${(err as Error).message}`);
    } finally {
      setActionLoading(null);
      setConfirmDialog({ open: false, type: "restore", item: null });
    }
  }

  // ── Pagination ──

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex items-center gap-3">
          <Trash2 className="w-6 h-6 text-[var(--text-secondary)] dark:text-[var(--text-muted)]" />
          回收站
        </h1>
        <p className="text-sm text-[var(--text-muted)] dark:text-[var(--text-muted)] mt-2">
          已删除的内容将在 30 天后自动清除
        </p>
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
            placeholder="搜索标题..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="taste-input w-48 pl-9"
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
              : "回收站为空"}
          </p>
          {!search && !typeFilter && (
            <p className="text-sm text-[var(--text-muted)] dark:text-[var(--text-muted)] mt-2">
              删除的内容会出现在这里
            </p>
          )}
        </div>
      )}

      {/* List */}
      {!loading && !error && filteredItems.length > 0 && (
        <div className="border border-[var(--border-subtle)] dark:border-[var(--border-subtle)] rounded-xl overflow-hidden">
          <div className="divide-y divide-[var(--border-subtle)]">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between px-4 py-3 hover:bg-[var(--bg-secondary)] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
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
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 text-sm border border-[var(--border-subtle)] rounded-lg disabled:opacity-40 hover:bg-[var(--bg-secondary)] transition-colors"
          >
            上一页
          </button>
          <span className="text-sm text-[var(--text-secondary)] dark:text-[var(--text-muted)] px-2">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 text-sm border border-[var(--border-subtle)] rounded-lg disabled:opacity-40 hover:bg-[var(--bg-secondary)] transition-colors"
          >
            下一页
          </button>
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
    </div>
  );
}