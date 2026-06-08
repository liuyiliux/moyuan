import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { categoryApi } from "../../api/organization";
import type { Category } from "../../api/organization";
import { Plus, Edit, Trash2, Loader2, FolderTree, ChevronRight, BookOpen } from "lucide-react";
import ConfirmDialog from "../../components/ConfirmDialog";
import Toast from "../../components/Toast";
import { categoriesCopy, useCopy } from "../../lib/copywriting";
import QuizGenerator from "../../components/QuizGenerator";
import { useBrain } from "../../lib/brain-context";

interface CatNode extends Category {
  children?: CatNode[];
}

export default function CategoriesPage() {
  const t = useCopy(categoriesCopy);
  const navigate = useNavigate();
  const { currentBrainId } = useBrain();
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
  const [quizCategory, setQuizCategory] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [treeData, flatData] = await Promise.all([
        categoryApi.tree(currentBrainId),
        categoryApi.listAll(currentBrainId),
      ]);
      setTree(treeData);
      setFlatList(flatData);
    } finally {
      setLoading(false);
    }
  }, [currentBrainId]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const pid = parentId === "" ? null : parentId;
      if (editing) {
        await categoryApi.update(editing.id, { name: newName.trim(), parent_id: pid });
        setToast({ type: "success", message: t.toastUpdated });
      } else {
        await categoryApi.create(newName.trim(), pid, currentBrainId);
        setToast({ type: "success", message: t.toastCreated });
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
      setToast({ type: "success", message: t.toastDeleted });
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
            <span
              className="text-sm text-[var(--text-primary)] flex-1 cursor-pointer hover:text-[var(--accent-text)] transition-colors"
              onClick={() => navigate(`/contents?category_id=${node.id}`)}
            >{node.name}</span>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => setQuizCategory({ id: node.id, name: node.name })}
                className="p-1 rounded text-[var(--text-muted)] hover:text-amber-600 hover:bg-[var(--warning-soft)] transition-colors"
                title={`对分类"${node.name}"出题`}
              >
                <BookOpen className="w-3.5 h-3.5" />
              </button>
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
    <div className="max-w-3xl mx-auto px-6 py-6 dao-page-enter">
      {/* Toast */}
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title={t.confirmTitle}
        message={t.confirmMsg(deleteTarget?.name || "")}
        confirmLabel="删除"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">{t.title}</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1.5">{t.subtitle}</p>
        </div>
        <button
          onClick={() => {
            if (showForm && !editing) {
              cancelForm(); // 关闭表单并清空
            } else {
              cancelForm(); // 先清空旧数据
              setShowForm(true); // 再打开新表单
            }
          }}
          className="dao-btn dao-btn-primary flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          {showForm && !editing ? t.btnCancel : t.btnCreate}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="dao-card dao-glow-hover p-5 mb-6">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
            <div className="flex-1 w-full">
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">{t.title}</label>
              <input
                type="text"
                placeholder={t.placeholder}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                className="dao-input w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">{t.parentLabel}</label>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="dao-input h-9 text-sm"
              >
                <option value="">{t.parentRoot}</option>
                {flatList.map((c) => (
                  <option key={c.id} value={c.id} disabled={editing?.id === c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="dao-btn dao-btn-primary text-sm h-9">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? t.btnUpdate : t.btnCreate}
              </button>
              {editing && (
                <button type="button" onClick={cancelForm} className="dao-btn dao-btn-ghost text-sm h-9">
                  {t.btnCancel}
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
          <p className="text-sm text-[var(--text-muted)]">{t.empty}</p>
        </div>
      ) : (
        renderTree(tree)
      )}

      {quizCategory && (
        <QuizGenerator
          scopeType="category"
          scopeId={quizCategory.id}
          scopeName={quizCategory.name}
          onClose={() => setQuizCategory(null)}
        />
      )}
    </div>
  );
}
