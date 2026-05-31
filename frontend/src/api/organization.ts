import { api } from './provider';

// ── Types ──

export interface Tag {
  id: string;
  name: string;
  color?: string;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
  children?: Category[];
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  item_count: number;
  created_at: string;
}

export interface CollectionItem {
  id: string;
  content_id: string;
  title: string;
  content_type: string;
  sort_order: number;
  added_at: string;
}

// ── Tags API ──

export const tagApi = {
  create(name: string, color?: string): Promise<Tag> {
    return api.post<Tag>('/tags', { name, color });
  },
  list(page = 1, page_size = 50): Promise<Tag[]> {
    return api.get<Tag[]>(`/tags?page=${page}&page_size=${page_size}`);
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
  create(name: string, parentId?: string | null): Promise<Category> {
    return api.post<Category>('/categories', { name, parent_id: parentId ?? null });
  },
  tree(): Promise<Category[]> {
    return api.get<Category[]>('/categories/tree');
  },
  listAll(): Promise<Category[]> {
    return api.get<Category[]>('/categories');
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
  create(name: string, description?: string): Promise<Collection> {
    return api.post<Collection>('/collections', { name, description });
  },
  list(page = 1, page_size = 20): Promise<Collection[]> {
    return api.get<Collection[]>(`/collections?page=${page}&page_size=${page_size}`);
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
  favorites(page = 1, page_size = 20): Promise<{ items: any[]; total: number }> {
    return api.get(`/collections/favorites?page=${page}&page_size=${page_size}`);
  },
};
