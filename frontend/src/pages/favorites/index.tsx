import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { collectionApi } from "../../api/organization";
import type { Collection, CollectionItem } from "../../api/organization";
import { Plus, Trash2, X, Loader2, Bookmark, FolderOpen } from "lucide-react";
import ConfirmDialog from "../../components/ConfirmDialog";
import Toast from "../../components/Toast";

export default function FavoritesPage() {
  const navigate = useNavigate();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeCol, setActiveCol] = useState<Collection | null>(null);
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteColTarget, setDeleteColTarget] = useState<Collection | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const loadCols = async () => {
    setLoading(true);
    try {
      const data = await collectionApi.list(1, 100);
      setCollections(data);
      if (data.length > 0 && !activeCol) {
        void loadItems(data[0]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadCols(); }, []);

  const loadItems = async (col: Collection) => {
    setActiveCol(col);
    setItemsLoading(true);
    try {
      const resp = await collectionApi.get(col.id);
      setItems(resp.items);
    } finally {
      setItemsLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await collectionApi.create(newName.trim(), newDesc.trim() || undefined);
      setNewName("");
      setNewDesc("");
      setShowNew(false);
      setToast({ type: "success", message: "收藏夹创建成功" });
      await loadCols();
    } catch (err: any) {
      setToast({ type: "error", message: err.response?.data?.detail || "创建失败" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCol = async () => {
    if (!deleteColTarget) return;
    try {
      await collectionApi.delete(deleteColTarget.id);
      if (activeCol?.id === deleteColTarget.id) setActiveCol(null);
      setToast({ type: "success", message: `收藏夹「${deleteColTarget.name}」已删除` });
      setDeleteColTarget(null);
      await loadCols();
    } catch {
      setToast({ type: "error", message: "删除失败" });
    }
  };

  const handleRemoveItem = async (item: CollectionItem) => {
    if (!activeCol) return;
    try {
      await collectionApi.removeItem(activeCol.id, item.content_id);
      setToast({ type: "success", message: "已从收藏夹移除" });
      await loadItems(activeCol);
    } catch {
      setToast({ type: "error", message: "移除失败" });
    }
  };

  return (
    <div className="flex h-[calc(100vh-44px)] overflow-hidden">
      {/* Toast */}
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={deleteColTarget !== null}
        title="删除收藏夹"
        message={`确定要删除收藏夹「${deleteColTarget?.name}」？内容不会被删除。`}
        confirmLabel="删除"
        variant="danger"
        onConfirm={handleDeleteCol}
        onCancel={() => setDeleteColTarget(null)}
      />

      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 overflow-y-auto">
        {showNew && (
          <form onSubmit={handleCreate} className="mb-4 space-y-2 p-3 rounded-lg bg-[var(--accent-soft)]">
            <input
              type="text"
              placeholder="新收藏夹名称"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
              className="taste-input text-sm"
              autoFocus
            />
            <input
              type="text"
              placeholder="描述（可选）"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="taste-input text-sm"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving || !newName.trim()}
                className="taste-btn-primary text-xs flex-1 py-1.5"
              >
                {saving ? "创建中..." : "创建"}
              </button>
              <button
                type="button"
                onClick={() => setShowNew(false)}
                className="taste-btn-secondary text-xs px-3 py-1.5"
              >
                取消
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="text-center py-8 text-sm text-[var(--text-muted)]">
            <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2" />
            加载中...
          </div>
        ) : collections.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-[var(--bg-secondary)] flex items-center justify-center">
              <Bookmark className="w-6 h-6 text-[var(--text-muted)]" />
            </div>
            <p className="text-sm text-[var(--text-muted)] mb-3">暂无收藏夹</p>
            <button
              onClick={() => setShowNew(true)}
              className="taste-btn-primary text-xs px-4 py-1.5"
            >
              <Plus className="w-3 h-3 inline-block mr-1" />
              新建收藏夹
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-[var(--text-muted)]">我的收藏</h3>
              <button
                onClick={() => setShowNew((v) => !v)}
                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--accent-text)] hover:bg-[var(--bg-secondary)] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <ul className="space-y-0.5">
              {collections.map((col) => (
                <li
                  key={col.id}
                  onClick={() => loadItems(col)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
                    activeCol?.id === col.id
                      ? "bg-[var(--accent-soft)] text-[var(--accent-text)]"
                      : "text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
                  }`}
                >
                  <span className="flex-1 truncate">{col.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    activeCol?.id === col.id
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--bg-secondary)] text-[var(--text-muted)]"
                  }`}>
                    {col.item_count}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteColTarget(col); }}
                    className="p-0.5 rounded text-[var(--text-muted)] opacity-0 hover:opacity-100 hover:text-[var(--danger)] transition-all"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Main */}
      <div className="flex-1 overflow-y-auto p-6">
        {!activeCol ? null : itemsLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-[var(--bg-secondary)] flex items-center justify-center">
                <FolderOpen className="w-8 h-8 text-[var(--text-muted)]" />
              </div>
              <p className="text-sm text-[var(--text-muted)]">此收藏夹暂无内容</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">浏览内容时点击收藏即可添加</p>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">{activeCol.name}</h3>
              {activeCol.description && (
                <span className="text-sm text-[var(--text-muted)]">{activeCol.description}</span>
              )}
            </div>
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="taste-card-glow flex items-center justify-between px-4 py-3 group cursor-pointer"
                  onClick={() => navigate(`/contents/${item.content_id}`)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-[var(--text-primary)]">{item.title}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)]">
                      {item.content_type}
                    </span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemoveItem(item); }}
                    className="p-1 rounded text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] transition-all"
                    title="移除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
