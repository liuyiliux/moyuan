const BASE_URL = "/api";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (res.status === 204) return undefined as T;

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }

  return res.json();
}

const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(data) }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(data) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

// ─── Types ───

export interface Collection {
  id: string;
  name: string;
  description: string | null;
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

export interface CollectionCreate {
  name: string;
  description?: string;
}

export interface CollectionUpdate {
  name?: string;
  description?: string;
}

// ─── Collections API ───

export const collectionsApi = {
  list: (page = 1, pageSize = 20) =>
    api.get<Collection[]>(`/collections?page=${page}&page_size=${pageSize}`),
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
