import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { searchApi, type SearchResultItem, type ChunkInfo } from "../../api/search";
import {
  Search, FileText, FileAudio, FileVideo, Image, FileSpreadsheet,
  File, Globe, Loader2, Clock, Trash2, SlidersHorizontal, X,
  Sparkles, ChevronDown, ChevronUp, MapPin, Play,
} from "lucide-react";
import { Button, Card } from "../../components";
import { searchCopy, useCopy } from "../../lib/copywriting";

const TYPE_LABELS: Record<string, string> = {
  note: "墨宝", image: "图录", video: "影集", audio: "音箓",
  pdf: "经卷", doc: "典籍", web: "云游", other: "杂项",
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

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function highlightSnippet(snippet: string, q: string): React.ReactNode {
  if (!q || !snippet) return snippet;
  const idx = snippet.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return snippet;
  return (
    <>
      {snippet.slice(0, idx)}
      <mark className="bg-yellow-200 dark:bg-yellow-800/60 text-yellow-900 dark:text-yellow-200 rounded px-0.5">
        {snippet.slice(idx, idx + q.length)}
      </mark>
      {snippet.slice(idx + q.length)}
    </>
  );
}

function ChunkPositionBadge({ chunk }: { chunk: ChunkInfo }) {
  if (chunk.page_number != null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-jade bg-jade/10 px-2 py-0.5 rounded-full">
        <MapPin className="w-3 h-3" />
        第 {chunk.page_number} 页
      </span>
    );
  }
  if (chunk.time_start != null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-purple-500 bg-purple-500/10 px-2 py-0.5 rounded-full">
        <Play className="w-3 h-3" />
        {formatTime(chunk.time_start)}
      </span>
    );
  }
  return null;
}

function buildContentUrl(r: SearchResultItem): string {
  let url = `/contents/${r.content_id}`;
  const params = new URLSearchParams();
  if (r.best_chunk.page_number != null) {
    params.set("page", String(r.best_chunk.page_number));
  }
  if (r.best_chunk.time_start != null) {
    params.set("t", String(r.best_chunk.time_start));
  }
  const qs = params.toString();
  if (qs) url += `?${qs}`;
  return url;
}

