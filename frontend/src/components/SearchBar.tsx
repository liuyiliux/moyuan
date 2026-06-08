import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  Clock,
  File,
  FileAudio,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Globe,
  Image,
  Loader2,
  Search,
} from "lucide-react";
import { searchApi, type SearchHistoryItem, type SearchResultItem } from "../api/search";
import { useBrain } from "../lib/brain-context";

const TYPE_LABELS: Record<string, string> = {
  note: "笔记",
  image: "图片",
  video: "视频",
  audio: "音频",
  pdf: "PDF",
  doc: "文档",
  web: "网页",
  other: "其他",
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  note: <FileText className="w-4 h-4 text-[var(--accent-text)]" />,
  image: <Image className="w-4 h-4 text-[var(--success)]" />,
  video: <FileVideo className="w-4 h-4 text-purple-500" />,
  audio: <FileAudio className="w-4 h-4 text-orange-500" />,
  pdf: <FileText className="w-4 h-4 text-[var(--danger)]" />,
  doc: <FileSpreadsheet className="w-4 h-4 text-indigo-500" />,
  web: <Globe className="w-4 h-4 text-cyan-500" />,
};

function buildContentUrl(result: SearchResultItem): string {
  const params = new URLSearchParams();
  if (result.best_chunk.page_number != null) params.set("page", String(result.best_chunk.page_number));
  if (result.best_chunk.time_start != null) params.set("t", String(result.best_chunk.time_start));
  const suffix = params.toString();
  return `/contents/${result.content_id}${suffix ? `?${suffix}` : ""}`;
}

function normalizeSnippet(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export default function SearchBar() {
  const { currentBrainId } = useBrain();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const requestSeq = useRef(0);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setResults([]);
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 50);

    searchApi
      .getHistory({ page: 1, page_size: 5, brain_id: currentBrainId || undefined })
      .then((data) => setHistory(data.items))
      .catch(() => setHistory([]));
  }, [open, currentBrainId]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const query = q.trim();
    if (!query) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    const currentSeq = ++requestSeq.current;

    debounceRef.current = setTimeout(async () => {
      try {
        const data = await searchApi.search({ query, top_k: 5, brain_id: currentBrainId || undefined });
        if (currentSeq === requestSeq.current) {
          setResults(data.results);
          setError(null);
        }
      } catch (err) {
        if (currentSeq === requestSeq.current) {
          setResults([]);
          setError((err as Error).message || "搜索失败");
        }
      } finally {
        if (currentSeq === requestSeq.current) setLoading(false);
      }
    }, 220);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, currentBrainId]);

  function goSearch(query = q.trim()) {
    if (!query) return;
    setOpen(false);
    navigate(`/search?q=${encodeURIComponent(query)}`);
  }

  function goContent(result: SearchResultItem) {
    setOpen(false);
    navigate(buildContentUrl(result));
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") goSearch();
  }

  if (!open) return null;

  const showHistory = !q.trim() && history.length > 0;
  const showEmpty = q.trim() && !loading && !error && results.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-2xl">
        <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
          <Search className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="搜索知识库内容..."
            className="min-w-0 flex-1 bg-transparent text-lg text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-[var(--text-muted)]" />
          ) : (
            <kbd className="hidden rounded bg-[var(--bg-secondary)] px-2 py-0.5 font-mono text-xs text-[var(--text-muted)] sm:inline-flex">
              Enter
            </kbd>
          )}
        </div>

        <div className="px-5 py-3 text-xs text-[var(--text-muted)]">
          输入关键词实时预览结果，按 Enter 查看完整搜索页
        </div>

        {error && (
          <div className="mx-5 mb-3 rounded-lg border border-[var(--danger)]/20 bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
            {error}
          </div>
        )}

        {results.length > 0 && (
          <div className="border-t border-[var(--border-subtle)] px-2 py-2">
            <p className="px-3 py-1 text-xs text-[var(--text-muted)]">实时结果</p>
            {results.map((result) => {
              const snippet = normalizeSnippet(result.best_chunk.snippet || "");
              return (
                <button
                  key={result.content_id}
                  onClick={() => goContent(result)}
                  className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-secondary)]"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-secondary)]">
                    {TYPE_ICONS[result.content_type] ?? <File className="h-4 w-4 text-[var(--text-muted)]" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-[var(--text-primary)]">{result.title}</span>
                      <span className="shrink-0 text-xs text-[var(--text-muted)]">
                        {TYPE_LABELS[result.content_type] ?? result.content_type}
                      </span>
                    </span>
                    {snippet && (
                      <span className="mt-1 block line-clamp-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                        {snippet}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-[var(--text-muted)]">{result.match_count} 处</span>
                </button>
              );
            })}
          </div>
        )}

        {showHistory && (
          <div className="border-t border-[var(--border-subtle)] px-2 py-2">
            <p className="px-3 py-1 text-xs text-[var(--text-muted)]">搜索历史</p>
            {history.map((item) => (
              <button
                key={item.id}
                onClick={() => goSearch(item.query)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Clock className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                  <span className="truncate">{item.query}</span>
                </span>
                <span className="shrink-0 text-xs text-[var(--text-muted)]">{item.result_count} 条</span>
              </button>
            ))}
          </div>
        )}

        {showEmpty && (
          <div className="border-t border-[var(--border-subtle)] px-5 py-8 text-center text-sm text-[var(--text-muted)]">
            没有找到实时结果，按 Enter 可进入完整搜索页继续尝试
          </div>
        )}
      </div>
    </div>
  );
}
