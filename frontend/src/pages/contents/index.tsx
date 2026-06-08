import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { fileApi, contentApi, type ContentProcessStatus, type FileListResponse, type WebPreviewResponse } from "../../api/content";
import { brainApi, type Brain as BrainType } from "../../api/brains";
import { categoryApi } from "../../api/organization";
import UploadArea, { type UploadResult } from "../../components/UploadArea";
import ConfirmDialog from "../../components/ConfirmDialog";
import Toast from "../../components/Toast";
import {
  UploadCloud, Search, Grid3x3, List,
  FileText, FileAudio, FileVideo, Image, FileSpreadsheet,
  File, Trash2, ExternalLink, RefreshCw, Loader2, Pin,
  BookOpen, CheckSquare, Square, X, MoveRight, ChevronDown,
} from "lucide-react";
import { Card, Button } from "../../components";
import { contentsCopy, useCopy } from "../../lib/copywriting";
import { useBrain } from "../../lib/brain-context";
import { api } from "../../api/provider";

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

const STUDY_FILTERS = [
  { value: "", label: "全部学习" },
  { value: "not_started", label: "未学" },
  { value: "in_progress", label: "学习中" },
  { value: "completed", label: "已学完" },
] as const;

type StudyFilter = typeof STUDY_FILTERS[number]["value"];
type StudyStatusValue = Exclude<StudyFilter, "">;
type ToastState = { type: "success" | "error" | "info"; message: string };

function normalizeStudyFilter(value: string | null): StudyFilter {
  return STUDY_FILTERS.some((filter) => filter.value === value) ? (value as StudyFilter) : "";
}

