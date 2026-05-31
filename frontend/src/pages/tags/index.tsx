import { useState, useEffect, useCallback } from "react";
import { tagApi } from "../../api/organization";
import type { Tag } from "../../api/organization";
import { Plus, Trash2, Loader2, TagIcon } from "lucide-react";
import ConfirmDialog from "../../components/ConfirmDialog";
import Toast from "../../components/Toast";

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6366f1");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Tag | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await tagApi.list(1, 200);
      setTags(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await tagApi.create(newName.trim(), newColor);
      setNewName("");
      setToast({ type: "success", message: "标签创建成功" });
      await load();
    } catch (err: any) {
      setToast({ type: "error", message: err.response?.data?.detail || "创建失败" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await tagApi.delete(deleteTarget.id);
      setToast({ type: "success", message: `标签「${deleteTarget.name}」已删除` });
      setDeleteTarget(null);
      await load();
    } catch {
      setToast({ type: "error", message: "删除失败" });
    }
  };

  const presetColors = [
    "#ef4444", "#f97316", "#f59e0b", "#84cc16",
    "#10b981", "#06b6d4", "#3b82f6", "#6366f1",
    "#8b5cf6", "#ec4899", "#6b7280",
  ];

  return (
    <div className="max-w-3xl mx-auto px-6 py-6 taste-page-enter">
      {/* Toast */}
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除标签"
        message={`确定要删除标签「${deleteTarget?.name}」？关联内容不会被删除。`}
        confirmLabel="删除"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">标签管理</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1.5">创建和管理内容标签</p>
      </div>

      {/* Create Form */}
      <form onSubmit={handleCreate} className="taste-card-glow p-5 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
          <div className="flex-1 w-full">
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">标签名称</label>
            <input
              type="text"
              placeholder="输入标签名称"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={100}
              className="taste-input w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">颜色</label>
            <div className="flex gap-1.5 flex-wrap">
              {presetColors.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  className={`w-6 h-6 rounded-full border-2 transition-all cursor-pointer hover:scale-110 ${
                    newColor === c ? "border-[var(--text-primary)] scale-110 ring-2 ring-offset-1 ring-[var(--accent-soft)]" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={saving || !newName.trim()}
            className="taste-btn-primary text-sm flex items-center gap-2 h-9 shrink-0"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            创建标签
          </button>
        </div>
      </form>

      {/* Tags List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
        </div>
      ) : tags.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-[var(--bg-secondary)] flex items-center justify-center">
            <TagIcon className="w-8 h-8 text-[var(--text-muted)]" />
          </div>
          <p className="text-sm text-[var(--text-muted)]">暂无标签，创建一个吧</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <div
              key={tag.id}
              className="taste-card-glow flex items-center gap-2.5 px-3.5 py-2 group"
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: tag.color || "#6b7280" }}
              />
              <span className="text-sm text-[var(--text-primary)]">{tag.name}</span>
              <button
                onClick={() => setDeleteTarget(tag)}
                className="ml-1 p-0.5 rounded text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] transition-all"
                title="删除标签"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
