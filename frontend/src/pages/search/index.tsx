import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { searchApi, type SearchResultItem } from "../../api/search";
import {
  Search,
  FileText,
  FileAudio,
  FileVideo,
  Image,
  FileSpreadsheet,
  File,
  Globe,
  Loader2,
  Clock,
  Trash2,
  SlidersHorizontal,
  X,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button, Card } from "../../components";

const TYPE_LABELS: Record<string, string> = {
  note: "墨宝",
  image: "图录",
  video: "影集",
  audio: "音箓",
  pdf: "经卷",
  doc: "典籍",
  web: "云游",
  other: "杂项",
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

export default function SearchPage() {
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
  const [history, setHistory] = useState<
    { id: string; query: string; result_count: number; created_at: string }[]
  >([]);
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

  async function loadHistory() {
    try {
      const res = await searchApi.getHistory({ page: 1, page_size: 20 });
      setHistory(res.items);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (showHistory) loadHistory();
  }, [showHistory]);

  useEffect(() => {
    const q = searchParams.get("q");
    if (q?.trim()) {
      setQuery(q);
      doSearch(q);
    }
  }, [searchParams]);

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

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-serif font-semibold text-text-primary mb-2">
          问玄
        </h1>
        <p className="text-sm text-text-muted">
          以符纹探知道藏，以气机感应万物
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mb-8">
        <div className="relative">
          <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center">
            <svg viewBox="0 0 32 32" className="w-6 h-6 text-jade/30">
              <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="1" />
              <path d="M16 2 A14 14 0 0 1 16 30 A7 7 0 0 1 16 16 A7 7 0 0 0 16 2" fill="currentColor" opacity="0.3"/>
              <circle cx="16" cy="16" r="3" fill="currentColor" opacity="0.5"/>
              <path d="M16 0 L16 32 M0 16 L32 16" stroke="currentColor" strokeWidth="0.5" opacity="0.3"/>
              <path d="M4 4 L28 28 M28 4 L4 28" stroke="currentColor" strokeWidth="0.5" opacity="0.3"/>
            </svg>
          </div>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="输入符纹，探寻道藏..."
                className="dao-input pl-11 pr-12 py-3 text-base"
                autoFocus
              />
              {query && (
                <button
                  type="button"
                  onClick={() => { setQuery(""); setActiveQuery(""); setResults([]); inputRef.current?.focus(); }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <Button 
              type="submit"
              disabled={loading || !query.trim()}
              className="px-6"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Sparkles className="w-4 h-4" /> 悟道</>}
            </Button>
            <Button 
              variant="secondary"
              onClick={() => setShowFilters(!showFilters)}
            >
              <SlidersHorizontal className="w-4 h-4" />
            </Button>
            <Button 
              variant="secondary"
              onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadHistory(); }}
            >
              <Clock className="w-4 h-4" />
            </Button>
          </div>
          <div className="absolute -right-4 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center">
            <svg viewBox="0 0 32 32" className="w-6 h-6 text-gold/30 transform rotate-90">
              <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="1" />
              <path d="M16 2 A14 14 0 0 0 16 30 A7 7 0 0 0 16 16 A7 7 0 0 1 16 2" fill="currentColor" opacity="0.3"/>
              <circle cx="16" cy="16" r="3" fill="currentColor" opacity="0.5"/>
              <path d="M16 0 L16 32 M0 16 L32 16" stroke="currentColor" strokeWidth="0.5" opacity="0.3"/>
              <path d="M4 4 L28 28 M28 4 L4 28" stroke="currentColor" strokeWidth="0.5" opacity="0.3"/>
            </svg>
          </div>
        </div>

        {showFilters && (
          <Card className="mt-4 p-4">
            <div className="space-y-3">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-sm font-medium text-text-secondary">品类：</span>
                {["all", "note", "pdf", "image", "video", "audio", "doc", "web"].map((t) => (
                  <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="ctype"
                      checked={contentType === t}
                      onChange={() => setContentType(t)}
                      className="accent-jade"
                    />
                    <span className="text-sm">{t === "all" ? "万象" : TYPE_LABELS[t] ?? t}</span>
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={enableVector}
                    onChange={(e) => setEnableVector(e.target.checked)}
                    className="accent-jade"
                  />
                  <Sparkles className="w-3.5 h-3.5" />
                  气机感应
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={enableKeyword}
                    onChange={(e) => setEnableKeyword(e.target.checked)}
                    className="accent-jade"
                  />
                  符纹匹配
                </label>
              </div>
            </div>
          </Card>
        )}
      </form>

      {showHistory && (
        <Card className="mb-6 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-primary">探知记录</h3>
          </div>
          {history.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-4">尚无探知记录</p>
          ) : (
            <ul className="space-y-2">
              {history.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-bg-secondary transition-colors group"
                >
                  <Clock className="w-4 h-4 text-text-muted shrink-0" />
                  <button
                    onClick={() => { setQuery(h.query); doSearch(h.query); setShowHistory(false); }}
                    className="flex-1 text-left text-sm text-text-secondary truncate hover:text-jade"
                  >
                    {h.query}
                  </button>
                  <span className="text-xs text-text-muted shrink-0">{h.result_count} 道</span>
                  <button
                    onClick={async () => {
                      await searchApi.deleteHistory(h.id);
                      loadHistory();
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-danger transition-all"
                  >
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
          气机紊乱：{error}
        </div>
      )}

      {activeQuery && !loading && (
        <p className="text-sm text-text-muted mb-4">
          探得 <span className="font-semibold text-text-primary">{results.length}</span> 道玄机
          {results.length > 0 && (
            <span className="text-xs text-text-muted ml-2">
              （契合度最高 {Math.round(results[0]?.score * 100)}%）
            </span>
          )}
        </p>
      )}

      <div className="space-y-3">
        {results.map((r) => (
          <Link
            key={r.id}
            to={`/contents/${r.id}`}
            className="block group"
          >
            <Card className="p-4 hover:border-jade/50 transition-all">
              <div className="flex items-start gap-3">
                <div className="shrink-0 mt-0.5 p-2 rounded-lg bg-bg-secondary group-hover:bg-accent-soft transition-colors">
                  {TYPE_ICONS[r.content_type] ?? <File className="w-4 h-4 text-text-muted" />}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-text-primary truncate group-hover:text-jade transition-colors">
                    {r.title}
                  </h3>
                  {r.snippet && (
                    <p className="mt-1 text-xs text-text-secondary line-clamp-2 leading-relaxed">
                      {highlightSnippet(r.snippet, activeQuery)}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-text-muted">{TYPE_LABELS[r.content_type] ?? r.content_type}</span>
                    {r.score !== undefined && (
                      <span className="text-xs text-jade">
                        契合度 {Math.round(r.score * 100)}%
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {!activeQuery && !loading && !showHistory && (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-accent-soft mb-6">
            <Search className="w-8 h-8 text-jade/60" />
          </div>
          <p className="text-sm text-text-secondary mb-2">输入符纹，开启探玄之旅</p>
          <p className="text-xs text-text-muted">支持气机感应与符纹匹配</p>
        </div>
      )}
    </div>
  );
}
