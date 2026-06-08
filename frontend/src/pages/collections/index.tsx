import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { collectionApi } from "../../api/organization";
import type { Collection, CollectionItem } from "../../api/organization";
import { contentApi } from "../../api/content";
import ConfirmDialog from "../../components/ConfirmDialog";
import ContentPicker from "../../components/ContentPicker";
import Toast from "../../components/Toast";
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
  Circle,
  PlayCircle,
  CheckCircle2,
} from "lucide-react";
import QuizGenerator from "../../components/QuizGenerator";
import { useBrain } from "../../lib/brain-context";
import { compareCollectionItems } from "../../lib/collection-sort";

// ── Types ──

type ViewMode = "list" | "detail";
type ProgressFilter = "all" | "not_done" | "in_progress" | "completed";
type StudyStatus = "not_started" | "in_progress" | "completed";
type ToastState = { type: "success" | "error" | "info"; message: string };
const COLLECTION_PAGE_SIZE = 24;

function normalizeProgressFilter(value: string | null): ProgressFilter {
  return value === "not_done" || value === "in_progress" || value === "completed" ? value : "all";
}

function normalizePage(value: string | null): number {
  const page = Number(value || "1");
  return Number.isInteger(page) && page > 0 ? page : 1;
}

interface CreateFormData {
  name: string;
  description: string;
}

function getStudyStatusLabel(status?: string | null) {
  if (status === "completed") return "已学完";
  if (status === "in_progress") return "学习中";
  return "未学";
}

function getStudyStatusClass(status?: string | null) {
  if (status === "completed") return "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
  if (status === "in_progress") return "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
  return "bg-[var(--bg-secondary)] text-[var(--text-muted)]";
}

function buildStudyExtraMeta(status: StudyStatus, now: string, startedAt?: string | null): Record<string, unknown> {
  return {
    study_status: status,
    study_started_at: status === "not_started" ? null : startedAt || now,
    study_completed_at: status === "completed" ? now : null,
  };
}

