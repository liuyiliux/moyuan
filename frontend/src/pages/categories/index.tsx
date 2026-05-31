import { useState, useEffect } from "react";
import { categoryApi } from "../../api/organization";
import type { Category } from "../../api/organization";
import { Plus, Edit, Trash2, Loader2, FolderTree, ChevronRight } from "lucide-react";
import ConfirmDialog from "../../components/ConfirmDialog";
import Toast from "../../components/Toast";

interface CatNode extends Category {
  children?: CatNode[];
}

export default function CategoriesPage() {
  const [tree, setTree] = useState<CatNode[]>([]);
  const [flatList, setFlatList] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [treeData, flatData] = await Promise.all([
        categoryApi.tree(),
        categoryApi.listAll(),
      ]);
      setTree(treeData);
      setFlatList(flatData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const pid = parentId === "" ? null : parentId;
      if (editing) {
        await categoryApi.update(editing.id, { name: newName.trim(), parent_id: pid });
        setToast({ type: "success", message: "分类已更新" });
      } else {
        await categoryApi.create(newName.trim(), pid);
        setToast({ type: "success", message: "分类创建成功" });
      }
      setNewName("");
      setParentId("");
      setEditing(null);
      setShowForm(false);
      await load();
    } catch (err: any) {
      setToast({ type: "error", message: err.response?.data?.detail || "操作失败" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await categoryApi.delete(deleteTarget.id);
      setToast({ type: "success", message: `分类「${deleteTarget.name}」已删除` });
      setDeleteTarget(null);
      await load();
    } catch {
      setToast({ type: "error", message: "删除失败" });
    }
  };

  const startEdit = (cat: Category) => {
    setEditing(cat);
    setNewName(cat.name);
    setParentId(cat.parent_id || "");
    setShowForm(true);
  };

  const cancelForm = () => {
    setEditing(null);
    setNewName("");
    setParentId("");
    setShowForm(false);
  };

  const renderTree = (nodes: CatNode[], depth = 0): React.ReactNode => (
    <ul className="list-none p-0 space-y-1" style={{ marginLeft: depth > 0 ? "20px" : "0" }}>
      {nodes.map((node) => (
        <li key={node.id}>
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border-default)] transition-colors group">
            {depth > 0 && <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0" />}
            <span className="text-sm text-[var(--text-primary)] flex-1">{node.name}</span>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => startEdit(node)}
                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--accent-text)] hover:bg-[var(--accent-soft)] transition-colors"
                title="编辑"
              >
                <Edit className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setDeleteTarget(node)}
                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] transition-colors"
                title="删除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {node.children && node.children.length > 0 && renderTree(node.children, depth + 1)}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="max-w-3xl mx-auto px-6 py-6 taste-page-enter">
      {/* Toast */}
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除分类"
        message={`确定要删除分类「${deleteTarget?.name}」？内容不会被删除，只会移出该分类。`}
        confirmLabel="删除"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">分类管理</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1.5">组织内容的层级分类结构</p>
        </div>
        <button
          onClick={() => { cancelForm(); setShowForm((v) => !v); }}
          className="taste-btn-primary flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          {showForm && !editing ? "取消" : "新建分类"}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="taste-card-glow p-5 mb-6">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
            <div className="flex-1 w-full">
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">分类名称</label>
              <input
                type="text"
                placeholder="输入分类名称"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                className="taste-input w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">父分类</label>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="taste-input h-9 text-sm"
              >
                <option value="">（根分类）</option>
                {flatList.map((c) => (
                  <option key={c.id} value={c.id} disabled={editing?.id === c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="taste-btn-primary text-sm h-9">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? "更新" : "创建"}
              </button>
              {editing && (
                <button type="button" onClick={cancelForm} className="taste-btn-ghost text-sm h-9">
                  取消
                </button>
              )}
            </div>
          </div>
        </form>
      )}

      {/* Tree */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
        </div>
      ) : tree.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-[var(--bg-secondary)] flex items-center justify-center">
            <FolderTree className="w-8 h-8 text-[var(--text-muted)]" />
          </div>
          <p className="text-sm text-[var(--text-muted)]">暂无分类，创建一个吧</p>
        </div>
      ) : (
        renderTree(tree)
      )}
    </div>
  );
}
