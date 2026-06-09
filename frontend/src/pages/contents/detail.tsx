import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { fileApi, contentApi, type FileItem } from "../../api/content";
import { annotationApi, type Annotation } from "../../api/annotations";
import { tagApi, categoryApi, collectionApi } from "../../api/organization";
import type { Tag, Category, CollectionItem } from "../../api/organization";
import { relationApi, type SeriesInfo } from "../../api/relations";
import ImageViewer from "../../components/ImageViewer";
import PDFViewer from "../../components/PDFViewer";
import VideoPlayer from "../../components/VideoPlayer";
import AudioPlayer from "../../components/AudioPlayer";
import AnnotationToolbar from "../../components/AnnotationToolbar";
import AnnotationPanel from "../../components/AnnotationPanel";
import KnowledgeGraph from "../../components/KnowledgeGraph";
import SeriesNavigation from "../../components/SeriesNavigation";
import Toast from "../../components/Toast";
import ConfirmDialog from "../../components/ConfirmDialog";
import PromptEditor from "../../components/PromptEditor";
import QuizGenerator from "../../components/QuizGenerator";
import {
  ArrowLeft, Save, RefreshCw, Trash2, FileText,
  FileAudio, FileVideo, Image, FileSpreadsheet, File, Globe,
  Star, Bookmark, Tag as TagIcon, FolderOpen,
  Sparkles, Brain, Loader2, MessageCircle,
  MessageSquare, ChevronDown, ChevronUp, Settings2,
  ArrowUp, ArrowDown, ZoomIn, X, RefreshCw as RefreshIcon, CheckCircle2
} from "lucide-react";
import { useBrain } from "../../lib/brain-context";
import { compareCollectionItems } from "../../lib/collection-sort";
import { api } from "../../api/provider";

const TYPE_ICON_MAP: Record<string, React.ReactNode> = {
  note: <FileText className="w-5 h-5 text-[var(--accent-text)]" />,
  image: <Image className="w-5 h-5 text-[var(--success)]" />,
  video: <FileVideo className="w-5 h-5 text-purple-500" />,
  audio: <FileAudio className="w-5 h-5 text-orange-500" />,
  pdf: <FileText className="w-5 h-5 text-[var(--danger)]" />,
  doc: <FileSpreadsheet className="w-5 h-5 text-indigo-500" />,
  web: <Globe className="w-5 h-5 text-cyan-500" />,
};

function getTypeIcon(type: string) {
  return TYPE_ICON_MAP[type] ?? <File className="w-5 h-5 text-[var(--text-muted)]" />;
}

interface DocumentHeading {
  text: string;
  level?: number | null;
}

interface DocumentTable {
  table_index?: number;
  row_count?: number;
  column_count?: number;
  preview?: string[][];
}

interface DocumentSheet {
  name: string;
  max_row?: number;
  max_column?: number;
  non_empty_rows?: number;
  preview?: string[][];
}

interface DocumentStructure {
  format?: string;
  paragraph_count?: number;
  headings?: DocumentHeading[];
  tables?: DocumentTable[];
  sheets?: DocumentSheet[];
}

interface ContentStatusResponse {
  processing_status: string;
  chunk_count: number;
  text_chunks: number;
  image_chunks: number;
  embedded_chunks: number;
}

function getDocumentStructure(item: FileItem | null): DocumentStructure | null {
  const structure = item?.extra_meta?.document_structure;
  if (!structure || typeof structure !== "object") return null;
  return structure as DocumentStructure;
}