function getGroupStudyStats(entries: { item: CollectionItem; index: number }[]) {
  const total = entries.length;
  const completed = entries.filter(({ item }) => item.study_status === "completed").length;
  const inProgress = entries.filter(({ item }) => item.study_status === "in_progress").length;
  return {
    total,
    completed,
    inProgress,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

function GroupStatusButton({
  label,
  title,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  title: string;
  icon: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ── Component ──

export default function CollectionsPage() {
  const t = useCopy(collectionsCopy);
  const { currentBrainId } = useBrain();
  const navigate = useNavigate();
  const { id: routeCollectionId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  // ── State ──
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("q") || "");
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>(() => normalizeProgressFilter(searchParams.get("progress")));
  const [listPage, setListPage] = useState(() => normalizePage(searchParams.get("page")));
  const [listTotal, setListTotal] = useState(0);
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
  const [updatingStudyItem, setUpdatingStudyItem] = useState<string | null>(null);
  const [updatingStudyGroup, setUpdatingStudyGroup] = useState<string | null>(null);
  const [openingStudyItem, setOpeningStudyItem] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  function showToast(type: ToastState["type"], message: string) {
    setToast({ type, message });
  }

  // ── Data Loading ──

  const updateListSearchParams = useCallback((next: { q?: string; progress?: ProgressFilter; page?: number }) => {
    const params = new URLSearchParams(searchParams);
    const q = next.q ?? searchQuery;
    const progress = next.progress ?? progressFilter;
    const page = next.page ?? listPage;
    if (q.trim()) {
      params.set("q", q.trim());
    } else {
      params.delete("q");
    }
    if (progress !== "all") {
      params.set("progress", progress);
    } else {
      params.delete("progress");
    }
    if (page > 1) {
      params.set("page", String(page));
    } else {
      params.delete("page");
    }
    setSearchParams(params, { replace: true });
  }, [listPage, progressFilter, searchParams, searchQuery, setSearchParams]);

  const listQueryString = useCallback(() => {
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    if (progressFilter !== "all") params.set("progress", progressFilter);
    if (listPage > 1) params.set("page", String(listPage));
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [listPage, progressFilter, searchQuery]);

  const clearListFilters = useCallback(() => {
    setSearchQuery("");
    setProgressFilter("all");
    setListPage(1);
    const params = new URLSearchParams(searchParams);
    params.delete("q");
    params.delete("progress");
    params.delete("page");
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const loadCollections = useCallback(async () => {
    setLoading(true);
    try {
      const data = await collectionApi.list(listPage, COLLECTION_PAGE_SIZE, currentBrainId, {
        q: searchQuery,
        progress: progressFilter,
      });
      const maxPage = Math.max(1, Math.ceil(data.total / data.page_size));
      if (listPage > maxPage) {
        setListPage(maxPage);
        updateListSearchParams({ page: maxPage });
        return;
      }
      setCollections(data.items);
      setListTotal(data.total);
    } catch (err) {
      console.error("Failed to load collections:", err);
    } finally {
      setLoading(false);
    }
  }, [currentBrainId, listPage, progressFilter, searchQuery, updateListSearchParams]);

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
    setDetailError(null);
    void loadCollections();
    if (routeCollectionId) {
      setViewMode("detail");
      void loadCollectionDetail(routeCollectionId);
    } else {
      setViewMode("list");
      setSelectedCollection(null);
      setCollectionItems([]);
    }
  }, [loadCollections, loadCollectionDetail, routeCollectionId]);

  useEffect(() => {
    const nextQuery = searchParams.get("q") || "";
    const nextProgress = normalizeProgressFilter(searchParams.get("progress"));
    const nextPage = normalizePage(searchParams.get("page"));
    if (nextQuery !== searchQuery) setSearchQuery(nextQuery);
    if (nextProgress !== progressFilter) setProgressFilter(nextProgress);
    if (nextPage !== listPage) setListPage(nextPage);
  }, [listPage, progressFilter, searchParams, searchQuery]);

  // ── Filtered Collections ──

  const groupedCollectionItems = useMemo(() => {
    const sorted = [...collectionItems].sort(compareCollectionItems);
    const showGroups = sorted.some((item) => item.folder_path);
    if (!showGroups) {
      return [{ folderPath: null as string | null, entries: sorted.map((item, index) => ({ item, index })) }];
    }
    const groups: { folderPath: string | null; entries: { item: CollectionItem; index: number }[] }[] = [];
    sorted.forEach((item, index) => {
      const folderPath = item.folder_path || null;
      const last = groups[groups.length - 1];
      if (!last || last.folderPath !== folderPath) {
        groups.push({ folderPath, entries: [] });
      }
      groups[groups.length - 1].entries.push({ item, index });
    });
    return groups;
  }, [collectionItems]);

  const collectionStudyProgress = useMemo(() => {
    const total = collectionItems.length;
    const completed = collectionItems.filter((item) => item.study_status === "completed").length;
    const inProgress = collectionItems.filter((item) => item.study_status === "in_progress").length;
    return {
      total,
      completed,
      inProgress,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }, [collectionItems]);

  const nextStudyItem = useMemo(() => {
    const sorted = [...collectionItems].sort(compareCollectionItems);
    return (
      sorted.find((item) => item.study_status === "in_progress") ||
      sorted.find((item) => item.study_status !== "completed") ||
      sorted[0] ||
      null
    );
  }, [collectionItems]);

  // ── Handlers ──

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim()) return;
    setCreating(true);
    try {
      await collectionApi.create(createForm.name.trim(), createForm.description.trim() || undefined, currentBrainId);
      setShowCreateModal(false);
      setCreateForm({ name: "", description: "" });
      await loadCollections();
      showToast("success", "合集已创建");
    } catch (err) {
      console.error("Failed to create collection:", err);
      showToast("error", `创建失败: ${(err as Error).message}`);
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
        navigate("/collections");
      }
      await loadCollections();
      showToast("success", "合集已删除");
    } catch (err) {
      console.error("Failed to delete collection:", err);
      showToast("error", `删除失败: ${(err as Error).message}`);
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
      showToast("success", "已从合集中移除");
    } catch (err) {
      console.error("Failed to remove item:", err);
      showToast("error", `移除失败: ${(err as Error).message}`);
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
      showToast("success", "已加入合集");
    } catch (err) {
      console.error("Failed to add item:", err);
      showToast("error", `加入合集失败: ${(err as Error).message}`);
    }
    setShowContentPicker(false);
  };

  const handleCycleStudyStatus = async (item: CollectionItem) => {
    const nextStatus: StudyStatus =
      item.study_status === "completed"
        ? "not_started"
        : item.study_status === "in_progress"
          ? "completed"
          : "in_progress";
    setUpdatingStudyItem(item.id);
    try {
      const now = new Date().toISOString();
      const extraMeta = buildStudyExtraMeta(nextStatus, now, item.study_started_at);
      await contentApi.update(item.content_id, { extra_meta: extraMeta });
      setCollectionItems((prev) =>
        prev.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                study_status: nextStatus,
                study_started_at: nextStatus === "not_started" ? null : entry.study_started_at || now,
                study_completed_at: nextStatus === "completed" ? now : null,
              }
            : entry
        )
      );
    } catch (err) {
      console.error("Failed to update study status:", err);
      showToast("error", `更新学习状态失败: ${(err as Error).message}`);
    } finally {
      setUpdatingStudyItem(null);
    }
  };

  const handleSetGroupStudyStatus = async (
    groupKey: string,
    entries: { item: CollectionItem; index: number }[],
    status: StudyStatus,
  ) => {
    const items = entries.map(({ item }) => item);
    if (items.length === 0) return;
    setUpdatingStudyGroup(groupKey);
    try {
      const now = new Date().toISOString();
      await contentApi.batchStudyStatus(items.map((item) => item.content_id), status, selectedCollection?.brain_id || currentBrainId);
      const ids = new Set(items.map((item) => item.id));
      setCollectionItems((prev) =>
        prev.map((entry) =>
          ids.has(entry.id)
            ? {
                ...entry,
                study_status: status,
                study_started_at: status === "not_started" ? null : entry.study_started_at || now,
                study_completed_at: status === "completed" ? now : null,
              }
            : entry
        )
      );
      showToast("success", "已更新学习状态");
    } catch (err) {
      console.error("Failed to update group study status:", err);
      showToast("error", `更新学习状态失败: ${(err as Error).message}`);
    } finally {
      setUpdatingStudyGroup(null);
    }
  };

  const handleOpenStudyItem = async (
    contentId: string,
    collectionId: string,
    status?: string | null,
    startedAt?: string | null,
  ) => {
    if (openingStudyItem) return;
    setOpeningStudyItem(contentId);
    try {
      if (status !== "in_progress" && status !== "completed") {
        const now = new Date().toISOString();
        try {
          await contentApi.update(contentId, {
            extra_meta: {
              study_status: "in_progress",
              study_started_at: startedAt || now,
              study_completed_at: null,
            },
          });
          setCollectionItems((prev) =>
            prev.map((item) =>
              item.content_id === contentId
                ? {
                    ...item,
                    study_status: "in_progress",
                    study_started_at: item.study_started_at || now,
                    study_completed_at: null,
                  }
                : item
            )
          );
          setCollections((prev) =>
            prev.map((col) =>
              col.id === collectionId
                ? { ...col, resume_study_status: "in_progress" }
                : col
            )
          );
        } catch (err) {
          console.error("Failed to mark content as in progress:", err);
        }
      }
      navigate(`/contents/${contentId}?collection_id=${collectionId}`);
    } finally {
      setOpeningStudyItem(null);
    }
  };

  const handleViewDetail = async (col: Collection) => {
    navigate(`/collections/${col.id}${listQueryString()}`);
  };

  const handleBackToList = () => {
    navigate(`/collections${listQueryString()}`);
  };

  // ── Close dropdown on outside click ──
  useEffect(() => {
    if (!menuCollection) return;
    const handleClick = () => setMenuCollection(null);
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
      showToast("success", "合集已更新");
    } catch (err) {
      console.error("Failed to update collection:", err);
      showToast("error", `更新失败: ${(err as Error).message}`);
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
    const hasListFilters = Boolean(searchQuery.trim() || progressFilter !== "all");
    if (loading) {
      return (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--text-muted)]" />
        </div>
      );
    }

    if (collections.length === 0 && hasListFilters) {
      return null;
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

    const pageCount = Math.max(1, Math.ceil(listTotal / COLLECTION_PAGE_SIZE));
    const pageStart = listTotal === 0 ? 0 : (listPage - 1) * COLLECTION_PAGE_SIZE + 1;
    const pageEnd = Math.min(listTotal, listPage * COLLECTION_PAGE_SIZE);

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {collections.map((col) => (
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

            {col.item_count > 0 && (
              <div className="mb-3">
                <div className="mb-1.5 flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span>已学完 {col.completed_count || 0} / {col.item_count}</span>
                  <span>{col.progress_percent || 0}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${col.progress_percent || 0}%` }}
                  />
                </div>
              </div>
            )}

            {col.resume_content_id && (
              <button
                type="button"
                disabled={openingStudyItem === col.resume_content_id}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleOpenStudyItem(col.resume_content_id!, col.id, col.resume_study_status);
                }}
                className="mb-3 flex w-full items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-left text-sm text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-70 dark:bg-emerald-900/20 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
              >
                {openingStudyItem === col.resume_content_id ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <PlayCircle className="h-4 w-4 shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate">{col.resume_content_title || "继续学习"}</span>
                <span className="shrink-0 text-xs">
                  {col.resume_study_status === "in_progress" ? "学习中" : "未学"}
                </span>
              </button>
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

        {pageCount > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-muted)]">
            <span>
              {pageStart}-{pageEnd} / {listTotal}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={listPage <= 1}
                onClick={() => {
                  const nextPage = Math.max(1, listPage - 1);
                  setListPage(nextPage);
                  updateListSearchParams({ page: nextPage });
                }}
                className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                上一页
              </button>
              <span className="min-w-16 text-center">
                {listPage} / {pageCount}
              </span>
              <button
                type="button"
                disabled={listPage >= pageCount}
                onClick={() => {
                  const nextPage = Math.min(pageCount, listPage + 1);
                  setListPage(nextPage);
                  updateListSearchParams({ page: nextPage });
                }}
                className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Render: Detail View ──

  const renderDetailView = () => {
    if (!selectedCollection) return null;
    const collectionStatusEntries = collectionItems.map((item, index) => ({ item, index }));
    const isCollectionStatusUpdating = updatingStudyGroup === "__collection__";

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
              {collectionStudyProgress.total > 0 && (
                <div className="mt-2 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                    <span>
                      已学完 {collectionStudyProgress.completed} / {collectionStudyProgress.total}
                    </span>
                    {collectionStudyProgress.inProgress > 0 && (
                      <span>学习中 {collectionStudyProgress.inProgress}</span>
                    )}
                    <span>{collectionStudyProgress.percent}%</span>
                    <div className="h-1.5 w-32 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${collectionStudyProgress.percent}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <GroupStatusButton
                      label="整套未学"
                      title="标记整套合集为未学"
                      icon={<Circle className="w-3.5 h-3.5" />}
                      disabled={isCollectionStatusUpdating}
                      onClick={() => void handleSetGroupStudyStatus("__collection__", collectionStatusEntries, "not_started")}
                    />
                    <GroupStatusButton
                      label="整套学习中"
                      title="标记整套合集为学习中"
                      icon={<PlayCircle className="w-3.5 h-3.5" />}
                      disabled={isCollectionStatusUpdating}
                      onClick={() => void handleSetGroupStudyStatus("__collection__", collectionStatusEntries, "in_progress")}
                    />
                    <GroupStatusButton
                      label="整套已学完"
                      title="标记整套合集为已学完"
                      icon={isCollectionStatusUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      disabled={isCollectionStatusUpdating}
                      onClick={() => void handleSetGroupStudyStatus("__collection__", collectionStatusEntries, "completed")}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {nextStudyItem && (
              <button
                disabled={openingStudyItem === nextStudyItem.content_id}
                onClick={() => void handleOpenStudyItem(
                  nextStudyItem.content_id,
                  selectedCollection.id,
                  nextStudyItem.study_status,
                  nextStudyItem.study_started_at,
                )}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--accent-text)] hover:bg-[var(--accent-soft)] rounded-lg transition-colors disabled:cursor-wait disabled:opacity-70"
              >
                {openingStudyItem === nextStudyItem.content_id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <BookOpen className="w-4 h-4" />
                )}
                继续学习
              </button>
            )}
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
              {groupedCollectionItems.map((group) => {
                const groupKey = group.folderPath || "__root__";
                const groupStats = getGroupStudyStats(group.entries);
                const isGroupUpdating = updatingStudyGroup === groupKey;
                return (
                <div key={groupKey}>
                  {group.folderPath && (
                    <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--bg-secondary)] px-5 py-2.5 text-xs text-[var(--text-secondary)]">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{group.folderPath}</div>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                          <span>已学完 {groupStats.completed} / {groupStats.total}</span>
                          {groupStats.inProgress > 0 && <span>学习中 {groupStats.inProgress}</span>}
                          <span>{groupStats.percent}%</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <GroupStatusButton
                          label="未学"
                          title="标记本文件夹为未学"
                          icon={<Circle className="w-3.5 h-3.5" />}
                          disabled={isGroupUpdating}
                          onClick={() => void handleSetGroupStudyStatus(groupKey, group.entries, "not_started")}
                        />
                        <GroupStatusButton
                          label="学习中"
                          title="标记本文件夹为学习中"
                          icon={<PlayCircle className="w-3.5 h-3.5" />}
                          disabled={isGroupUpdating}
                          onClick={() => void handleSetGroupStudyStatus(groupKey, group.entries, "in_progress")}
                        />
                        <GroupStatusButton
                          label="已学完"
                          title="标记本文件夹为已学完"
                          icon={isGroupUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          disabled={isGroupUpdating}
                          onClick={() => void handleSetGroupStudyStatus(groupKey, group.entries, "completed")}
                        />
                      </div>
                    </div>
                  )}
                  {group.entries.map(({ item, index }) => (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => void handleOpenStudyItem(
                        item.content_id,
                        selectedCollection.id,
                        item.study_status,
                        item.study_started_at,
                      )}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          void handleOpenStudyItem(
                            item.content_id,
                            selectedCollection.id,
                            item.study_status,
                            item.study_started_at,
                          );
                        }
                      }}
                      className={`flex cursor-pointer items-center justify-between px-5 py-3.5 hover:bg-[var(--bg-secondary)] transition-colors ${
                        openingStudyItem === item.content_id ? "opacity-70" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-sm font-mono text-[var(--text-muted)] dark:text-[var(--text-muted)] w-6 flex-shrink-0">
                          {index + 1}.
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">
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

                      <div className="ml-3 flex flex-shrink-0 items-center gap-2">
                        {openingStudyItem === item.content_id && (
                          <Loader2 className="w-4 h-4 animate-spin text-[var(--text-muted)]" />
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleCycleStudyStatus(item);
                          }}
                          disabled={updatingStudyItem === item.id}
                          className={`rounded-full px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-60 ${getStudyStatusClass(item.study_status)}`}
                          title="切换学习状态"
                        >
                          {getStudyStatusLabel(item.study_status)}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRemoveDialog(item);
                          }}
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
                    </div>
                  ))}
                </div>
                );
              })}
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
          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setListPage(1);
                  updateListSearchParams({ q: e.target.value, page: 1 });
                }}
                placeholder={t.searchPlaceholder}
                className="dao-input w-full pl-10"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1 rounded-lg bg-[var(--bg-secondary)] p-1">
              {[
                ["all", "全部"],
                ["not_done", "未完成"],
                ["in_progress", "学习中"],
                ["completed", "已完成"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => {
                    const nextProgress = value as ProgressFilter;
                    setProgressFilter(nextProgress);
                    setListPage(1);
                    updateListSearchParams({ progress: nextProgress, page: 1 });
                  }}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    progressFilter === value
                      ? "bg-[var(--bg-card)] text-[var(--accent-text)] shadow-sm"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        {viewMode === "list" ? renderListView() : renderDetailView()}

        {/* No search results */}
        {viewMode === "list" &&
          (searchQuery.trim() || progressFilter !== "all") &&
          collections.length === 0 && (
            <div className="text-center py-12">
              <Search className="w-12 h-12 mx-auto text-[var(--text-muted)] dark:text-[var(--text-secondary)] mb-3" />
              <p className="text-sm text-[var(--text-muted)] dark:text-[var(--text-muted)]">
                {t.emptySearch}
              </p>
              <p className="text-xs text-[var(--text-muted)] dark:text-[var(--text-muted)] mt-1">
                {t.emptySearchHint}
              </p>
              <button
                type="button"
                onClick={clearListFilters}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--bg-secondary)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
              >
                <X className="h-3.5 w-3.5" />
                清空筛选
              </button>
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
        <QuizGenerator
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
          brainId={selectedCollection?.brain_id ?? currentBrainId ?? null}
          excludeIds={collectionItems.map((item) => item.content_id)}
        />
      )}
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
}
