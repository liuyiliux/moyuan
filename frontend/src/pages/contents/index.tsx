import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { fileApi, contentApi, type FileListResponse } from "../../api/content";
import UploadArea, { type UploadResult } from "../../components/UploadArea";
import ConfirmDialog from "../../components/ConfirmDialog";
import {
  UploadCloud, Search, Grid3x3, List,
  FileText, FileAudio, FileVideo, Image, FileSpreadsheet,
  File, Trash2, ExternalLink, RefreshCw, Loader2, Pin,
  BookOpen, CheckSquare, Square,
} from "lucide-react";
import { Card, Button } from "../../components";

const TYPE_FILTERS = [
  { value: "", label: "万象" },
  { value: "note", label: "墨宝" },
  { value: "image", label: "图录" },
  { value: "video", label: "影集" },
  { value: "audio", label: "音箓" },
  { value: "pdf", label: "经卷" },
  { value: "doc", label: "典籍" },
  { value: "web", label: "云游" },
] as const;

const TYPE_ICON_MAP: Record<string, React.ReactNode> = {
  note: <FileText className="w-4 h-4 text-[var(--accent-text)]" />,
  image: <Image className="w-4 h-4 text-[var(--success)]" />,
  video: <FileVideo className="w-4 h-4 text-purple-500" />,
  audio: <FileAudio className="w-4 h-4 text-orange-500" />,
  pdf: <FileText className="w-4 h-4 text-[var(--danger)]" />,
  doc: <FileSpreadsheet className="w-4 h-4 text-indigo-500" />,
  web: <ExternalLink className="w-4 h-4 text-cyan-500" />,
};

