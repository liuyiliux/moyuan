import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { collectionApi } from "../../api/organization";
import type { Collection, CollectionItem } from "../../api/organization";
import ConfirmDialog from "../../components/ConfirmDialog";
import ContentPicker from "../../components/ContentPicker";
import { collectionsCopy, useCopy } from "../../lib/copywriting";
import {
  FolderOpen,
  Plus,
  Trash2,
  ArrowLeft,
  Search,
  Loader2,
  MoreHorizontal,
  FileText,
  X,
  BookOpen,
  Pencil,
} from "lucide-react";
import QuizModal from "../../components/QuizModal";

// ── Types ──

type ViewMode = "list" | "detail";

interface CreateFormData {
  name: string;
  description: string;
}

// ── Component ──

export default function CollectionsPage() {
  const t = useCopy(collectionsCopy);
  // ── State ──
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [collectionItems, setCollectionItems] = useState<CollectionItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showContentPicker, setShowContentPicker] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormData>({ name: "", description: "" });
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [removingItem, setRemovingItem] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<Collection | null>(null);
  const [removeDialog, setRemoveDialog] = useState<CollectionItem | null>(null);
  const [quizCollection, setQuizCollection] = useState<{ id: string; name: string } | null>(null);
  const [menuCollection, setMenuCollection] = useState<string | null>(null);
  const [editCollection, setEditCollection] = useState<Collection | null>(null);
  const [editForm, setEditForm] = useState<CreateFormData>({ name: "", description: "" });
  const [updating, setUpdating] = useState(false);

  // ── Data Loading ──

  const loadCollections = useCallback(async () => {
    setLoading(true);
    try {
      const data = await collectionApi.list(1, 100);
      setCollections(data);
    } catch (err) {
      console.error("Failed to load collections:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCollectionDetail = useCallback(async (colId: string) => {
    setItemsLoading(true);
    setDetailError(null);
    try {
      const data = await collectionApi.get(colId);
      setSelectedCollection(data.collection);
      setCollectionItems(data.items);
    } catch (err: any) {
      console.error("Failed to load collection detail:", err);
      setDetailError(err?.message || "加载合集详情失败");
    } finally {
      setItemsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCollections();
  }, [loadCollections]);

  // ── Filtered Collections ──

  const filteredCollections = useMemo(() => {
    if (!searchQuery.trim()) return collections;
    const query = searchQuery.toLowerCase();
    return collections.filter(
      (col) =>
        col.name.toLowerCase().includes(query) ||
        (col.description && col.description.toLowerCase().includes(query))
    );
  }, [collections, searchQuery]);

  // ── Handlers ──

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim()) return;
    setCreating(true);
    try {
      await collectionApi.create(createForm.name.trim(), createForm.description.trim() || undefined);
      setShowCreateModal(false);
      setCreateForm({ name: "", description: "" });
      await loadCollections();
    } catch (err) {
      console.error("Failed to create collection:", err);
      alert("创建失败");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog) return;
    setDeleting(deleteDialog.id);
    try {
      await collectionApi.delete(deleteDialog.id);
      if (selectedCollection?.id === deleteDialog.id) {
        setSelectedCollection(null);
        setCollectionItems([]);
        setViewMode("list");
      }
      await loadCollections();
    } catch (err) {
      console.error("Failed to delete collection:", err);
    } finally {
      setDeleting(null);
      setDeleteDialog(null);
    }
  };

  const handleRemoveItem = async () => {
    if (!selectedCollection || !removeDialog) return;
    setRemovingItem(removeDialog.id);
    try {
      await collectionApi.removeItem(selectedCollection.id, removeDialog.content_id);
      setCollectionItems((prev) => prev.filter((i) => i.id !== removeDialog.id));
      setCollections((prev) =>
        prev.map((c) =>
          c.id === selectedCollection.id
            ? { ...c, item_count: Math.max(0, c.item_count - 1) }
            : c
        )
      );
    } catch (err) {
      console.error("Failed to remove item:", err);
    } finally {
      setRemovingItem(null);
      setRemoveDialog(null);
    }
  };

  const handleAddContent = async (contentId: string) => {
    if (!selectedCollection) return;
    try {
      await collectionApi.addItem(selectedCollection.id, contentId);
      await loadCollectionDetail(selectedCollection.id);
      const col = collections.find((c) => c.id === selectedCollection.id);
      if (col) {
        setCollections((prev) =>
          prev.map((c) =>
            c.id === col.id ? { ...c, item_count: col.item_count + 1 } : c
          )
        );
      }
    } catch (err) {
      console.error("Failed to add item:", err);
    }
    setShowContentPicker(false);
  };

  const handleViewDetail = async (col: Collection) => {
    setViewMode("detail");
    await loadCollectionDetail(col.id);
  };

  const handleBackToList = () => {
    setViewMode("list");
    setSelectedCollection(null);
    setCollectionItems([]);
  };

  // ── Close dropdown on outside click ──
  useEffect(() => {
    if (!menuCollection) return;
    const handleClick = (e: MouseEvent) => setMenuCollection(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [menuCollection]);

  // ── Edit Handlers ──
  const handleOpenEdit = (col: Collection) => {
    setEditCollection(col);
    setEditForm({ name: col.name, description: col.description || "" });
    setMenuCollection(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCollection || !editForm.name.trim()) return;
    setUpdating(true);
    try {
      await collectionApi.update(editCollection.id, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || undefined,
      });
      setEditCollection(null);
      setEditForm({ name: "", description: "" });
      await loadCollections();
      // Also refresh detail if viewing this collection
      if (selectedCollection?.id === editCollection.id) {
        await loadCollectionDetail(editCollection.id);
      }
    } catch (err) {
      console.error("Failed to update collection:", err);
      alert("更新失败");
    } finally {
      setUpdating(false);
    }
  };

  // ── Format Date ──

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  // ── Render: Create Modal ──

  const renderCreateModal = () => {
    if (!showCreateModal) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="w-full max-w-md p-6 bg-[var(--bg-card)] dark:bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] dark:border-[var(--border-subtle)] shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
              {t.modalTitle}
            </h3>
            <button
              onClick={() => setShowCreateModal(false)}
              className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] dark:hover:bg-[var(--bg-elevated)] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] dark:text-[var(--text-muted)] mb-1">
                名称 <span className="text-[var(--danger)]">*</span>
              </label>
              <input
                type="text"
                value={createForm.name}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={t.placeholder}
                maxLength={100}
                className="dao-input w-full"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] dark:text-[var(--text-muted)] mb-1">
                描述
              </label>
              <textarea
                value={createForm.description}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder={t.descPlaceholder}
                rows={3}
                maxLength={500}
                className="dao-input w-full resize-none"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="dao-btn dao-btn-ghost text-sm"
              >
                {t.btnCancel}
              </button>
              <button
                type="submit"
                disabled={creating || !createForm.name.trim()}
                className="dao-btn dao-btn-primary text-sm flex items-center gap-2"
              >
                {creating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                {t.btnCreate}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // ── Render: Edit Modal ──

  const renderEditModal = () => {
    if (!editCollection) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="w-full max-w-md p-6 bg-[var(--bg-card)] dark:bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] dark:border-[var(--border-subtle)] shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
              {t.editTitle}
            </h3>
            <button
              onClick={() => setEditCollection(null)}
              className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] dark:text-[var(--text-muted)] mb-1">
                {t.editNameLabel} <span className="text-[var(--danger)]">*</span>
              </label>
              <input
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                maxLength={100}
                className="dao-input w-full"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] dark:text-[var(--text-muted)] mb-1">
                {t.editDescLabel}
              </label>
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                rows={3}
                maxLength={500}
                className="dao-input w-full resize-none"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditCollection(null)}
                className="dao-btn dao-btn-ghost text-sm"
              >
                {t.btnCancel}
              </button>
              <button
                type="submit"
                disabled={updating || !editForm.name.trim()}
                className="dao-btn dao-btn-primary text-sm flex items-center gap-2"
              >
                {updating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Pencil className="w-4 h-4" />
                )}
                {updating ? t.editSaving : t.editSave}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // ── Render: List View ──

  const renderListView = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--text-muted)]" />
        </div>
      );
    }

    if (collections.length === 0) {
      return (
        <div className="text-center py-20">
          <FolderOpen className="w-16 h-16 mx-auto text-[var(--text-muted)] dark:text-[var(--text-secondary)] mb-4" />
          <h3 className="text-lg font-medium text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-2">
            还没有合集
          </h3>
          <p className="text-sm text-[var(--text-muted)] dark:text-[var(--text-muted)] mb-6">
            {t.emptyHint}
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[var(--text-inverse)] bg-[var(--accent)] rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t.btnCreate}
          </button>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCollections.map((col) => (
          <div
            key={col.id}
            className="dao-card dao-glow-hover p-4 cursor-pointer group"
            onClick={() => handleViewDetail(col)}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-lg bg-[var(--accent-soft)] dark:bg-blue-900/20 flex items-center justify-center">
                  <FolderOpen className="w-5 h-5 text-[var(--accent-text)] dark:text-[var(--accent-text)]" />
                </div>
                <div>
                  <h3 className="font-medium text-[var(--text-primary)] dark:text-[var(--text-primary)] line-clamp-1">
                    {col.name}
                  </h3>
                  <p className="text-xs text-[var(--text-muted)] dark:text-[var(--text-muted)] mt-0.5">
                    {t.itemCount(col.item_count)}
                  </p>
                </div>
              </div>
            </div>

            {/* Description */}
            {col.description && (
              <p className="text-sm text-[var(--text-secondary)] dark:text-[var(--text-muted)] line-clamp-2 mb-3">
                {col.description}
              </p>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)] dark:border-[var(--border-subtle)]">
              <span className="text-xs text-[var(--text-muted)] dark:text-[var(--text-muted)]">
                {formatDate(col.created_at)}
              </span>
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuCollection(menuCollection === col.id ? null : col.id);
                  }}
                  className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                  title="更多操作"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>

                {/* Dropdown */}
                {menuCollection === col.id && (
                  <div
                    className="absolute right-0 top-full mt-1 w-36 py-1 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg shadow-lg z-50"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => handleOpenEdit(col)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                    >
                      <Pencil className="w-4 h-4 text-[var(--text-muted)]" />
                      {t.editBtnTooltip}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setQuizCollection({ id: col.id, name: col.name });
                        setMenuCollection(null);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                    >
                      <BookOpen className="w-4 h-4 text-amber-500" />
                      {t.quizBtnTooltip}
                    </button>
                    <div className="border-t border-[var(--border-subtle)] my-1" />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteDialog(col);
                        setMenuCollection(null);
                      }}
                      disabled={deleting === col.id}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--danger)] hover:bg-[var(--danger-soft)] dark:hover:bg-red-900/20 transition-colors"
                    >
                      {deleting === col.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                      {t.confirmDeleteTitle}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ── Render: Detail View ──

  const renderDetailView = () => {
    if (!selectedCollection) return null;

    return (
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBackToList}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--text-secondary)] dark:text-[var(--text-muted)] hover:text-[var(--text-primary)] dark:hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] dark:hover:bg-[var(--bg-elevated)] rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              {t.detailBack}
            </button>
            <div>
              <h2 className="text-xl font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                {selectedCollection.name}
              </h2>
              {selectedCollection.description && (
                <p className="text-sm text-[var(--text-muted)] dark:text-[var(--text-muted)] mt-1">
                  {selectedCollection.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setQuizCollection({ id: selectedCollection.id, name: selectedCollection.name })}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors"
            >
              <BookOpen className="w-4 h-4" />
              {t.quizDetailBtn}
            </button>
            <button
              onClick={() => setDeleteDialog(selectedCollection)}
              disabled={deleting === selectedCollection.id}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--danger)] hover:bg-[var(--danger-soft)] dark:hover:bg-red-900/20 rounded-lg transition-colors"
            >
              {deleting === selectedCollection.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              {t.confirmDeleteTitle}
            </button>
          </div>
        </div>

            {/* Items List */}
        <div className="bg-[var(--bg-card)] dark:bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                {t.detailItems(collectionItems.length)}
              </h3>
              <button onClick={() => setShowContentPicker(true)} className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[var(--accent-text)] hover:bg-[var(--accent-soft)] dark:hover:bg-blue-900/20 rounded-lg transition-colors">
                <Plus className="w-4 h-4" />
                {t.detailAddBtn}
              </button>
            </div>
          </div>

              {detailError ? (
            <div className="text-center py-12">
              <p className="text-sm text-[var(--danger)]">{detailError}</p>
              <button onClick={() => selectedCollection && loadCollectionDetail(selectedCollection.id)} className="mt-3 text-sm text-[var(--accent-text)] hover:underline">
                重试
              </button>
            </div>
          ) : itemsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--text-muted)]" />
            </div>
          ) : collectionItems.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 mx-auto text-[var(--text-muted)] mb-3" />
              <p className="text-sm text-[var(--text-muted)]">
                {t.detailEmpty}
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                {t.detailEmptyHint}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {collectionItems
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((item, index) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-[var(--bg-secondary)] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono text-[var(--text-muted)] dark:text-[var(--text-muted)] w-6">
                        {index + 1}.
                      </span>
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                          {item.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-[var(--text-muted)] dark:text-[var(--text-muted)]">
                            {item.content_type}
                          </span>
                          <span className="text-xs text-[var(--text-muted)] dark:text-[var(--text-muted)]">
                            •
                          </span>
                          <span className="text-xs text-[var(--text-muted)] dark:text-[var(--text-muted)]">
                            {formatDate(item.added_at)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => setRemoveDialog(item)}
                      disabled={removingItem === item.id}
                      className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] dark:hover:bg-red-900/20 transition-colors"
                      title="从合集中移除"
                    >
                      {removingItem === item.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <X className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Main Render ──

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
              {t.title}
            </h1>
            <p className="text-sm text-[var(--text-muted)] dark:text-[var(--text-muted)] mt-1">
              {t.subtitle}
            </p>
          </div>

          {viewMode === "list" && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[var(--text-inverse)] bg-[var(--accent)] rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t.btnCreate}
            </button>
          )}
        </div>

        {/* Search (only in list view) */}
        {viewMode === "list" && collections.length > 0 && (
          <div className="mb-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="dao-input w-full pl-10"
              />
            </div>
          </div>
        )}

        {/* Content */}
        {viewMode === "list" ? renderListView() : renderDetailView()}

        {/* No search results */}
        {viewMode === "list" &&
          searchQuery.trim() &&
          filteredCollections.length === 0 &&
          collections.length > 0 && (
            <div className="text-center py-12">
              <Search className="w-12 h-12 mx-auto text-[var(--text-muted)] dark:text-[var(--text-secondary)] mb-3" />
              <p className="text-sm text-[var(--text-muted)] dark:text-[var(--text-muted)]">
                {t.emptySearch}
              </p>
              <p className="text-xs text-[var(--text-muted)] dark:text-[var(--text-muted)] mt-1">
                {t.emptySearchHint}
              </p>
            </div>
          )}
      </div>

      {/* Create Modal */}
      {renderCreateModal()}

      {/* Edit Modal */}
      {renderEditModal()}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteDialog !== null}
        title={t.confirmDeleteTitle}
        message={t.confirmDeleteMsg(deleteDialog?.name || "")}
        confirmLabel="删除"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteDialog(null)}
      />

      {/* Remove Item Confirmation */}
      <ConfirmDialog
        open={removeDialog !== null}
        title={t.confirmRemoveTitle}
        message={t.confirmRemoveMsg(removeDialog?.title || "")}
        confirmLabel={t.confirmRemoveBtn}
        variant="danger"
        onConfirm={handleRemoveItem}
        onCancel={() => setRemoveDialog(null)}
      />

      {/* Quiz Modal */}
      {quizCollection && (
        <QuizModal
          scopeType="collection"
          scopeId={quizCollection.id}
          scopeName={quizCollection.name}
          onClose={() => setQuizCollection(null)}
        />
      )}

      {/* Content Picker Modal */}
      {showContentPicker && (
        <ContentPicker
          onSelect={handleAddContent}
          onClose={() => setShowContentPicker(false)}
        />
      )}
    </div>
  );
}