function getStringMeta(item: FileItem | null, key: string): string | null {
  const value = item?.extra_meta?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function storageFileUrl(path: string): string {
  if (/^https?:\/\//i.test(path) || path.startsWith("/")) return path;
  return `/files/${path.split("/").map(part => encodeURIComponent(part)).join("/")}`;
}

function DocumentStructurePanel({ structure }: { structure: DocumentStructure }) {
  const format = (structure.format || "document").toUpperCase();
  return (
    <div className="mb-6 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
      <div className="flex items-center gap-2 mb-3">
        <FileSpreadsheet className="w-4 h-4 text-indigo-500" />
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">文档结构</h2>
        <span className="text-xs px-2 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-muted)]">{format}</span>
      </div>

      {structure.headings && structure.headings.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-medium text-[var(--text-muted)] mb-2">标题</p>
          <div className="space-y-1">
            {structure.headings.slice(0, 8).map((heading, index) => (
              <div key={`${heading.text}-${index}`} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <span className="text-xs text-[var(--text-muted)] w-10">H{heading.level ?? "-"}</span>
                <span className="truncate">{heading.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {structure.tables && structure.tables.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-medium text-[var(--text-muted)] mb-2">表格</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {structure.tables.slice(0, 4).map((table, index) => (
              <div key={index} className="rounded-lg border border-[var(--border-subtle)] p-3 text-xs text-[var(--text-secondary)]">
                <div className="font-medium text-[var(--text-primary)] mb-1">表格 {(table.table_index ?? index) + 1}</div>
                <div>{table.row_count ?? 0} 行 x {table.column_count ?? 0} 列</div>
                {table.preview?.[0] && (
                  <div className="mt-2 text-[var(--text-muted)] truncate">{table.preview[0].join(" | ")}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {structure.sheets && structure.sheets.length > 0 && (
        <div>
          <p className="text-xs font-medium text-[var(--text-muted)] mb-2">工作表</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {structure.sheets.slice(0, 6).map((sheet) => (
              <div key={sheet.name} className="rounded-lg border border-[var(--border-subtle)] p-3 text-xs text-[var(--text-secondary)]">
                <div className="font-medium text-[var(--text-primary)] mb-1">{sheet.name}</div>
                <div>{sheet.non_empty_rows ?? 0} 个非空行</div>
                <div>{sheet.max_row ?? 0} 行 x {sheet.max_column ?? 0} 列</div>
                {sheet.preview?.[0] && (
                  <div className="mt-2 text-[var(--text-muted)] truncate">{sheet.preview[0].join(" | ")}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const STATUS_MAP: Record<string, string> = {
  pending: "bg-[var(--warning-soft)] text-amber-700 dark:bg-amber-900/40",
  chunking: "bg-purple-100 text-purple-700 dark:bg-purple-900/40",
  chunked: "bg-teal-100 text-teal-700 dark:bg-teal-900/40",
  embedding: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40",
  processing: "bg-blue-100 text-blue-700 dark:bg-blue-900/40",
  partial: "bg-orange-100 text-orange-700 dark:bg-orange-900/40",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40",
  failed: "bg-[var(--danger-soft)] text-red-700 dark:bg-red-900/40",
};

const STUDY_STATUS_OPTIONS = [
  { value: "not_started", label: "未学" },
  { value: "in_progress", label: "学习中" },
  { value: "completed", label: "已学完" },
] as const;

export default function ContentsDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentBrainId } = useBrain();
  
  const targetPage = searchParams.get("page") ? parseInt(searchParams.get("page")!, 10) : undefined;
  const targetTime = searchParams.get("t") ? parseFloat(searchParams.get("t")!) : undefined;
  const collectionId = searchParams.get("collection_id") || null;

  const [item, setItem] = useState<FileItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");

  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [allCats, setAllCats] = useState<Category[]>([]);
  const [itemTags, setItemTags] = useState<string[]>([]);
  const [itemCat, setItemCat] = useState<string | null>(null);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [loadingOrg, setLoadingOrg] = useState(false);
  const [studyUpdating, setStudyUpdating] = useState(false);
  const [openingCollectionItem, setOpeningCollectionItem] = useState<string | null>(null);

  const [showAiPanel, setShowAiPanel] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [relatedItems, setRelatedItems] = useState<{ id: string; title: string; content_type: string; similarity: number; relation_type?: string | null; relation_bonus?: number; matched_chunk?: { chunk_id: string; chunk_index: number; page_number: number | null; image_path: string | null } }[] | null>(null);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [showQaPromptEditor, setShowQaPromptEditor] = useState(false);
  const [qaQuestion, setQaQuestion] = useState("");
  const [qaAsking, setQaAsking] = useState(false);
  const [qaAnswer, setQaAnswer] = useState<string | null>(null);
  const [qaSources, setQaSources] = useState<Array<{ chunk_id: string; content_id: string; content_title: string; page_number: number | null; chunk_text: string }>>([]);
  const [qaSavingNote, setQaSavingNote] = useState(false);


  const [contentTab, setContentTab] = useState<"text" | "chunks">("text");
  const [chunks, setChunks] = useState<{
    id: string; chunk_index: number; chunk_type: string; chunk_text: string | null;
    embedding_type: string | null; page_number: number | null; time_start: number | null;
    image_path: string | null; has_embedding: boolean;
  }[]>([]);
  const [chunksPage, setChunksPage] = useState(1);
  const [chunksPageSize] = useState(50);
  const [chunksTotal, setChunksTotal] = useState(0);
  const [loadingChunks, setLoadingChunks] = useState(false);
  const [contentExpanded, setContentExpanded] = useState(false);
  const [statusInfo, setStatusInfo] = useState<{
    chunk_count: number;
    text_chunks: number;
    image_chunks: number;
    embedded_chunks: number;
  } | null>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);

  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [showAnnotationPanel, setShowAnnotationPanel] = useState(false);
  const [loadingAnnotations, setLoadingAnnotations] = useState(false);

  const [series, setSeries] = useState<SeriesInfo | null>(null);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [collectionContext, setCollectionContext] = useState<{
    id: string;
    name: string;
    items: CollectionItem[];
  } | null>(null);

  const [showGraphPanel, setShowGraphPanel] = useState(false);

  const [showImageViewer, setShowImageViewer] = useState(false);

  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [showScrollButtons, setShowScrollButtons] = useState(false);

  async function load() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fileApi.get(id);
      const orgBrainId = data.brain_id || currentBrainId;
      const [tags, cats, statusRes] = await Promise.all([
        tagApi.list(1, 200, orgBrainId),
        categoryApi.listAll(orgBrainId),
        api.get<ContentStatusResponse>(`/contents/${id}/status`),
      ]);
      setItem(data);
      setStatusInfo(statusRes);
      setEditText(data.text_content || "");
      setAllTags(tags);
      setAllCats(cats);
      setItemTags((data.extra_meta?.tags as string[] | undefined) || []);
      setItemCat(
        (data.extra_meta?.category_id as string | null | undefined) ||
        (data.extra_meta?.import_category_id as string | null | undefined) ||
        null
      );
      setFavorited(Boolean(data.extra_meta?.favorited));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id, currentBrainId]);

  useEffect(() => {
    if (!id) return;
    setLoadingAnnotations(true);
    annotationApi.list(id)
      .then(setAnnotations)
      .catch(console.error)
      .finally(() => setLoadingAnnotations(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setLoadingSeries(true);
    relationApi.getSeries(id)
      .then(setSeries)
      .catch(() => setSeries(null))
      .finally(() => setLoadingSeries(false));
  }, [id]);

  useEffect(() => {
    if (!collectionId) {
      setCollectionContext(null);
      return;
    }
    collectionApi.get(collectionId)
      .then((data) => {
        setCollectionContext({
          id: data.collection.id,
          name: data.collection.name,
          items: [...data.items].sort(compareCollectionItems),
        });
      })
      .catch(() => setCollectionContext(null));
  }, [collectionId]);

  const scrollToTop = useCallback(() => {
    mainContentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const scrollToBottom = useCallback(() => {
    const container = mainContentRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const container = mainContentRef.current;
    if (!container) return;
    const handleScroll = () => {
      setShowScrollButtons(container.scrollTop > 200);
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  async function pollProcessingStatus(doneStatuses: string[] = ["completed", "failed", "partial", "chunked"]) {
    if (!id) return;
    const poll = async () => {
      const status = await api.get<ContentStatusResponse>(`/contents/${id}/status`);
      if (doneStatuses.includes(status.processing_status)) {
        await load();
        if (status.processing_status === "chunked") {
          setContentTab("chunks");
          await loadChunks(1);
        }
        setProcessing(false);
      } else {
        setTimeout(poll, 1500);
      }
    };
    poll();
  }

  async function handleReprocess() {
    if (!id) return;
    setProcessing(true);
    try {
      await api.post<unknown>(`/contents/${id}/process`);
      pollProcessingStatus(["completed", "failed", "partial"]);
    } catch (err) {
      const msg = "重新处理失败: " + (err as Error).message;
      setError(msg);
      setToast({ type: "error", message: msg });
      setProcessing(false);
    }
  }

  async function handleChunk() {
    if (!id) return;
    setProcessing(true);
    try {
      await contentApi.chunkContent(id);
      pollProcessingStatus(["chunked", "failed"]);
    } catch (err) {
      setError((err as Error).message);
      setToast({ type: "error", message: "分块失败: " + (err as Error).message });
      setProcessing(false);
    }
  }

  async function handleEmbed() {
    if (!id) return;
    setProcessing(true);
    try {
      await contentApi.embedContent(id);
      pollProcessingStatus(["completed", "failed", "partial"]);
    } catch (err) {
      setError((err as Error).message);
      setToast({ type: "error", message: "生成嵌入失败: " + (err as Error).message });
      setProcessing(false);
    }
  }

  async function loadChunks(page = 1) {
    if (!id) return;
    setLoadingChunks(true);
    try {
      const res = await contentApi.getChunks(id, page, chunksPageSize);
      setChunks(res.chunks);
      setChunksTotal(res.total);
      setChunksPage(res.page);
    } catch { /* ignore */ }
    finally { setLoadingChunks(false); }
  }

  async function handleSaveText() {
    if (!id) return;
    try {
      await contentApi.update(id, { text_content: editText });
      setItem(prev => prev ? { ...prev, text_content: editText } : prev);
      setEditing(false);
      setToast({ type: "success", message: "文本已保存" });
    } catch (err) {
      setToast({ type: "error", message: "保存失败: " + (err as Error).message });
    }
  }

  async function handleDelete() {
    if (!id) return;
    setDeleting(true);
    try {
      await fileApi.delete(id);
      setDeleteConfirmOpen(false);
      navigate("/contents");
    } catch (err) {
      setToast({ type: "error", message: "删除失败: " + (err as Error).message });
    } finally {
      setDeleting(false);
    }
  }

  const handleAskQuick = useCallback(async () => {
    if (!id || !qaQuestion.trim()) return;
    setQaAsking(true);
    setQaAnswer(null);
    setQaSources([]);
    try {
      const data = await api.post<{
        answer?: string | null;
        sources?: Array<{ chunk_id: string; content_id: string; content_title: string; page_number: number | null; chunk_text: string }>;
      }>("/ai/ask", {
        question: qaQuestion.trim(),
        top_k: 5,
        scope_type: "content",
        scope_id: id,
        brain_id: item?.brain_id || currentBrainId || undefined,
      });
      setQaAnswer(data.answer || null);
      setQaSources(data.sources || []);
    } catch (err) {
      setToast({ type: "error", message: "提问失败: " + (err as Error).message });
    }
    finally { setQaAsking(false); }
  }, [id, qaQuestion, item?.brain_id, currentBrainId]);

  const handleSaveQaToNote = useCallback(async () => {
    if (!qaAnswer || !qaQuestion) return;
    setQaSavingNote(true);
    try {
      const sourcesMd = qaSources.length > 0
        ? "\n\n---\n**引用来源：**\n" + qaSources.map((s, i) =>
            `${i + 1}. 《${s.content_title}》${s.page_number ? ` 第${s.page_number}页` : ""}`
          ).join("\n")
        : "";
      const content = `${qaAnswer}${sourcesMd}`;
      await api.post<unknown>("/notes", { title: qaQuestion, content, brain_id: item?.brain_id || currentBrainId || undefined });
      setToast({ type: "success", message: "已保存到笔记" });
    } catch (err) {
      setToast({ type: "error", message: "保存失败: " + (err as Error).message });
    }
    finally { setQaSavingNote(false); }
  }, [qaAnswer, qaQuestion, qaSources, item?.brain_id, currentBrainId]);

  const handleSummarize = useCallback(async (force = false) => {
    if (!id) return;
    if (summary !== null && !force) {
      setShowAiPanel(true);
      return;
    }
    setShowAiPanel(true);
    setSummarizing(true);
    try {
      const data = await api.post<{ summary: string }>("/ai/summarize", { content_id: id, max_length: 500 });
      setSummary(data.summary);
    } catch (e) {
      const msg = "摘要生成失败: " + (e as Error).message;
      setSummary(msg);
      setToast({ type: "error", message: msg });
    } finally {
      setSummarizing(false);
    }
  }, [id, summary]);

  const handleRelated = useCallback(async (force = false) => {
    if (!id) return;
    if (relatedItems !== null && !force) {
      setShowAiPanel(true);
      return;
    }
    setShowAiPanel(true);
    setLoadingRelated(true);
    try {
      const data = await api.get<{ related?: typeof relatedItems }>(`/ai/related/${id}?top_k=10`);
      setRelatedItems(data.related || []);
    } catch (e) {
      setToast({ type: "error", message: "获取相关内容失败: " + (e as Error).message });
    } finally {
      setLoadingRelated(false);
    }
  }, [id, relatedItems]);

  async function toggleTag(tagId: string) {
    if (!id) return;
    setLoadingOrg(true);
    try {
      if (itemTags.includes(tagId)) {
        await tagApi.removeFromContent(id, tagId);
        setItemTags(prev => prev.filter(t => t !== tagId));
      } else {
        await tagApi.addToContent(id, tagId);
        setItemTags(prev => [...prev, tagId]);
      }
    } catch (err) {
      setToast({ type: "error", message: (err as Error).message });
    } finally {
      setLoadingOrg(false);
    }
  }

  async function setCategory(catId: string | null) {
    if (!id) return;
    setLoadingOrg(true);
    try {
      await categoryApi.moveContent(id, catId);
      setItemCat(catId);
      setShowCatPicker(false);
    } catch (err) {
      setToast({ type: "error", message: (err as Error).message });
    } finally {
      setLoadingOrg(false);
    }
  }

  async function toggleFavorite() {
    if (!id) return;
    try {
      const res = await collectionApi.toggleFavorite(id);
      setFavorited(res.favorited);
    } catch (err) {
      setToast({ type: "error", message: (err as Error).message });
    }
  }

  async function setStudyStatus(status: "not_started" | "in_progress" | "completed") {
    if (!item) return false;
    setStudyUpdating(true);
    try {
      const now = new Date().toISOString();
      const nextMeta: Record<string, unknown> = {
        ...(item.extra_meta || {}),
        study_status: status,
        study_started_at: status === "not_started" ? null : (item.extra_meta?.study_started_at || now),
        study_completed_at: status === "completed" ? now : null,
      };
      const updated = await contentApi.update(item.id, { extra_meta: nextMeta });
      setItem(updated);
      setCollectionContext((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((entry) =>
                entry.content_id === item.id
                  ? {
                      ...entry,
                      study_status: status,
                      study_started_at: status === "not_started" ? null : (entry.study_started_at || now),
                      study_completed_at: status === "completed" ? now : null,
                    }
                  : entry
              ),
            }
          : prev
      );
      return true;
    } catch (e) {
      setToast({ type: "error", message: (e as Error).message || "更新学习状态失败" });
      return false;
    } finally {
      setStudyUpdating(false);
    }
  }

  async function markCollectionItemInProgress(entry: CollectionItem) {
    if (entry.study_status === "in_progress" || entry.study_status === "completed") return;
    const now = new Date().toISOString();
    await contentApi.update(entry.content_id, {
      extra_meta: {
        study_status: "in_progress",
        study_started_at: entry.study_started_at || now,
        study_completed_at: null,
      },
    });
    setCollectionContext((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((item) =>
              item.content_id === entry.content_id
                ? {
                    ...item,
                    study_status: "in_progress",
                    study_started_at: item.study_started_at || now,
                    study_completed_at: null,
                  }
                : item
            ),
          }
        : prev
    );
  }

  function renderTextWithAnnotations(text: string, annotations: Annotation[]): React.ReactNode {
    if (!annotations.length) return <p className="whitespace-pre-wrap">{text}</p>;
    
    const sorted = [...annotations].sort((a, b) => a.start_offset - b.start_offset);
    
    const parts: React.ReactNode[] = [];
    let lastEnd = 0;
    
    sorted.forEach((ann, i) => {
      if (ann.start_offset > lastEnd) {
        parts.push(<span key={`text-${i}`}>{text.slice(lastEnd, ann.start_offset)}</span>);
      }
      parts.push(
        <mark
          key={`mark-${ann.id}`}
          className="bg-yellow-200 dark:bg-yellow-800/50 rounded px-0.5 cursor-pointer group relative"
          title={ann.annotation_text}
        >
          {text.slice(ann.start_offset, ann.end_offset)}
          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-[var(--accent)] text-white text-xs rounded-lg shadow-[var(--shadow-lg)] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap max-w-xs truncate pointer-events-none z-50">
            {ann.annotation_text}
          </span>
        </mark>
      );
      lastEnd = ann.end_offset;
    });
    
    if (lastEnd < text.length) {
      parts.push(<span key="text-end">{text.slice(lastEnd)}</span>);
    }
    
    return <p className="whitespace-pre-wrap">{parts}</p>;
  }

  function handleLocateAnnotation(ann: Annotation) {
    const markEl = document.querySelector(`mark[title="${ann.annotation_text}"]`);
    if (markEl) {
      markEl.scrollIntoView({ behavior: "smooth", block: "center" });
      markEl.classList.add("ring-2", "ring-blue-500");
      setTimeout(() => markEl.classList.remove("ring-2", "ring-blue-500"), 2000);
    }
  }

  function handleDeleteAnnotation(id: string) {
    setAnnotations(prev => prev.filter(a => a.id !== id));
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-20 text-center text-[var(--text-muted)]">
        加载中...
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-20 text-center text-[var(--danger)]">
        {error || "内容不存在"}
        <div className="mt-4">
          <Link to="/contents" className="text-sm text-[var(--accent-text)] hover:underline">
            返回列表
          </Link>
        </div>
      </div>
    );
  }

  const statusLabel: Record<string, string> = {
    pending: "待处理",
    chunking: "分块中...",
    chunked: "已分块",
    embedding: "向量化中...",
    processing: "处理中...",
    partial: "部分完成",
    completed: "已完成",
    failed: "失败",
  };

  const collectionIndex = collectionContext?.items.findIndex((entry) => entry.content_id === item.id) ?? -1;
  const collectionPrev = collectionContext && collectionIndex > 0 ? collectionContext.items[collectionIndex - 1] : null;
  const collectionNext = collectionContext && collectionIndex >= 0 && collectionIndex < collectionContext.items.length - 1
    ? collectionContext.items[collectionIndex + 1]
    : null;
  const collectionStudyTotal = collectionContext?.items.length ?? 0;
  const collectionStudyCompleted = collectionContext?.items.filter((entry) => entry.study_status === "completed").length ?? 0;
  const collectionStudyInProgress = collectionContext?.items.filter((entry) => entry.study_status === "in_progress").length ?? 0;
  const collectionStudyNotStarted = Math.max(
    0,
    collectionStudyTotal - collectionStudyCompleted - collectionStudyInProgress
  );
  const collectionStudyPercent = collectionStudyTotal > 0
    ? Math.round((collectionStudyCompleted / collectionStudyTotal) * 100)
    : 0;
  const currentCollectionItem = collectionContext && collectionIndex >= 0
    ? collectionContext.items[collectionIndex]
    : null;
  const handleCompleteAndAdvance = async () => {
    const ok = await setStudyStatus("completed");
    if (!ok) return;
    if (collectionNext && collectionContext) {
      try {
        await markCollectionItemInProgress(collectionNext);
      } catch (e) {
        setToast({ type: "error", message: (e as Error).message || "下一节状态更新失败" });
      }
      navigate(`/contents/${collectionNext.content_id}?collection_id=${collectionContext.id}`);
    } else {
      setToast({ type: "success", message: "已标记为学完" });
    }
  };

  const handleOpenCollectionItem = async (entry: CollectionItem) => {
    if (!collectionContext || openingCollectionItem) return;
    setOpeningCollectionItem(entry.content_id);
    try {
      try {
        await markCollectionItemInProgress(entry);
      } catch (e) {
        setToast({ type: "error", message: (e as Error).message || "学习状态更新失败" });
      }
      navigate(`/contents/${entry.content_id}?collection_id=${collectionContext.id}`);
    } finally {
      setOpeningCollectionItem(null);
    }
  };

  return (
    <div className="flex h-screen relative">
      <div ref={mainContentRef} className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <Link
            to={collectionId ? `/collections/${collectionId}` : "/contents"}
            className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] dark:text-[var(--text-muted)] hover:text-[var(--text-primary)] dark:hover:text-[var(--text-primary)] mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            {collectionId ? "返回合集" : "返回列表"}
          </Link>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          {getTypeIcon(item.content_type)}
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">
              {item.title}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-[var(--text-muted)] capitalize">{item.content_type}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_MAP[item.processing_status] || STATUS_MAP.pending}`}>
                {statusLabel[item.processing_status] || item.processing_status}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowAnnotationPanel(v => !v)}
            className={`p-2 rounded-lg transition-colors ${
              showAnnotationPanel
                ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300"
                : "text-[var(--text-secondary)] dark:text-[var(--text-muted)] hover:text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-950/30"
            }`}
            title="批注"
          >
            <MessageSquare className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowGraphPanel(v => !v)}
            className={`p-2 rounded-lg transition-colors ${
              showGraphPanel
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                : "text-[var(--text-secondary)] dark:text-[var(--text-muted)] hover:text-[var(--accent-text)] hover:bg-[var(--accent-soft)] dark:hover:bg-blue-950/30"
            }`}
            title="关联图谱"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <circle cx="4" cy="6" r="2" />
              <circle cx="20" cy="6" r="2" />
              <circle cx="4" cy="18" r="2" />
              <circle cx="20" cy="18" r="2" />
              <line x1="9.5" y1="10.5" x2="5.5" y2="7.5" />
              <line x1="14.5" y1="10.5" x2="18.5" y2="7.5" />
              <line x1="9.5" y1="13.5" x2="5.5" y2="16.5" />
              <line x1="14.5" y1="13.5" x2="18.5" y2="16.5" />
            </svg>
          </button>
          <button
            onClick={() => setShowAiPanel(v => !v)}
            className={`p-2 rounded-lg transition-colors ${
              showAiPanel
                ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                : "text-[var(--text-secondary)] dark:text-[var(--text-muted)] hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
            }`}
            title="AI 助手"
          >
            <Sparkles className="w-4 h-4" />
          </button>
          {(
            item.processing_status === "pending" || 
            (item.processing_status === "failed" && (!statusInfo || statusInfo.chunk_count === 0))
          ) && (
            <button
              onClick={handleChunk}
              disabled={processing}
              className="p-2 text-[var(--text-secondary)] dark:text-[var(--text-muted)] hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/30 rounded-lg transition-colors disabled:opacity-50"
              title="智能分块"
            >
              <RefreshCw className={`w-4 h-4 ${processing ? "animate-spin" : ""}`} />
            </button>
          )}
          {(
            item.processing_status === "chunked" || 
            item.processing_status === "partial" || 
            (item.processing_status === "failed" && statusInfo && statusInfo.chunk_count > 0)
          ) && (
            <button
              onClick={handleEmbed}
              disabled={processing}
              className="p-2 text-[var(--text-secondary)] dark:text-[var(--text-muted)] hover:text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-950/30 rounded-lg transition-colors disabled:opacity-50"
              title="生成嵌入"
            >
              <Sparkles className={`w-4 h-4 ${processing ? "animate-pulse" : ""}`} />
            </button>
          )}
          {(
            item.processing_status === "chunked" || 
            item.processing_status === "completed" || 
            item.processing_status === "partial" ||
            (item.processing_status === "failed" && statusInfo && statusInfo.chunk_count > 0)
          ) && (
            <button
              onClick={handleChunk}
              disabled={processing}
              className="p-2 text-[var(--text-secondary)] dark:text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] dark:hover:bg-[var(--bg-elevated)] rounded-lg transition-colors disabled:opacity-50"
              title="重新分块"
            >
              <RefreshCw className={`w-4 h-4 ${processing ? "animate-spin" : ""}`} />
            </button>
          )}
          {item.processing_status !== "processing" && item.processing_status !== "chunking" && item.processing_status !== "embedding" && (
            <button
              onClick={handleReprocess}
              disabled={processing}
              className="p-2 text-[var(--text-secondary)] dark:text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] dark:hover:bg-[var(--bg-elevated)] rounded-lg transition-colors disabled:opacity-50"
              title="完整处理"
            >
              <Loader2 className={`w-4 h-4 ${processing ? "animate-spin" : ""}`} />
            </button>
          )}
          <button
            onClick={() => setDeleteConfirmOpen(true)}
            className="p-2 text-[var(--text-secondary)] dark:text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] dark:hover:bg-red-950/30 rounded-lg transition-colors"
            title="删除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {(series || loadingSeries) && (
        <div className="mb-6">
          <SeriesNavigation
            series={series || {
              series_name: "",
              current_index: 0,
              total: 0,
              prev: null,
              next: null,
              items: [],
            }}
            loading={loadingSeries}
          />
        </div>
      )}

      {collectionContext && collectionIndex >= 0 && (
        <div className="mb-6 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-[var(--text-muted)]">合集学习</p>
              <Link
                to={`/collections/${collectionContext.id}`}
                className="truncate text-sm font-medium text-[var(--accent-text)] hover:underline"
              >
                {collectionContext.name}
              </Link>
              {currentCollectionItem?.folder_path && (
                <p className="mt-1 truncate text-xs text-[var(--text-muted)]">
                  {currentCollectionItem.folder_path}
                </p>
              )}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold text-[var(--text-primary)]">{collectionStudyPercent}%</p>
              <p className="text-xs text-[var(--text-muted)]">
                第 {collectionIndex + 1} / {collectionContext.items.length} 节
              </p>
            </div>
          </div>
          <div className="mb-4">
            <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${collectionStudyPercent}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
              <span>已学完 {collectionStudyCompleted}</span>
              <span>学习中 {collectionStudyInProgress}</span>
              <span>未学 {collectionStudyNotStarted}</span>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {collectionPrev ? (
              <button
                type="button"
                disabled={openingCollectionItem === collectionPrev.content_id}
                onClick={() => void handleOpenCollectionItem(collectionPrev)}
                className="rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-left text-sm hover:bg-[var(--bg-secondary)] disabled:cursor-wait disabled:opacity-70"
              >
                <span className="block text-xs text-[var(--text-muted)]">上一节</span>
                <span className="flex items-center gap-2 truncate text-[var(--text-primary)]">
                  {openingCollectionItem === collectionPrev.content_id && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
                  <span className="truncate">{collectionPrev.title}</span>
                </span>
              </button>
            ) : (
              <div className="rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-sm text-[var(--text-muted)]">
                已是第一节
              </div>
            )}
            {collectionNext ? (
              <button
                type="button"
                disabled={openingCollectionItem === collectionNext.content_id}
                onClick={() => void handleOpenCollectionItem(collectionNext)}
                className="rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-left text-sm hover:bg-[var(--bg-secondary)] disabled:cursor-wait disabled:opacity-70"
              >
                <span className="block text-xs text-[var(--text-muted)]">下一节</span>
                <span className="flex items-center gap-2 truncate text-[var(--text-primary)]">
                  {openingCollectionItem === collectionNext.content_id && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
                  <span className="truncate">{collectionNext.title}</span>
                </span>
              </button>
            ) : (
              <div className="rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-sm text-[var(--text-muted)]">
                已是最后一节
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 text-sm">
        <div className="bg-[var(--bg-primary)] dark:bg-[var(--bg-card)] border border-[var(--border-subtle)] dark:border-[var(--border-subtle)] rounded-lg p-3">
          <p className="text-xs text-[var(--text-muted)] mb-1">文件大小</p>
          <p className="font-medium text-[var(--text-primary)] dark:text-[var(--text-primary)]">
            {item.file_size ? `${(item.file_size / 1024).toFixed(1)} KB` : "-"}
          </p>
        </div>
        <div className="bg-[var(--bg-primary)] dark:bg-[var(--bg-card)] border border-[var(--border-subtle)] dark:border-[var(--border-subtle)] rounded-lg p-3">
          <p className="text-xs text-[var(--text-muted)] mb-1">创建时间</p>
          <p className="font-medium text-[var(--text-primary)] dark:text-[var(--text-primary)]">
            {new Date(item.created_at).toLocaleDateString("zh-CN")}
          </p>
        </div>
        <div className="bg-[var(--bg-primary)] dark:bg-[var(--bg-card)] border border-[var(--border-subtle)] dark:border-[var(--border-subtle)] rounded-lg p-3">
          <p className="text-xs text-[var(--text-muted)] mb-1">嵌入状态</p>
          <div className="flex flex-wrap gap-1">
            {item.embedding && (
              <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                ✅ 内容向量
              </span>
            )}
            {statusInfo && statusInfo.embedded_chunks !== undefined && statusInfo.embedded_chunks > 0 && (
              <span className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400">
                📊 分块 {statusInfo.embedded_chunks}/{statusInfo.chunk_count}
              </span>
            )}
            {!item.embedding && (!statusInfo || statusInfo.embedded_chunks === undefined || statusInfo.embedded_chunks === 0) && (
              <span className="inline-flex items-center gap-1 text-sm font-medium text-[var(--text-muted)]">
                ⏳ 未生成
              </span>
            )}
          </div>
        </div>
        <div className="bg-[var(--bg-primary)] dark:bg-[var(--bg-card)] border border-[var(--border-subtle)] dark:border-[var(--border-subtle)] rounded-lg p-3">
          <p className="text-xs text-[var(--text-muted)] mb-1">文本内容</p>
          <p className="font-medium text-[var(--text-primary)] dark:text-[var(--text-primary)]">
            {item.text_content ? `${item.text_content.length} 字` : "无"}
          </p>
        </div>
      </div>

      {getStringMeta(item, "import_relative_path") && (
        <div className="mb-6 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent-text)]">
              <FolderOpen className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)]">导入来源</p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {getStringMeta(item, "import_root") || "文件夹导入"}
              </p>
              <p className="mt-1 truncate text-xs text-[var(--text-muted)]">
                {getStringMeta(item, "import_relative_path")}
              </p>
              {getStringMeta(item, "import_collection_id") && (
                <Link
                  to={`/collections/${getStringMeta(item, "import_collection_id")}`}
                  className="mt-2 inline-flex text-xs font-medium text-[var(--accent-text)] hover:underline"
                >
                  打开合集
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="relative">
          <button
            onClick={() => setShowTagPicker(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[var(--bg-secondary)] dark:bg-[var(--bg-elevated)] hover:bg-[var(--bg-secondary)] dark:hover:bg-zinc-700 rounded-lg transition-colors"
          >
            <TagIcon className="w-3.5 h-3.5" />
            {itemTags.length > 0 ? `${itemTags.length} 个标签` : "添加标签"}
          </button>
          {showTagPicker && (
            <div className="absolute z-20 mt-1 w-48 bg-[var(--bg-card)] dark:bg-[var(--bg-card)] border border-[var(--border-subtle)] dark:border-[var(--border-subtle)] rounded-lg shadow-[var(--shadow-lg)] p-2">
              {allTags.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] px-2 py-1">暂无标签</p>
              ) : (
                allTags.map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => void toggleTag(tag.id)}
                    disabled={loadingOrg}
                    className={`w-full text-left flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors ${
                      itemTags.includes(tag.id)
                        ? "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300"
                        : "hover:bg-[var(--bg-primary)] dark:hover:bg-[var(--bg-elevated)]"
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: tag.color || '#6b7280' }} />
                    {tag.name}
                    {itemTags.includes(tag.id) && <span className="ml-auto text-xs">✓</span>}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="relative">
          <button
            onClick={() => setShowCatPicker(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[var(--bg-secondary)] dark:bg-[var(--bg-elevated)] hover:bg-[var(--bg-secondary)] dark:hover:bg-zinc-700 rounded-lg transition-colors"
          >
            <Bookmark className="w-3.5 h-3.5" />
            {itemCat ? allCats.find(c => c.id === itemCat)?.name || "分类" : "选择分类"}
          </button>
          {showCatPicker && (
            <div className="absolute z-20 mt-1 w-48 bg-[var(--bg-card)] dark:bg-[var(--bg-card)] border border-[var(--border-subtle)] dark:border-[var(--border-subtle)] rounded-lg shadow-[var(--shadow-lg)] p-2">
              <button
                onClick={() => void setCategory(null)}
                className={`w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-[var(--bg-primary)] dark:hover:bg-[var(--bg-elevated)] ${!itemCat ? "text-indigo-600" : ""}`}
              >
                （无分类）
              </button>
              {allCats.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => void setCategory(cat.id)}
                  className={`w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-[var(--bg-primary)] dark:hover:bg-[var(--bg-elevated)] ${itemCat === cat.id ? "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30" : ""}`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => void toggleFavorite()}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
            favorited
              ? "bg-[var(--warning-soft)] dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
              : "bg-[var(--bg-secondary)] dark:bg-[var(--bg-elevated)] hover:bg-[var(--bg-secondary)] dark:hover:bg-zinc-700"
          }`}
        >
          <Star className={`w-3.5 h-3.5 ${favorited ? "fill-current" : ""}`} />
          {favorited ? "已收藏" : "收藏"}
        </button>

        <div className="flex items-center gap-1 rounded-lg bg-[var(--bg-secondary)] p-1">
          {STUDY_STATUS_OPTIONS.map((option) => {
            const active = (getStringMeta(item, "study_status") || "not_started") === option.value;
            return (
              <button
                key={option.value}
                onClick={() => void setStudyStatus(option.value)}
                disabled={studyUpdating}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "bg-[var(--bg-card)] text-[var(--accent-text)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                {option.value === "completed" && active && <CheckCircle2 className="h-3.5 w-3.5" />}
                {option.label}
              </button>
            );
          })}
        </div>
        {collectionContext && collectionIndex >= 0 && (
          <button
            onClick={() => void handleCompleteAndAdvance()}
            disabled={studyUpdating}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-60 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/45"
          >
            {studyUpdating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {collectionNext ? "学完并下一节" : "学完并结束"}
          </button>
        )}
      </div>

      {(item.content_type === "image" || item.content_type === "pdf" ||
        item.content_type === "video" || item.content_type === "audio") && (
        <div className="mb-6">
          {item.content_type === "image" && item.file_path && (
            <div className="relative group cursor-pointer overflow-hidden rounded-xl border border-[var(--border-subtle)]" onClick={() => setShowImageViewer(true)}>
              <img
                src={`/api/contents/${item.id}/preview?mode=raw`}
                alt={item.title}
                className="max-h-[70vh] w-full object-contain bg-black/5"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/50 text-white text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                  <ZoomIn className="w-4 h-4" />
                  查看大图
                </div>
              </div>
              {showImageViewer && (
                <div className="contents" onClick={(e) => e.stopPropagation()}>
                  <ImageViewer
                    src={`/api/contents/${item.id}/preview?mode=raw`}
                    alt={item.title}
                    onClose={() => setShowImageViewer(false)}
                  />
                </div>
              )}
            </div>
          )}
          {item.content_type === "pdf" && item.file_path && (
            <div className="h-[70vh]">
              <PDFViewer
                src={`/api/contents/${item.id}/preview?mode=raw`}
                filename={item.title}
                initialPage={targetPage}
              />
            </div>
          )}
          {item.content_type === "video" && item.file_path && (
            <VideoPlayer
              src={`/api/contents/${item.id}/preview?mode=raw`}
              subtitles={item.extra_meta?.subtitles}
              initialTime={targetTime}
            />
          )}
          {item.content_type === "audio" && item.file_path && (
            <AudioPlayer
              src={`/api/contents/${item.id}/preview?mode=raw`}
              title={item.title}
              initialTime={targetTime}
            />
          )}
        </div>
      )}

      {item.processing_status === "failed" && item.processing_error && (
        <div className="mb-6 bg-[var(--danger-soft)] dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm font-medium text-red-700 dark:text-red-400 mb-1">处理失败</p>
          <pre className="text-xs text-[var(--danger)] dark:text-red-400 whitespace-pre-wrap overflow-x-auto">
            {item.processing_error.slice(0, 500)}
          </pre>
        </div>
      )}

      {getDocumentStructure(item) && (
        <DocumentStructurePanel structure={getDocumentStructure(item)!} />
      )}

      <div className="bg-[var(--bg-card)] dark:bg-[var(--bg-card)] border border-[var(--border-subtle)] dark:border-[var(--border-subtle)] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)] dark:border-[var(--border-subtle)]">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setContentTab("text")}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${contentTab === "text" ? "bg-[var(--accent-soft)] text-[var(--accent-text)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}
            >
              提取内容
            </button>
            <button
              onClick={() => { setContentTab("chunks"); if (chunks.length === 0) loadChunks(1); }}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${contentTab === "chunks" ? "bg-[var(--accent-soft)] text-[var(--accent-text)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}
            >
              分块预览
            </button>
          </div>
          {contentTab === "text" && !editing ? (
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-[var(--accent-text)] dark:text-[var(--accent-text)] hover:underline"
            >
              编辑
            </button>
          ) : contentTab === "text" && editing ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setEditing(false); setEditText(item.text_content || ""); }}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              >
                取消
              </button>
              <button
                onClick={handleSaveText}
                className="flex items-center gap-1 text-xs bg-[var(--accent)] dark:bg-[var(--bg-secondary)] text-white dark:text-[var(--text-primary)] px-3 py-1 rounded-lg"
              >
                <Save className="w-3 h-3" />
                保存
              </button>
            </div>
          ) : null}
        </div>

        <div className="p-4">
          {contentTab === "text" ? (
            editing ? (
              <textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                className="w-full h-64 p-3 text-sm border border-zinc-300 dark:border-zinc-600 rounded-lg bg-[var(--bg-primary)] dark:bg-[var(--bg-elevated)] text-[var(--text-primary)] dark:text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                placeholder="输入或编辑提取文本..."
              />
            ) : (
              <div className="relative" id="content-text-area">
                <AnnotationToolbar
                  containerSelector="#content-text-area"
                  onSave={async (data) => {
                    if (!id) return;
                    const ann = await annotationApi.create({ content_id: id, ...data });
                    setAnnotations(prev => [...prev, ann]);
                  }}
                />
                <div className="prose dark:prose-invert max-w-none">
                  {item.text_content ? (
                    <div>
                      {item.text_content.length > 2000 && !contentExpanded ? (
                        <>
                          <div className="whitespace-pre-wrap text-sm text-[var(--text-secondary)] dark:text-[var(--text-muted)] font-sans leading-relaxed line-clamp-[20]">
                            {renderTextWithAnnotations(item.text_content.slice(0, 2000), annotations)}
                          </div>
                          <div className="mt-3 text-center">
                            <button
                              onClick={() => setContentExpanded(true)}
                              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-colors"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                              展开全部（{item.text_content.length} 字符）
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="whitespace-pre-wrap text-sm text-[var(--text-secondary)] dark:text-[var(--text-muted)] font-sans leading-relaxed">
                            {renderTextWithAnnotations(item.text_content, annotations)}
                          </div>
                          {item.text_content.length > 2000 && contentExpanded && (
                            <div className="mt-3 text-center">
                              <button
                                onClick={() => setContentExpanded(false)}
                                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-colors"
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                                收起内容
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--text-muted)] italic">
                      暂无文本内容。
                      {item.processing_status !== "completed" && (
                        <button onClick={handleReprocess} className="ml-2 text-[var(--accent-text)] hover:underline">触发处理</button>
                      )}
                    </p>
                  )}
                </div>
              </div>
            )
          ) : (
            <div>
              {loadingChunks ? (
                <div className="text-center py-8 text-[var(--text-muted)]">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />加载中...
                </div>
              ) : chunks.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)] italic text-center py-8">暂无分块数据</p>
              ) : (
                <div>
                  <div className="space-y-2 mb-4">
                    <p className="text-xs text-[var(--text-muted)] mb-3">
                      共 {chunksTotal} 个分块 · 第 {chunksPage}/{Math.ceil(chunksTotal / chunksPageSize)} 页
                    </p>
                    {chunks.map((c) => (
                      <div key={c.id} className="border border-[var(--border-subtle)] rounded-lg p-3 hover:border-[var(--accent)]/30 transition-colors">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono text-[var(--text-muted)]">#{c.chunk_index}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-muted)]">{c.chunk_type}</span>
                          {c.page_number != null && (
                            <span className="text-xs text-[var(--accent-text)]">第 {c.page_number} 页</span>
                          )}
                          {c.time_start != null && (
                            <span className="text-xs text-purple-500">{Math.floor(c.time_start / 60)}:{String(Math.floor(c.time_start % 60)).padStart(2, "0")}</span>
                          )}
                          {c.has_embedding && (
                            <span className="text-xs text-emerald-500">已向量化</span>
                          )}
                        </div>
                        {c.chunk_text && (
                          <p className="text-xs text-[var(--text-secondary)] line-clamp-3 leading-relaxed">{c.chunk_text.slice(0, 300)}</p>
                        )}
                        {c.image_path && (
                          <div className="mt-2 flex items-start gap-3">
                            <img
                              src={storageFileUrl(c.image_path)}
                              alt={`分块 #${c.chunk_index}`}
                              loading="lazy"
                              className="h-24 w-40 rounded-md border border-[var(--border-subtle)] object-cover bg-[var(--bg-secondary)]"
                            />
                            <div className="min-w-0 pt-1">
                              <p className="text-xs font-medium text-[var(--text-secondary)]">关键帧截图</p>
                              <p className="mt-1 break-all text-xs text-[var(--text-muted)]">{c.image_path}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  
                  {chunksTotal > chunksPageSize && (
                    <div className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)]">
                      <button
                        onClick={() => loadChunks(chunksPage - 1)}
                        disabled={chunksPage <= 1}
                        className="px-3 py-1.5 text-xs text-[var(--text-secondary)] disabled:text-[var(--text-muted)] disabled:opacity-50 hover:bg-[var(--bg-secondary)] rounded-lg transition-colors"
                      >
                        上一页
                      </button>
                      <span className="text-xs text-[var(--text-muted)]">
                        第 {chunksPage} / {Math.ceil(chunksTotal / chunksPageSize)} 页
                      </span>
                      <button
                        onClick={() => loadChunks(chunksPage + 1)}
                        disabled={chunksPage >= Math.ceil(chunksTotal / chunksPageSize)}
                        className="px-3 py-1.5 text-xs text-[var(--text-secondary)] disabled:text-[var(--text-muted)] disabled:opacity-50 hover:bg-[var(--bg-secondary)] rounded-lg transition-colors"
                      >
                        下一页
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showGraphPanel && (
        <div className="mt-6">
          <KnowledgeGraph
            contentId={item.id}
            contentTitle={item.title}
            contentType={item.content_type}
          />
        </div>
      )}

      {showAnnotationPanel && (
        <AnnotationPanel
          annotations={annotations}
          loading={loadingAnnotations}
          onLocate={handleLocateAnnotation}
          onDelete={handleDeleteAnnotation}
          onClose={() => setShowAnnotationPanel(false)}
        />
      )}
        </div>
      </div>

      {showAiPanel && (
        <div className="w-96 border-l border-[var(--border-subtle)] bg-[var(--bg-card)] dark:bg-[var(--bg-elevated)] overflow-y-auto flex flex-col h-screen">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)] dark:bg-[var(--bg-elevated)]/50 shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              <h2 className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">AI 助手</h2>
            </div>
            <button onClick={() => setShowAiPanel(false)} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] p-1 rounded-lg hover:bg-[var(--bg-secondary)]">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-4 flex-1 overflow-y-auto">
            {!item.text_content && !item.title && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-300">
                <p>⚠️ 当前内容暂无文本数据</p>
                <p className="text-xs mt-1 opacity-80">部分 AI 功能需要文本内容才能使用</p>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <button
                  onClick={() => handleSummarize(false)}
                  disabled={summarizing}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-medium hover:bg-indigo-200 dark:hover:bg-indigo-900/50 disabled:opacity-50 transition-colors"
                >
                  {summarizing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  {summarizing ? "生成中..." : summary ? "重新生成" : "生成摘要"}
                </button>
                {summary && (
                  <button
                    onClick={() => handleSummarize(true)}
                    className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] rounded-lg"
                    title="重新生成"
                  >
                    <RefreshIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {summarizing ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
                </div>
              ) : summary ? (
                <div className="bg-[var(--bg-primary)] dark:bg-[var(--bg-elevated)] rounded-lg p-3 text-sm text-[var(--text-secondary)] dark:text-[var(--text-muted)] leading-relaxed">
                  {summary}
                </div>
              ) : (
                <div className="text-center py-6 text-sm text-[var(--text-muted)]">
                  点击上方按钮生成摘要
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <button
                  onClick={() => handleRelated(false)}
                  disabled={loadingRelated || (!item.embedding && (!statusInfo || statusInfo.embedded_chunks === 0))}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg text-xs font-medium hover:bg-purple-200 dark:hover:bg-purple-900/50 disabled:opacity-50 transition-colors"
                  title={(!item.embedding && (!statusInfo || statusInfo.embedded_chunks === 0)) ? "需要先生成嵌入向量" : ""}
                >
                  {loadingRelated ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />}
                  {loadingRelated ? "加载中..." : relatedItems ? "重新搜索" : "相关内容"}
                </button>
                {relatedItems && (
                  <button
                    onClick={() => handleRelated(true)}
                    className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] rounded-lg"
                    title="重新搜索"
                  >
                    <RefreshIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {loadingRelated ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
                </div>
              ) : relatedItems && relatedItems.length > 0 ? (
                <div className="space-y-1">
                  {relatedItems.map(r => (
                    <Link
                      key={r.id}
                      to={`/contents/${r.id}`}
                      className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-primary)] dark:bg-[var(--bg-elevated)] rounded-lg hover:bg-[var(--bg-secondary)] dark:hover:bg-zinc-700 transition-colors text-sm"
                    >
                      <span className="text-[var(--text-secondary)] dark:text-[var(--text-muted)] truncate flex-1">{r.title}</span>
                      <div className="flex flex-col items-end">
                        {r.relation_type && (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400">
                            {r.relation_type === "series" ? "系列" : r.relation_type === "reference" ? "引用" : "相似"}
                          </span>
                        )}
                        <span className="text-xs text-[var(--text-muted)]">{r.content_type} · {Math.round(r.similarity * 100)}%</span>
                        {r.matched_chunk?.page_number && (
                          <span className="text-xs text-blue-500">第{r.matched_chunk.page_number}页</span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : relatedItems ? (
                <div className="text-center py-6 text-sm text-[var(--text-muted)]">
                  {(!item.embedding && (!statusInfo || statusInfo.embedded_chunks === 0)) ? "请先生成嵌入向量" : "暂无相关内容"}
                </div>
              ) : (
                <div className="text-center py-6 text-sm text-[var(--text-muted)]">
                  点击上方按钮搜索相关内容
                </div>
              )}
            </div>

            {/* 问本篇 */}
            <div className="bg-[var(--bg-secondary)] dark:bg-[var(--bg-elevated)] rounded-lg p-3">
              <h3 className="text-xs font-medium text-[var(--text-primary)] mb-2 flex items-center gap-1.5">
                <MessageCircle className="w-3.5 h-3.5 text-jade" />
                <div className="flex items-center justify-between w-full">
                  <span>问本篇</span>
                  <button
                    onClick={() => setShowQaPromptEditor(true)}
                    className="text-[var(--text-muted)] hover:text-jade p-0.5 rounded transition-colors"
                    title="编辑问答 Prompt"
                  >
                    <Settings2 className="w-3 h-3" />
                  </button>
                </div>
              </h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={qaQuestion}
                  onChange={(e) => setQaQuestion(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAskQuick(); }}
                  placeholder="针对本篇内容提问..."
                  className="flex-1 px-2.5 py-1.5 text-xs border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-jade"
                />
                <button
                  onClick={handleAskQuick}
                  disabled={qaAsking || !qaQuestion.trim()}
                  className="px-3 py-1.5 bg-jade/20 text-jade rounded-lg text-xs font-medium hover:bg-jade/30 disabled:opacity-50 transition-colors"
                >
                  {qaAsking ? <Loader2 className="w-3 h-3 animate-spin" /> : "提问"}
                </button>
              </div>
              {qaAnswer && (
                <div className="mt-3 p-2 rounded bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{qaAnswer}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={handleSaveQaToNote}
                      disabled={qaSavingNote}
                      className="flex items-center gap-1 px-2.5 py-1 bg-[var(--bg-secondary)] text-[var(--text-secondary)] rounded text-[10px] font-medium hover:bg-[var(--accent-soft)] hover:text-[var(--accent-text)] transition-colors disabled:opacity-50"
                    >
                      {qaSavingNote ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                      {qaSavingNote ? "保存中..." : "添加到笔记"}
                    </button>
                  {qaSources.length > 0 && (
                    <p className="text-[10px] text-[var(--text-muted)] mt-1">
                      引用 {qaSources.length} 个来源
                    </p>
                  )}
                </div>
              </div>
              )}
            </div>

            <div>
              <QuizGenerator
                scopeType="content"
                scopeId={id || ""}
                scopeName={item?.title || "当前道藏"}
                embedded
              />
              <div className="flex items-center justify-end mt-2">
                <button
                  onClick={() => setShowPromptEditor(true)}
                  className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] rounded-lg"
                  title="编辑出题 Prompt"
                >
                  <FileText className="w-3.5 h-3.5" />
                </button>
              </div>
              {showPromptEditor && <PromptEditor onClose={() => setShowPromptEditor(false)} />}
              {showQaPromptEditor && <PromptEditor templateType="qa" onClose={() => setShowQaPromptEditor(false)} />}
            </div>
          </div>
        </div>
      )}
      
      {showScrollButtons && (
        <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-[9999]">
          <button
            onClick={scrollToTop}
            className="p-3 rounded-full bg-[var(--bg-card)] dark:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] shadow-[var(--shadow-lg)] hover:bg-[var(--bg-secondary)] transition-colors"
            title="回到顶部"
          >
            <ArrowUp className="w-5 h-5 text-[var(--text-secondary)]" />
          </button>
          <button
            onClick={scrollToBottom}
            className="p-3 rounded-full bg-[var(--bg-card)] dark:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] shadow-[var(--shadow-lg)] hover:bg-[var(--bg-secondary)] transition-colors"
            title="滚动到底部"
          >
            <ArrowDown className="w-5 h-5 text-[var(--text-secondary)]" />
          </button>
        </div>
      )}

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="删除内容"
        message={`确定要将「${item.title}」归入归墟吗？此操作将一并清除相关向量记录。`}
        confirmLabel="确认删除"
        cancelLabel="取消"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => { if (!deleting) setDeleteConfirmOpen(false); }}
      />
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}
