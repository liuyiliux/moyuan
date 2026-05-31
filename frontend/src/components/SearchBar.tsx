import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";

export default function SearchBar() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<{ query: string; count: number }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const navigate = useNavigate();

  // Debounced search for suggestions
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setSuggestions([]); return; }

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/search/history");
        const data = await res.json();
        // 简单提取不重复的历史查询
        const seen = new Set<string>();
        const unique: { query: string; count: number }[] = [];
        for (const item of data.items || []) {
          if (!seen.has(item.query) && unique.length < 5) {
            seen.add(item.query);
            unique.push({ query: item.query, count: item.result_count });
          }
        }
        setSuggestions(unique);
      } catch { setSuggestions([]); }
    }, 200);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q]);

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && q.trim()) {
      setOpen(false);
      navigate(`/search?q=${encodeURIComponent(q.trim())}`);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-xl bg-[var(--bg-card)] dark:bg-[var(--bg-card)] rounded-2xl shadow-2xl border border-[var(--border-subtle)] dark:border-[var(--border-subtle)] overflow-hidden">
        {/* 搜索框 */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border-subtle)] dark:border-[var(--border-subtle)]">
          <Search className="w-5 h-5 text-[var(--text-muted)] flex-shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="搜索知识库内容..."
            className="flex-1 bg-transparent text-[var(--text-primary)] dark:text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none text-lg"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-[var(--bg-secondary)] dark:bg-[var(--bg-elevated)] text-[var(--text-muted)] rounded font-mono">
            <span className="text-base leading-none">↵</span> 搜索
          </kbd>
        </div>

        {/* 提示 */}
        <div className="px-5 py-3 text-xs text-[var(--text-muted)]">
          输入关键词后按 Enter 搜索 · 支持语义搜索和关键词匹配
        </div>

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="px-2 py-2 border-t border-[var(--border-subtle)] dark:border-[var(--border-subtle)]">
            <p className="px-3 py-1 text-xs text-[var(--text-muted)]">搜索历史</p>
            {suggestions.map((s) => (
              <button
                key={s.query}
                onClick={() => { setOpen(false); navigate(`/search?q=${encodeURIComponent(s.query)}`); }}
                className="w-full text-left px-3 py-2 text-sm text-[var(--text-secondary)] dark:text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] dark:hover:bg-[var(--bg-elevated)] rounded-lg transition-colors flex items-center justify-between"
              >
                <span>{s.query}</span>
                <span className="text-xs text-[var(--text-muted)]">{s.count} 条结果</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