function getTypeIcon(type: string) {
  return TYPE_ICON_MAP[type] ?? <File className="w-4 h-4 text-text-muted" />;
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return "-";
  if (bytes < 1024) return `${bytes} 字节`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

export default function ContentsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [data, setData] = useState<FileListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState(searchParams.get("type") || "");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [showUpload, setShowUpload] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [chunkingId, setChunkingId] = useState<string | null>(null);
  const [embeddingId, setEmbeddingId] = useState<string | null>(null);
  
  // 存储每个内容的 status 信息
  const [statusMap, setStatusMap] = useState<Record<string, {
    chunk_count: number;
    text_chunks: number;
    image_chunks: number;
    embedded_chunks: number;
  }>>({});
  
  // 批量选择状态
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchProcessing, setBatchProcessing] = useState(false);

  const PAGE_SIZE = 20;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fileApi.list({
        content_type: typeFilter || undefined,
        page,
        page_size: PAGE_SIZE,
      });
      const sorted = [...(res.items || [])].sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return 0;
      });
      setData({ ...res, items: sorted });
      setSelectedIds([]);
      
      // 为每个内容加载 status 信息
      const newStatusMap: typeof statusMap = {};
      for (const item of sorted) {
        try {
          const statusRes = await fetch(`/api/contents/${item.id}/status`);
          if (statusRes.ok) {
            newStatusMap[item.id] = await statusRes.json();
          }
        } catch (e) {
          // 忽略加载失败的 status
        }
      }
      setStatusMap(newStatusMap);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [typeFilter, page]);

  // 切换单个选择
  function toggleSelect(id: string) {
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(itemId => itemId !== id)
        : [...prev, id]
    );
  }

  // 全选/取消全选
  function toggleSelectAll() {
    if (!data?.items) return;
    if (selectedIds.length === data.items.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(data.items.map(item => item.id));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("确定要将此典籍归入归墟吗？")) return;
    setDeletingId(id);
    try {
      await fileApi.delete(id);
      await load();
    } catch (err) {
      alert(`归入归墟失败: ${(err as Error).message}`);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleBatchDelete() {
    if (selectedIds.length === 0) return;
    setBatchDeleting(true);
    try {
      await fileApi.batch(selectedIds, "delete");
      await load();
      setShowBatchConfirm(false);
    } catch (err) {
      alert(`批量归入归墟失败: ${(err as Error).message}`);
    } finally {
      setBatchDeleting(false);
    }
  }

  async function handleRetry(id: string) {
    setRetryingId(id);
    try {
      await fetch(`/api/files/${id}/enqueue`, { method: "POST" });
      await load();
    } catch (err) {
      alert(`重新炼化失败: ${(err as Error).message}`);
    } finally {
      setRetryingId(null);
    }
  }

  async function handleChunk(id: string) {
    setChunkingId(id);
    try {
      await contentApi.chunkContent(id);
      await load();
    } catch (err) {
      alert(`智能分块失败: ${(err as Error).message}`);
    } finally {
      setChunkingId(null);
    }
  }

  async function handleEmbed(id: string) {
    setEmbeddingId(id);
    try {
      await contentApi.embedContent(id);
      await load();
    } catch (err) {
      alert(`生成嵌入失败: ${(err as Error).message}`);
    } finally {
      setEmbeddingId(null);
    }
  }

  async function handleBatchChunk() {
    if (chunkableIds.length === 0) return;
    setBatchProcessing(true);
    try {
      await contentApi.batchChunk(chunkableIds);
      await load();
    } catch (err) {
      alert(`批量分块失败: ${(err as Error).message}`);
    } finally {
      setBatchProcessing(false);
    }
  }

  async function handleBatchEmbed() {
    if (embeddableIds.length === 0) return;
    setBatchProcessing(true);
    try {
      await contentApi.batchEmbed(embeddableIds);
      await load();
    } catch (err) {
      alert(`批量嵌入失败: ${(err as Error).message}`);
    } finally {
      setBatchProcessing(false);
    }
  }

  async function handleResetStuckEmbeddings() {
    try {
      const res = await fetch("/api/contents/maintenance/reset-stuck-embeddings", { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "重置失败");
      }
      await load();
    } catch (err) {
      alert(`重置卡住嵌入失败: ${(err as Error).message}`);
    }
  }

  async function handlePin(id: string) {
    setPinningId(id);
    try {
      const res = await contentApi.pin(id);
      setData(prev => {
        if (!prev) return prev;
        const items = prev.items.map(item => 
          item.id === id ? { ...item, is_pinned: res.is_pinned } : item
        );
        items.sort((a, b) => {
          if (a.is_pinned && !b.is_pinned) return -1;
          if (!a.is_pinned && b.is_pinned) return 1;
          return 0;
        });
        return { ...prev, items };
      });
    } catch (err) {
      console.error("Pin failed:", err);
      alert(`加持失败: ${(err as Error).message}`);
    } finally {
      setPinningId(null);
    }
  }

  function handleUploaded(_results: UploadResult[]) {
    setShowUpload(false);
    setTypeFilter(""); // 重置筛选器为"万象"
    setPage(1);
    load();
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;
  const selectedItems = data?.items.filter(item => selectedIds.includes(item.id)) || [];
  const chunkableIds = selectedItems
    .filter(item => {
      if (item.processing_status === "pending") return true;
      if (item.processing_status === "failed") {
        // 对于 failed 状态，只选择没有 chunk 的内容
        return !statusMap[item.id] || statusMap[item.id].chunk_count === 0;
      }
      return false;
    })
    .map(item => item.id);
  
  const embeddableIds = selectedItems
    .filter(item => {
      if (item.processing_status === "chunked" || item.processing_status === "partial") return true;
      if (item.processing_status === "failed") {
        // 对于 failed 状态，选择已有 chunk 的内容
        return statusMap[item.id] && statusMap[item.id].chunk_count > 0;
      }
      return false;
    })
    .map(item => item.id);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-serif font-semibold text-text-primary">
            道藏
          </h1>
          <p className="text-sm text-text-muted mt-1.5">
            收纳天地万象，传承千古智慧
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => load()} className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            刷新
          </Button>
          <Button variant="secondary" onClick={handleResetStuckEmbeddings} className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            重置卡住嵌入
          </Button>
          {/* 批量操作按钮 */}
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-2">
              {chunkableIds.length > 0 && (
                <Button 
                  variant="secondary" 
                  onClick={handleBatchChunk}
                  disabled={batchProcessing}
                  className="flex items-center gap-2"
                >
                  <Loader2 className={`w-4 h-4 ${batchProcessing ? "animate-spin" : ""}`} />
                  批量分块 ({chunkableIds.length})
                </Button>
              )}
              {embeddableIds.length > 0 && (
                <Button 
                  variant="secondary" 
                  onClick={handleBatchEmbed}
                  disabled={batchProcessing}
                  className="flex items-center gap-2"
                >
                  <Loader2 className={`w-4 h-4 ${batchProcessing ? "animate-spin" : ""}`} />
                  批量嵌入 ({embeddableIds.length})
                </Button>
              )}
              <Button 
                variant="danger" 
                onClick={() => setShowBatchConfirm(true)}
                className="flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                归入归墟 ({selectedIds.length})
              </Button>
            </div>
          )}
          <Button onClick={() => setShowUpload(v => !v)}>
            <UploadCloud className="w-4 h-4" />
            收录典籍
          </Button>
        </div>
      </div>

      {showUpload && (
        <Card className="mb-6 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-serif font-semibold text-text-primary">收录典籍</h2>
            <Button variant="ghost" onClick={() => setShowUpload(false)}>
              取消
            </Button>
          </div>
          <UploadArea onUploaded={handleUploaded} />
        </Card>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex flex-wrap gap-1.5">
          {TYPE_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => { setTypeFilter(f.value); setPage(1); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                typeFilter === f.value
                  ? "bg-jade text-text-inverse"
                  : "bg-bg-secondary text-text-secondary hover:bg-accent-soft hover:text-jade"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="探寻道藏..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && search.trim()) navigate(`/search?q=${encodeURIComponent(search.trim())}`); }}
              className="dao-input w-48"
            />
          </div>
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 rounded-md transition-all ${
              viewMode === "list" ? "bg-bg-secondary text-text-primary" : "text-text-muted hover:text-text-secondary"
            }`}
            title="卷轴视图"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("grid")}
            className={`p-1.5 rounded-md transition-all ${
              viewMode === "grid" ? "bg-bg-secondary text-text-primary" : "text-text-muted hover:text-text-secondary"
            }`}
            title="宝匣视图"
          >
            <Grid3x3 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-jade" />
        </div>
      )}
      {error && (
        <Card className="p-6 text-center border-danger/20 bg-danger-soft">
          <p className="text-sm text-danger">气机紊乱：{error}</p>
          <Button variant="secondary" onClick={() => load()} className="mt-4">
            <RefreshCw className="w-4 h-4" />
            重新感应
          </Button>
        </Card>
      )}
      {!loading && !error && (!data || data.items.length === 0) && (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-xl bg-accent-soft mb-6">
            <BookOpen className="w-10 h-10 text-jade/60" />
          </div>
          <p className="text-text-muted mb-4">道藏空虚</p>
          <p className="text-sm text-text-muted mb-6">尚无收录任何典籍</p>
          <Button onClick={() => setShowUpload(true)}>
            <UploadCloud className="w-4 h-4" />
            收录典籍
          </Button>
        </div>
      )}

      {!loading && !error && data && data.items.length > 0 && viewMode === "list" && (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-secondary text-left text-xs text-text-muted uppercase tracking-[0.1em] font-medium">
                <th className="px-4 py-3 w-12">
                  <button
                    onClick={toggleSelectAll}
                    className="flex items-center justify-center hover:text-jade transition-colors"
                  >
                    {selectedIds.length === data.items.length ? (
                      <CheckSquare className="w-4 h-4" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3">典籍</th>
                <th className="px-4 py-3">品类</th>
                <th className="px-4 py-3">容量</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">收录日</th>
                <th className="px-4 py-3 text-right">法诀</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {data.items.map(item => (
                <tr
                  key={item.id}
                  className={`group hover:bg-bg-secondary transition-colors cursor-pointer ${
                    selectedIds.includes(item.id) ? "bg-accent-soft/50" : ""
                  }`}
                  onClick={() => navigate(`/contents/${item.id}`)}
                >
                  <td className="px-4 py-3">
                    <button
                      onClick={e => { e.stopPropagation(); toggleSelect(item.id); }}
                      className="flex items-center justify-center"
                    >
                      {selectedIds.includes(item.id) ? (
                        <CheckSquare className="w-4 h-4 text-jade" />
                      ) : (
                        <Square className="w-4 h-4 text-text-muted" />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {item.is_pinned && (
                        <Pin className="w-3.5 h-3.5 text-jade fill-jade" />
                      )}
                      <div className="p-2 rounded-lg bg-bg-secondary group-hover:bg-accent-soft transition-colors">
                        {getTypeIcon(item.content_type)}
                      </div>
                      <div>
                        <p className="text-text-primary font-medium truncate max-w-sm">
                          {item.title}
                        </p>
                        {item.text_content && (
                          <p className="text-xs text-text-muted truncate max-w-sm mt-0.5">
                            {item.text_content.slice(0, 80)}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-muted capitalize">
                    {TYPE_FILTERS.find(f => f.value === item.content_type)?.label || item.content_type}
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {formatSize(item.file_size)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={item.processing_status} />
                      {item.processing_status === "pending" && (
                        <button
                          onClick={e => { e.stopPropagation(); handleChunk(item.id); }}
                          disabled={chunkingId === item.id}
                          className="text-xs text-jade hover:underline disabled:opacity-50 flex items-center gap-1"
                        >
                          {chunkingId === item.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3 h-3" />
                          )}
                          分块
                        </button>
                      )}
                      {item.processing_status === "chunked" && (
                        <button
                          onClick={e => { e.stopPropagation(); handleEmbed(item.id); }}
                          disabled={embeddingId === item.id}
                          className="text-xs text-jade hover:underline disabled:opacity-50 flex items-center gap-1"
                        >
                          {embeddingId === item.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3 h-3" />
                          )}
                          嵌入
                        </button>
                      )}
                      {item.processing_status === "failed" && (
                        <>
                          {(!statusMap[item.id] || statusMap[item.id].chunk_count === 0) && (
                            <button
                              onClick={e => { e.stopPropagation(); handleChunk(item.id); }}
                              disabled={chunkingId === item.id}
                              className="text-xs text-jade hover:underline disabled:opacity-50 flex items-center gap-1"
                            >
                              {chunkingId === item.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <RefreshCw className="w-3 h-3" />
                              )}
                              分块
                            </button>
                          )}
                          {statusMap[item.id] && statusMap[item.id].chunk_count > 0 && (
                            <>
                              <button
                                onClick={e => { e.stopPropagation(); handleEmbed(item.id); }}
                                disabled={embeddingId === item.id}
                                className="text-xs text-jade hover:underline disabled:opacity-50 flex items-center gap-1"
                              >
                                {embeddingId === item.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-3 h-3" />
                                )}
                                嵌入
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); handleChunk(item.id); }}
                                disabled={chunkingId === item.id}
                                className="text-xs text-text-muted hover:underline disabled:opacity-50 flex items-center gap-1"
                              >
                                {chunkingId === item.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-3 h-3" />
                                )}
                                重分块
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {formatDate(item.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={e => { e.stopPropagation(); handlePin(item.id); }}
                        disabled={pinningId === item.id}
                        className="p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-bg-secondary transition-all"
                        title={item.is_pinned ? "取消加持" : "加持置顶"}
                      >
                        <Pin className={`w-4 h-4 ${item.is_pinned ? "text-jade fill-jade" : "text-text-muted"}`} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(item.id); }}
                        disabled={deletingId === item.id}
                        className="p-1.5 rounded opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger transition-all"
                        title="归入归墟"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {!loading && !error && data && data.items.length > 0 && viewMode === "grid" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {data.items.map(item => (
            <Card
              key={item.id}
              onClick={() => navigate(`/contents/${item.id}`)}
              className={`group relative p-4 cursor-pointer hover:border-jade/30 transition-all ${
                selectedIds.includes(item.id) ? "border-jade bg-accent-soft/30" : ""
              }`}
            >
              {/* 选择框 */}
              <button
                onClick={e => { e.stopPropagation(); toggleSelect(item.id); }}
                className="absolute top-3 left-3 z-10"
              >
                {selectedIds.includes(item.id) ? (
                  <CheckSquare className="w-5 h-5 text-jade" />
                ) : (
                  <Square className="w-5 h-5 text-text-muted bg-bg-card/80" />
                )}
              </button>
              {item.is_pinned && (
                <Pin className="absolute top-3 left-10 w-3.5 h-3.5 text-jade fill-jade" />
              )}
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 rounded-lg bg-bg-secondary group-hover:bg-accent-soft transition-colors">
                  {getTypeIcon(item.content_type)}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={e => { e.stopPropagation(); handlePin(item.id); }}
                    disabled={pinningId === item.id}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-bg-secondary transition-all"
                    title={item.is_pinned ? "取消加持" : "加持置顶"}
                  >
                    <Pin className={`w-4 h-4 ${item.is_pinned ? "text-jade fill-jade" : "text-text-muted"}`} />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(item.id); }}
                    disabled={deletingId === item.id}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-text-muted hover:text-danger transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <h3 className="text-sm font-medium text-text-primary truncate mb-1">
                {item.title}
              </h3>
              <p className="text-xs text-text-muted">
                {formatSize(item.file_size)} · {formatDate(item.created_at)}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <StatusBadge status={item.processing_status} />
                {item.processing_status === "pending" && (
                  <button
                    onClick={e => { e.stopPropagation(); handleChunk(item.id); }}
                    disabled={chunkingId === item.id}
                    className="text-xs text-jade hover:underline disabled:opacity-50 flex items-center gap-1"
                  >
                    {chunkingId === item.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    分块
                  </button>
                )}
                {item.processing_status === "chunked" && (
                  <button
                    onClick={e => { e.stopPropagation(); handleEmbed(item.id); }}
                    disabled={embeddingId === item.id}
                    className="text-xs text-jade hover:underline disabled:opacity-50 flex items-center gap-1"
                  >
                    {embeddingId === item.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    嵌入
                  </button>
                )}
                {item.processing_status === "failed" && (
                  <>
                    {(!statusMap[item.id] || statusMap[item.id].chunk_count === 0) && (
                      <button
                        onClick={e => { e.stopPropagation(); handleChunk(item.id); }}
                        disabled={chunkingId === item.id}
                        className="text-xs text-jade hover:underline disabled:opacity-50 flex items-center gap-1"
                      >
                        {chunkingId === item.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3 h-3" />
                        )}
                        分块
                      </button>
                    )}
                    {statusMap[item.id] && statusMap[item.id].chunk_count > 0 && (
                      <>
                        <button
                          onClick={e => { e.stopPropagation(); handleEmbed(item.id); }}
                          disabled={embeddingId === item.id}
                          className="text-xs text-jade hover:underline disabled:opacity-50 flex items-center gap-1"
                        >
                          {embeddingId === item.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3 h-3" />
                          )}
                          嵌入
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); handleChunk(item.id); }}
                          disabled={chunkingId === item.id}
                          className="text-xs text-text-muted hover:underline disabled:opacity-50 flex items-center gap-1"
                        >
                          {chunkingId === item.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3 h-3" />
                          )}
                          重分块
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <Button 
            variant="secondary"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            上卷
          </Button>
          <span className="text-sm text-text-secondary px-2 tabular-nums">
            第 {page} / {totalPages} 卷
          </span>
          <Button 
            variant="secondary"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            下卷
          </Button>
        </div>
      )}

      {/* 批量删除确认对话框 */}
      <ConfirmDialog
        open={showBatchConfirm}
        title="批量归入归墟"
        message={`确定要将选中的 ${selectedIds.length} 部典籍归入归墟吗？此操作将一并清除相关向量记录，不可撤销。`}
        confirmLabel="确认归入"
        cancelLabel="取消"
        variant="danger"
        loading={batchDeleting}
        onConfirm={handleBatchDelete}
        onCancel={() => setShowBatchConfirm(false)}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    queued: "bg-bg-secondary text-text-secondary",
    pending: "bg-amber-50 text-amber-600",
    chunking: "bg-purple-50 text-purple-600 animate-pulse",
    chunked: "bg-teal-50 text-teal-600",
    embedding: "bg-cyan-50 text-cyan-600 animate-pulse",
    processing: "bg-blue-50 text-blue-600 animate-pulse",
    completed: "bg-accent-soft text-jade",
    failed: "bg-danger-soft text-danger",
  };
  const label: Record<string, string> = {
    queued: "待收录",
    pending: "待分块",
    chunking: "分块中",
    chunked: "分块完成",
    embedding: "嵌入中",
    processing: "炼化中",
    completed: "已入藏",
    failed: "处理失败",
  };
  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${map[status] || map.pending}`}>
      {label[status] || status}
    </span>
  );
}
