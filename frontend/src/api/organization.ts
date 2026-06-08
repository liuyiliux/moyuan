import { api } from './provider';

// ── Types ──

export interface Tag {
  id: string;
  name: string;
  color?: string;
  brain_id?: string | null;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  parent_id: string | null;
  brain_id?: string | null;
  sort_order: number;
  created_at: string;
  children?: Category[];
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  brain_id?: string | null;
  item_count: number;
  completed_count?: number;
  in_progress_count?: number;
  progress_percent?: number;
  resume_content_id?: string | null;
  resume_content_title?: string | null;
  resume_study_status?: string | null;
  created_at: string;
}

export interface CollectionListResponse {
  items: Collection[];
  total: number;
  page: number;
  page_size: number;
}

export interface CollectionItem {
  id: string;
  content_id: string;
  title: string;
  content_type: string;
  sort_order: number;
  added_at: string;
  import_relative_path?: string | null;
  folder_path?: string | null;
  import_root?: string | null;
  import_category_id?: string | null;
  study_status?: "not_started" | "in_progress" | "completed" | string | null;
  study_started_at?: string | null;
  study_completed_at?: string | null;
}

// ── Tags API ──

export const tagApi = {
  create(name: string, color?: string, brainId?: string | null): Promise<Tag> {
    return api.post<Tag>('/tags', { name, color, brain_id: brainId || undefined });
  },
  list(page = 1, page_size = 50, brainId?: string | null): Promise<Tag[]> {
    const qs = new URLSearchParams({ page: String(page), page_size: String(page_size) });
    if (brainId) qs.set("brain_id", brainId);
    return api.get<Tag[]>(`/tags?${qs.toString()}`);
  },
  delete(tagId: string): Promise<void> {
    return api.delete<void>(`/tags/${tagId}`);
  },
  addToContent(contentId: string, tagId: string): Promise<void> {
    return api.post<void>(`/tags/content/${contentId}?tag_id=${tagId}`);
  },
  removeFromContent(contentId: string, tagId: string): Promise<void> {
    return api.delete<void>(`/tags/content/${contentId}/${tagId}`);
  },
};

// ── Categories API ──

export const categoryApi = {
  create(name: string, parentId?: string | null, brainId?: string | null): Promise<Category> {
    return api.post<Category>('/categories', { name, parent_id: parentId ?? null, brain_id: brainId || undefined });
  },
  tree(brainId?: string | null): Promise<Category[]> {
    return api.get<Category[]>(`/categories/tree${brainId ? `?brain_id=${brainId}` : ""}`);
  },
  listAll(brainId?: string | null): Promise<Category[]> {
    return api.get<Category[]>(`/categories${brainId ? `?brain_id=${brainId}` : ""}`);
  },
  update(catId: string, data: { name?: string; parent_id?: string | null }): Promise<Category> {
    return api.patch<Category>(`/categories/${catId}`, data);
  },
  delete(catId: string): Promise<void> {
    return api.delete<void>(`/categories/${catId}`);
  },
  moveContent(contentId: string, categoryId: string | null): Promise<void> {
    const qs = categoryId ? `?category_id=${categoryId}` : '?category_id=null';
    return api.post<void>(`/categories/move-content/${contentId}${qs}`);
  },
};

// ── Collections API ──

export const collectionApi = {
  create(name: string, description?: string, brainId?: string | null): Promise<Collection> {
    return api.post<Collection>('/collections', { name, description, brain_id: brainId || undefined });
  },
  list(
    page = 1,
    page_size = 20,
    brainId?: string | null,
    filters?: { q?: string; progress?: "all" | "not_done" | "in_progress" | "completed" },
  ): Promise<CollectionListResponse> {
    const qs = new URLSearchParams({ page: String(page), page_size: String(page_size) });
    if (brainId) qs.set("brain_id", brainId);
    if (filters?.q?.trim()) qs.set("q", filters.q.trim());
    if (filters?.progress && filters.progress !== "all") qs.set("progress", filters.progress);
    return api.get<CollectionListResponse>(`/collections?${qs.toString()}`);
  },
  get(colId: string): Promise<{ collection: Collection; items: CollectionItem[] }> {
    return api.get(`/collections/${colId}`);
  },
  update(colId: string, data: { name?: string; description?: string }): Promise<Collection> {
    return api.patch<Collection>(`/collections/${colId}`, data);
  },
  delete(colId: string): Promise<void> {
    return api.delete<void>(`/collections/${colId}`);
  },
  addItem(colId: string, contentId: string): Promise<void> {
    return api.post<void>(`/collections/${colId}/add`, { content_id: contentId });
  },
  removeItem(colId: string, contentId: string): Promise<void> {
    return api.delete<void>(`/collections/${colId}/remove/${contentId}`);
  },
  toggleFavorite(contentId: string): Promise<{ favorited: boolean }> {
    return api.post<{ favorited: boolean }>(`/collections/favorite/${contentId}`);
  },
  favorites(page = 1, page_size = 20, brainId?: string | null): Promise<{ items: any[]; total: number }> {
    const qs = new URLSearchParams({ page: String(page), page_size: String(page_size) });
    if (brainId) qs.set("brain_id", brainId);
    return api.get(`/collections/favorites?${qs.toString()}`);
  },
};