function normalizeTypeFilter(value: string | null): string {
  return TYPE_FILTERS.some((filter) => filter.value === value) ? (value || "") : "";
}

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
  const ct = useCopy(contentsCopy);
  const { currentBrainId } = useBrain();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [data, setData] = useState<FileListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const categoryId = searchParams.get("category_id") || "";
  const [categoryName, setCategoryName] = useState("");
  const [typeFilter, setTypeFilter] = useState(() => normalizeTypeFilter(searchParams.get("type")));
  const [studyFilter, setStudyFilter] = useState<StudyFilter>(() => normalizeStudyFilter(searchParams.get("study_status")));
  const [retryOnly, setRetryOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [showUpload, setShowUpload] = useState(false);
  const [showWebCapture, setShowWebCapture] = useState(false);
  const [webUrl, setWebUrl] = useState("");
  const [webTitle, setWebTitle] = useState("");
  const [webCapturing, setWebCapturing] = useState(false);
  const [webPreview, setWebPreview] = useState<WebPreviewResponse | null>(null);
  const [webSaving, setWebSaving] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [chunkingId, setChunkingId] = useState<string | null>(null);
  const [embeddingId, setEmbeddingId] = useState<string | null>(null);
  const [brains, setBrains] = useState<BrainType[]>([]);
  
  // 存储每个内容的 status 信息
  const [statusMap, setStatusMap] = useState<Record<string, ContentProcessStatus>>({});
  
  // 批量选择状态
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveTargetBrainId, setMoveTargetBrainId] = useState("");
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchMoving, setBatchMoving] = useState(false);
  const [batchStudyUpdating, setBatchStudyUpdating] = useState<StudyStatusValue | null>(null);
  const [studyMenuOpen, setStudyMenuOpen] = useState(false);

  const PAGE_SIZE = 20;

  function showToast(type: ToastState["type"], message: string) {
    setToast({ type, message });
  }

  function updateStudyFilter(value: StudyFilter) {
    setStudyFilter(value);
    setPage(1);
    const nextParams = new URLSearchParams(searchParams);
    if (value) {
      nextParams.set("study_status", value);
    } else {
      nextParams.delete("study_status");
    }
    setSearchParams(nextParams, { replace: true });
  }

  function updateTypeFilter(value: string) {
    const normalizedValue = normalizeTypeFilter(value);
    setTypeFilter(normalizedValue);
    setRetryOnly(false);
    setPage(1);
    const nextParams = new URLSearchParams(searchParams);
    if (normalizedValue) {
      nextParams.set("type", normalizedValue);
    } else {
      nextParams.delete("type");
    }
    setSearchParams(nextParams, { replace: true });
  }

  function clearListFilters() {
    setTypeFilter("");
    setStudyFilter("");
    setRetryOnly(false);
    setPage(1);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("type");
    nextParams.delete("study_status");
    setSearchParams(nextParams, { replace: true });
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fileApi.list({
        content_type: typeFilter || undefined,
        brain_id: currentBrainId || undefined,
        category_id: categoryId || undefined,
        processing_status: retryOnly ? "failed" : undefined,
        study_status: studyFilter || undefined,
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
      try {
        const statusRes = await contentApi.getStatuses(sorted.map((item) => item.id), currentBrainId);
        setStatusMap(statusRes.items);
      } catch {
        setStatusMap({});
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [typeFilter, studyFilter, retryOnly, page, categoryId, currentBrainId, refreshKey]);

  useEffect(() => {
    const nextTypeFilter = normalizeTypeFilter(searchParams.get("type"));
    const nextStudyFilter = normalizeStudyFilter(searchParams.get("study_status"));
    if (nextTypeFilter !== typeFilter) {
      setTypeFilter(nextTypeFilter);
      setRetryOnly(false);
      setPage(1);
    }
    if (nextStudyFilter !== studyFilter) {
      setStudyFilter(nextStudyFilter);
      setPage(1);
    }
  }, [searchParams, studyFilter, typeFilter]);

  useEffect(() => {
    brainApi.list(false).then(setBrains).catch(() => setBrains([]));
  }, []);

  useEffect(() => {
    if (selectedIds.length === 0) setStudyMenuOpen(false);
  }, [selectedIds.length]);

  // 加载分类名称
  useEffect(() => {
    if (!categoryId) { setCategoryName(""); return; }
    categoryApi.listAll(currentBrainId).then((cats) => {
      const found = cats.find((c) => c.id === categoryId);
      setCategoryName(found?.name || "");
    }).catch(() => setCategoryName(""));
  }, [categoryId, currentBrainId]);

  // 清除分类筛选
  function clearCategoryFilter() {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("category_id");
    const qs = nextParams.toString();
    navigate(`/contents${qs ? `?${qs}` : ""}`);
  }

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

  async function handleConfirmDelete() {
    if (!deleteConfirmId) return;
    setDeletingId(deleteConfirmId);
    try {
      await fileApi.delete(deleteConfirmId);
      await load();
      showToast("success", "已归入归墟");
      setDeleteConfirmId(null);
    } catch (err) {
      showToast("error", `归入归墟失败: ${(err as Error).message}`);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleBatchDelete() {
    if (selectedIds.length === 0) return;
    setBatchDeleting(true);
    try {
      await fileApi.batch(selectedIds, "delete", currentBrainId);
      await load();
      setShowBatchConfirm(false);
      showToast("success", `已将 ${selectedIds.length} 条内容归入归墟`);
    } catch (err) {
      showToast("error", `批量归入归墟失败: ${(err as Error).message}`);
    } finally {
      setBatchDeleting(false);
    }
  }

  async function handleChunk(id: string) {
    setChunkingId(id);
    try {
      await contentApi.chunkContent(id);
      await load();
      showToast("success", "已提交分块任务");
    } catch (err) {
      showToast("error", `智能分块失败: ${(err as Error).message}`);
    } finally {
      setChunkingId(null);
    }
  }

  async function handleEmbed(id: string) {
    setEmbeddingId(id);
    try {
      await contentApi.embedContent(id);
      await load();
      showToast("success", "已提交嵌入任务");
    } catch (err) {
      showToast("error", `生成嵌入失败: ${(err as Error).message}`);
    } finally {
      setEmbeddingId(null);
    }
  }

  async function handleBatchChunk() {
    if (chunkableIds.length === 0) return;
    setBatchProcessing(true);
    try {
      await contentApi.batchChunk(chunkableIds, currentBrainId);
      await load();
      showToast("success", `已提交 ${chunkableIds.length} 条分块任务`);
    } catch (err) {
      showToast("error", `批量分块失败: ${(err as Error).message}`);
    } finally {
      setBatchProcessing(false);
    }
  }

  async function handleBatchEmbed() {
    if (embeddableIds.length === 0) return;
    setBatchProcessing(true);
    try {
      await contentApi.batchEmbed(embeddableIds, currentBrainId);
      await load();
      showToast("success", `已提交 ${embeddableIds.length} 条嵌入任务`);
    } catch (err) {
      showToast("error", `批量嵌入失败: ${(err as Error).message}`);
    } finally {
      setBatchProcessing(false);
    }
  }

  async function handleResetStuckEmbeddings() {
    try {
      const qs = currentBrainId ? `?brain_id=${currentBrainId}` : "";
      await api.post<unknown>(`/contents/maintenance/reset-stuck-embeddings${qs}`);
      await load();
      showToast("success", "已重置卡住的嵌入任务");
    } catch (err) {
      showToast("error", `重置卡住嵌入失败: ${(err as Error).message}`);
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
      showToast("error", `加持失败: ${(err as Error).message}`);
    } finally {
      setPinningId(null);
    }
  }

  function handleUploaded(_results: UploadResult[]) {
    setShowUpload(false);
    clearListFilters();
    setRefreshKey((value) => value + 1);
  }

  function inferTitleFromUrl(url: string) {
    try {
      const parsed = new URL(url);
      return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname.replace(/\/$/, "")}`;
    } catch {
      return url;
    }
  }

  async function handleCaptureWeb() {
    const trimmedUrl = webUrl.trim();
    if (!trimmedUrl) {
      showToast("info", "请输入网页 URL");
      return;
    }

    const normalizedUrl = /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`;
    try {
      new URL(normalizedUrl);
    } catch {
      showToast("error", "请输入有效的网页 URL");
      return;
    }

    setWebCapturing(true);
    setWebPreview(null);
    try {
      const preview = await contentApi.previewWeb(normalizedUrl);
      setWebPreview(preview);
      if (!webTitle.trim()) {
        setWebTitle(preview.title || inferTitleFromUrl(normalizedUrl));
      }
    } catch (err) {
      showToast("error", `网页预览失败: ${(err as Error).message}`);
    } finally {
      setWebCapturing(false);
    }
  }

  async function handleBatchStudyStatus(status: StudyStatusValue) {
    if (selectedIds.length === 0) return;
    setStudyMenuOpen(false);
    setBatchStudyUpdating(status);
    try {
      await contentApi.batchStudyStatus(selectedIds, status, currentBrainId);
      await load();
      showToast("success", "已更新学习状态");
    } catch (err) {
      showToast("error", `批量更新学习状态失败: ${(err as Error).message}`);
    } finally {
      setBatchStudyUpdating(null);
    }
  }

  function openMoveModal() {
    const candidates = brains.filter((brain) => brain.id !== currentBrainId);
    setMoveTargetBrainId(candidates[0]?.id || "");
    setShowMoveModal(true);
  }

  async function handleBatchMove() {
    if (selectedIds.length === 0 || !moveTargetBrainId) return;
    setBatchMoving(true);
    try {
      await contentApi.batchMove(selectedIds, moveTargetBrainId, currentBrainId);
      await load();
      setShowMoveModal(false);
      setMoveTargetBrainId("");
      showToast("success", "已移动到目标工作区");
    } catch (err) {
      showToast("error", `移动工作区失败: ${(err as Error).message}`);
    } finally {
      setBatchMoving(false);
    }
  }

  async function handleConfirmWebCapture() {
    if (!webPreview) return;
    setWebSaving(true);
    try {
      const content = await contentApi.create({
        title: webTitle.trim() || webPreview.title || inferTitleFromUrl(webPreview.url),
        content_type: "web",
        source_type: "web_capture",
        source_url: webPreview.url,
        text_content: webPreview.text_content,
        brain_id: currentBrainId,
        extra_meta: {
          web_preview_confirmed: true,
          web_preview_length: webPreview.text_length,
        },
      });
      await contentApi.chunkContent(content.id);
      setWebUrl("");
      setWebTitle("");
      setWebPreview(null);
      setShowWebCapture(false);
      clearListFilters();
      setRefreshKey((value) => value + 1);
      showToast("success", "网页已加入知识库，正在后台分块处理。");
    } catch (err) {
      showToast("error", `网页导入失败: ${(err as Error).message}`);
    } finally {
      setWebSaving(false);
    }
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
  const hasListFilters = Boolean(typeFilter || studyFilter || retryOnly);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-serif font-semibold text-text-primary">
            {ct.title}
          </h1>
          <p className="text-sm text-text-muted mt-1.5">
            {ct.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => load()} className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            {ct.refresh}
          </Button>
          <Button variant="secondary" onClick={handleResetStuckEmbeddings} className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            {ct.resetStuck}
          </Button>
          {/* 批量操作按钮 */}
          {selectedIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[var(--bg-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)]">
                已选 {selectedIds.length} 条
              </span>
              {chunkableIds.length > 0 && (
                <Button 
                  variant="secondary" 
                  onClick={handleBatchChunk}
                  disabled={batchProcessing}
                  className="flex items-center gap-2"
                >
                  <Loader2 className={`w-4 h-4 ${batchProcessing ? "animate-spin" : ""}`} />
                  {ct.batchChunk(chunkableIds.length)}
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
                  {ct.batchEmbed(embeddableIds.length)}
                </Button>
              )}
              <div className="relative">
                <Button
                  variant="secondary"
                  onClick={() => setStudyMenuOpen((open) => !open)}
                  disabled={batchStudyUpdating !== null}
                  className="flex items-center gap-2"
                >
                  {batchStudyUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
                  学习状态
                  <ChevronDown className={`w-4 h-4 transition-transform ${studyMenuOpen ? "rotate-180" : ""}`} />
                </Button>
                {studyMenuOpen && (
                  <div className="absolute right-0 z-20 mt-2 w-36 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-[var(--shadow-lg)]">
                    {[
                      ["not_started", "标为未学"],
                      ["in_progress", "标为学习中"],
                      ["completed", "标为已学完"],
                    ].map(([status, label]) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => void handleBatchStudyStatus(status as StudyStatusValue)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
                      >
                        <BookOpen className="w-4 h-4 text-[var(--text-muted)]" />
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Button
                variant="secondary"
                onClick={openMoveModal}
                disabled={batchMoving || brains.filter((brain) => brain.id !== currentBrainId).length === 0}
                className="flex items-center gap-2"
              >
                <MoveRight className="w-4 h-4" />
                移动工作区
              </Button>
              <Button 
                variant="danger" 
                onClick={() => setShowBatchConfirm(true)}
                className="flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                {ct.batchDelete(selectedIds.length)}
              </Button>
            </div>
          )}
          <Button onClick={() => setShowUpload(v => !v)}>
            <UploadCloud className="w-4 h-4" />
            {ct.uploadBtn}
          </Button>
          <Button variant="secondary" onClick={() => setShowWebCapture(v => !v)}>
            <ExternalLink className="w-4 h-4" />
            采集网页
          </Button>
        </div>
      </div>

      {showUpload && (
        <Card className="mb-6 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-serif font-semibold text-text-primary">{ct.uploadTitle}</h2>
            <Button variant="ghost" onClick={() => setShowUpload(false)}>
              {ct.cancel}
            </Button>
          </div>
          <UploadArea onUploaded={handleUploaded} brainId={currentBrainId || undefined} />
        </Card>
      )}

      {showWebCapture && (
        <Card className="mb-6 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-serif font-semibold text-text-primary">采集网页</h2>
            <Button variant="ghost" onClick={() => setShowWebCapture(false)}>
              {ct.cancel}
            </Button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_auto] gap-3">
            <input
              type="url"
              value={webUrl}
              onChange={(e) => { setWebUrl(e.target.value); setWebPreview(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleCaptureWeb(); }}
              placeholder="https://example.com/article"
              className="dao-input w-full"
            />
            <input
              type="text"
              value={webTitle}
              onChange={(e) => setWebTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !webPreview) handleCaptureWeb(); }}
              placeholder="可选标题，留空则使用网页标题"
              className="dao-input w-full"
            />
            <Button onClick={handleCaptureWeb} disabled={webCapturing} className="flex items-center gap-2 justify-center">
              {webCapturing ? "获取中..." : "预览"}
            </Button>
          </div>
          {webPreview && (
            <div className="mt-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs text-[var(--text-muted)]">预览已生成 · 提取 {webPreview.text_length} 字符</p>
                  <h3 className="mt-1 truncate text-sm font-semibold text-[var(--text-primary)]">
                    {webTitle.trim() || webPreview.title}
                  </h3>
                  <p className="mt-2 line-clamp-4 text-xs leading-relaxed text-[var(--text-secondary)]">
                    {webPreview.excerpt}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="secondary" onClick={() => setWebPreview(null)} disabled={webSaving}>
                    修改
                  </Button>
                  <Button onClick={handleConfirmWebCapture} disabled={webSaving} className="flex items-center gap-2">
                    {webSaving ? "保存中..." : "确认保存"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex flex-wrap gap-1.5">
          {TYPE_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => updateTypeFilter(f.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                !retryOnly && typeFilter === f.value
                  ? "bg-jade text-text-inverse"
                  : "bg-bg-secondary text-text-secondary hover:bg-accent-soft hover:text-jade"
              }`}
            >
              {f.label}
            </button>
          ))}
          <button
            onClick={() => { setRetryOnly(v => !v); setPage(1); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
              retryOnly
                ? "bg-[var(--warning)] text-text-inverse"
                : "bg-bg-secondary text-text-secondary hover:bg-accent-soft hover:text-jade"
            }`}
          >
            嵌入重试队列
          </button>
          <span className="mx-1 h-7 w-px bg-[var(--border-subtle)]" />
          {STUDY_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => updateStudyFilter(f.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                studyFilter === f.value
                  ? "bg-emerald-600 text-white"
                  : "bg-bg-secondary text-text-secondary hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-300"
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
              placeholder={ct.searchPlaceholder}
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
            title="列表视图"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("grid")}
            className={`p-1.5 rounded-md transition-all ${
              viewMode === "grid" ? "bg-bg-secondary text-text-primary" : "text-text-muted hover:text-text-secondary"
            }`}
            title="网格视图"
          >
            <Grid3x3 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 分类筛选指示器 */}
      {categoryId && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xs px-3 py-1.5 rounded-full bg-[var(--warning-soft)] dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 font-medium">
            {ct.categoryFilterLabel}{categoryName || categoryId}
          </span>
          <button
            onClick={clearCategoryFilter}
            className="p-1 rounded-full text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] transition-colors"
            title={ct.clearCategoryFilter}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {retryOnly && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-[var(--warning)]/30 bg-[var(--warning-soft)] px-4 py-3">
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">嵌入重试队列</p>
            <p className="text-xs text-[var(--text-muted)]">这里集中展示处理失败的内容。选择已有分块的条目后，可使用批量嵌入重新入队。</p>
          </div>
          <button
            onClick={() => { setRetryOnly(false); setPage(1); }}
            className="p-1 rounded-full text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] transition-colors"
            title="关闭重试队列"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-jade" />
        </div>
      )}
      {error && (
        <Card className="p-6 text-center border-danger/20 bg-danger-soft">
          <p className="text-sm text-danger">{ct.error}{error}</p>
          <Button variant="secondary" onClick={() => load()} className="mt-4">
            <RefreshCw className="w-4 h-4" />
            {ct.retry}
          </Button>
        </Card>
      )}
      {!loading && !error && (!data || data.items.length === 0) && (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-xl bg-accent-soft mb-6">
            <BookOpen className="w-10 h-10 text-jade/60" />
          </div>
          <p className="text-text-muted mb-4">{ct.empty}</p>
          <p className="text-sm text-text-muted mb-6">
            {retryOnly ? "暂无需要重试的失败内容。" : ct.emptyHint}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {hasListFilters && (
              <Button variant="secondary" onClick={clearListFilters}>
                <X className="w-4 h-4" />
                清空筛选
              </Button>
            )}
            <Button onClick={() => setShowUpload(true)}>
              <UploadCloud className="w-4 h-4" />
              {ct.uploadBtn}
            </Button>
          </div>
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
                <th className="px-4 py-3">标题</th>
                <th className="px-4 py-3">类型</th>
                <th className="px-4 py-3">大小</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">创建时间</th>
                <th className="px-4 py-3 text-right">操作</th>
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
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={item.processing_status} />
                      <StudyStatusBadge status={item.extra_meta?.study_status} />
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
                        title={item.is_pinned ? "取消加持" : "加持"}
                      >
                        <Pin className={`w-4 h-4 ${item.is_pinned ? "text-jade fill-jade" : "text-text-muted"}`} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setDeleteConfirmId(item.id); }}
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
                    title={item.is_pinned ? "取消加持" : "加持"}
                  >
                    <Pin className={`w-4 h-4 ${item.is_pinned ? "text-jade fill-jade" : "text-text-muted"}`} />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setDeleteConfirmId(item.id); }}
                    disabled={deletingId === item.id}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-text-muted hover:text-danger transition-all"
                    title="归入归墟"
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
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge status={item.processing_status} />
                <StudyStatusBadge status={item.extra_meta?.study_status} />
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

      <ConfirmDialog
        open={deleteConfirmId !== null}
        title="归入归墟"
        message="确定要将此典籍归入归墟吗？此操作将一并清除相关向量记录。"
        confirmLabel="确认归入"
        cancelLabel="取消"
        variant="danger"
        loading={deletingId !== null}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirmId(null)}
      />

      {showMoveModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
          onClick={() => !batchMoving && setShowMoveModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-[var(--border-subtle)]">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">移动到工作区</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">已选择 {selectedIds.length} 条内容</p>
            </div>
            <div className="p-6 space-y-3">
              <label className="block text-[13px] font-medium text-[var(--text-primary)]">目标工作区</label>
              <select
                value={moveTargetBrainId}
                onChange={(e) => setMoveTargetBrainId(e.target.value)}
                className="dao-input w-full"
              >
                {brains.filter((brain) => brain.id !== currentBrainId).map((brain) => (
                  <option key={brain.id} value={brain.id}>{brain.name}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--border-subtle)] bg-[var(--bg-secondary)]/70">
              <button
                className="dao-btn-ghost text-sm px-5"
                disabled={batchMoving}
                onClick={() => setShowMoveModal(false)}
              >
                取消
              </button>
              <button
                className="dao-btn dao-btn-primary text-sm px-5 inline-flex items-center gap-2 disabled:opacity-50"
                disabled={batchMoving || !moveTargetBrainId}
                onClick={handleBatchMove}
              >
                {batchMoving && <Loader2 className="w-4 h-4 animate-spin" />}
                确认移动
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
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

function StudyStatusBadge({ status }: { status: unknown }) {
  const value = typeof status === "string" ? status : "not_started";
  const map: Record<string, string> = {
    not_started: "bg-bg-secondary text-text-muted",
    in_progress: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    completed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  };
  const label: Record<string, string> = {
    not_started: "未学",
    in_progress: "学习中",
    completed: "已学完",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${map[value] || map.not_started}`}>
      {label[value] || label.not_started}
    </span>
  );
}
