import { useState, useEffect, useRef } from "react";
import { fileApi, type FileItem } from "../api/content";
import { Search, Loader2, X, Plus } from "lucide-react";
import { useBrain } from "../lib/brain-context";

interface Props {
  onSelect: (contentId: string, title: string) => void;
  onClose: () => void;
  brainId?: string | null;
  excludeIds?: string[];
}

export default function ContentPicker({ onSelect, onClose, brainId, excludeIds = [] }: Props) {
  const { currentBrainId } = useBrain();
  const effectiveBrainId = brainId === undefined ? currentBrainId : brainId;
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const requestSeq = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadItems(search);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [effectiveBrainId, search]);

  async function loadItems(keyword = "") {
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    setLoading(true);
    try {
      const query = keyword.trim();
      const res = await fileApi.list({
        page: 1,
        page_size: 100,
        brain_id: effectiveBrainId || undefined,
        q: query || undefined,
      });
      if (seq !== requestSeq.current) return;
      setItems(res.items || []);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }

  const excluded = new Set(excludeIds);
  const availableItems = items.filter((item) => !excluded.has(item.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[70vh] bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">选择内容</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-[var(--border-subtle)]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="搜索内容..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="dao-input pl-10"
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
            </div>
          ) : availableItems.length === 0 ? (
            <div className="text-center py-12 text-sm text-[var(--text-muted)]">
              {search.trim() ? "没有匹配的内容" : items.length > 0 ? "可添加内容都已在合集里" : "暂无内容"}
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {availableItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => { onSelect(item.id, item.title); onClose(); }}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">{item.title}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">{item.content_type}</p>
                  </div>
                  <Plus className="w-4 h-4 text-[var(--accent-text)] flex-shrink-0 ml-3" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
