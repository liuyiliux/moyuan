import { api } from "./provider";

export interface Collection {
  id: string;
  name: string;
  description: string | null;
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
}

export interface CollectionCreate {
  name: string;
  description?: string;
  brain_id?: string | null;
}

export interface CollectionUpdate {
  name?: string;
  description?: string;
}

export const collectionsApi = {
  list: (
    page = 1,
    pageSize = 20,
    options?: {
      brainId?: string | null;
      q?: string;
      progress?: "all" | "not_done" | "in_progress" | "completed";
    },
  ) => {
    const qs = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (options?.brainId) qs.set("brain_id", options.brainId);
    if (options?.q?.trim()) qs.set("q", options.q.trim());
    if (options?.progress && options.progress !== "all") qs.set("progress", options.progress);
    return api.get<CollectionListResponse>(`/collections?${qs.toString()}`);
  },

  get: (id: string) =>
    api.get<{ collection: Collection; items: CollectionItem[] }>(`/collections/${id}`),

  create: (data: CollectionCreate) =>
    api.post<Collection>("/collections", data),

  update: (id: string, data: CollectionUpdate) =>
    api.patch<Collection>(`/collections/${id}`, data),

  delete: (id: string) =>
    api.delete<{ ok: boolean }>(`/collections/${id}`),

  addItem: (colId: string, contentId: string) =>
    api.post<{ ok: boolean }>(`/collections/${colId}/add`, { content_id: contentId }),

  removeItem: (colId: string, contentId: string) =>
    api.delete<{ ok: boolean }>(`/collections/${colId}/remove/${contentId}`),
};