export default function SearchPage() {
  const st = useCopy(searchCopy);
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [activeQuery, setActiveQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [contentType, setContentType] = useState<string>("all");
  const [enableVector, setEnableVector] = useState(true);
  const [enableKeyword, setEnableKeyword] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<{ id: string; query: string; result_count: number; created_at: string }[]>([]);
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  async function doSearch(q: string) {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setActiveQuery(q);
    try {
      const res = await searchApi.search({
        query: q,
        content_type: contentType === "all" ? undefined : contentType,
        enable_vector: enableVector,
        enable_keyword: enableKeyword,
        top_k: 20,
      });
      setResults(res.results);
      setExpandedDocs(new Set());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    doSearch(query);
  }

  function toggleExpand(contentId: string) {
    setExpandedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(contentId)) next.delete(contentId);
      else next.add(contentId);
      return next;
    });
  }

  async function loadHistory() {
    try {
      const res = await searchApi.getHistory({ page: 1, page_size: 20 });
      setHistory(res.items);
    } catch { /* ignore */ }
  }

  useEffect(() => { if (showHistory) loadHistory(); }, [showHistory]);
  useEffect(() => {
    const q = searchParams.get("q");
    if (q?.trim()) { setQuery(q); doSearch(q); }
  }, [searchParams]);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-serif font-semibold text-text-primary mb-2">{st.title}</h1>
        <p className="text-sm text-text-muted">{st.subtitle}</p>
      </div>

      <form onSubmit={handleSubmit} className="mb-8">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={st.placeholder}
              className="dao-input pl-11 pr-12 py-3 text-base"
              autoFocus
            />
            {query && (
              <button type="button" onClick={() => { setQuery(""); setActiveQuery(""); setResults([]); inputRef.current?.focus(); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <Button type="submit" disabled={loading || !query.trim()} className="px-6">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Sparkles className="w-4 h-4" /> {st.btnSearch}</>}
          </Button>
          <Button variant="secondary" onClick={() => setShowFilters(!showFilters)}>
            <SlidersHorizontal className="w-4 h-4" />
          </Button>
          <Button variant="secondary" onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadHistory(); }}>
            <Clock className="w-4 h-4" />
          </Button>
        </div>

        {showFilters && (
          <Card className="mt-4 p-4">
            <div className="space-y-3">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-sm font-medium text-text-secondary">{st.filterCategory}</span>
                {["all", "note", "pdf", "image", "video", "audio", "doc", "web"].map((t) => (
                  <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name="ctype" checked={contentType === t} onChange={() => setContentType(t)} className="accent-jade" />
                    <span className="text-sm">{t === "all" ? st.filterAll : TYPE_LABELS[t] ?? t}</span>
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-text-secondary">
                  <input type="checkbox" checked={enableVector} onChange={(e) => setEnableVector(e.target.checked)} className="accent-jade" />
                  <Sparkles className="w-3.5 h-3.5" /> {st.filterVector}
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-text-secondary">
                  <input type="checkbox" checked={enableKeyword} onChange={(e) => setEnableKeyword(e.target.checked)} className="accent-jade" />
                  {st.filterKeyword}
                </label>
              </div>
            </div>
          </Card>
        )}
      </form>

      {showHistory && (
        <Card className="mb-6 p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-3">{st.historyTitle}</h3>
          {history.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-4">{st.historyEmpty}</p>
          ) : (
            <ul className="space-y-2">
              {history.map((h) => (
                <li key={h.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-bg-secondary transition-colors group">
                  <Clock className="w-4 h-4 text-text-muted shrink-0" />
                  <button onClick={() => { setQuery(h.query); doSearch(h.query); setShowHistory(false); }}
                    className="flex-1 text-left text-sm text-text-secondary truncate hover:text-jade">{h.query}</button>
                  <span className="text-xs text-text-muted shrink-0">{h.result_count} 道</span>
                  <button onClick={async () => { await searchApi.deleteHistory(h.id); loadHistory(); }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-danger transition-all">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {error && (
        <div className="mb-4 p-4 bg-danger-soft border border-danger/20 rounded-lg text-sm text-danger">
          {st.errorPrefix}{error}
        </div>
      )}

      {activeQuery && !loading && (
        <p className="text-sm text-text-muted mb-4">
          {st.resultCount(results.length)}
        </p>
      )}

      <div className="space-y-3">
        {results.map((r) => {
          const isExpanded = expandedDocs.has(r.content_id);
          const hasMultipleChunks = r.match_count > 1;

          return (
            <Card key={r.content_id} className="p-4 hover:border-jade/50 transition-all">
              <div className="flex items-start gap-3">
                <div className="shrink-0 mt-0.5 p-2 rounded-lg bg-bg-secondary">
                  {TYPE_ICONS[r.content_type] ?? <File className="w-4 h-4 text-text-muted" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-text-primary truncate">
                      <a href={buildContentUrl(r)} className="hover:text-jade transition-colors">{r.title}</a>
                    </h3>
                    <ChunkPositionBadge chunk={r.best_chunk} />
                  </div>

                  {r.best_chunk.snippet && (
                    <p className="mt-1 text-xs text-text-secondary line-clamp-2 leading-relaxed">
                      {highlightSnippet(r.best_chunk.snippet, activeQuery)}
                    </p>
                  )}

                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-text-muted">{TYPE_LABELS[r.content_type] ?? r.content_type}</span>
                    <span className="text-xs text-jade">{st.scoreLabel(Math.round(r.score * 100))}</span>
                    {hasMultipleChunks && (
                      <button onClick={() => toggleExpand(r.content_id)}
                        className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-jade transition-colors">
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        {r.match_count} 处命中
                      </button>
                    )}
                  </div>

                  {isExpanded && r.all_chunks.length > 1 && (
                    <div className="mt-3 pl-3 border-l-2 border-jade/20 space-y-2">
                      {r.all_chunks.slice(1).map((c, i) => (
                        <a key={c.chunk_id || i} href={buildContentUrl({ ...r, best_chunk: c })} className="block group/chunk">
                          <div className="flex items-center gap-2">
                            <ChunkPositionBadge chunk={c} />
                            {c.score != null && (
                              <span className="text-xs text-text-muted">{Math.round(c.score * 100)}%</span>
                            )}
                          </div>
                          {c.snippet && (
                            <p className="mt-0.5 text-xs text-text-secondary line-clamp-1 group-hover/chunk:text-jade transition-colors">
                              {highlightSnippet(c.snippet, activeQuery)}
                            </p>
                          )}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {!activeQuery && !loading && !showHistory && (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-accent-soft mb-6">
            <Search className="w-8 h-8 text-jade/60" />
          </div>
          <p className="text-sm text-text-secondary mb-2">{st.emptyHint}</p>
          <p className="text-xs text-text-muted">{st.emptyHint2}</p>
        </div>
      )}
    </div>
  );
}
