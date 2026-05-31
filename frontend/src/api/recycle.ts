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
    request<T>(path, { method: "POST", body: data ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

// ─── Types ───

export interface RecycleItem {
  id: string;
  title: string;
  content_type: string;
  file_size: number;
  created_at: string;
  deleted_at: string;
}

export interface RecycleListResponse {
  items: RecycleItem[];
  total: number;
  page: number;
  page_size: number;
}

// ─── Recycle API ───

export const recycleApi = {
  list: (page = 1, pageSize = 20) =>
    api.get<RecycleListResponse>(`/recycle?page=${page}&page_size=${pageSize}`),
  restore: (contentId: string) =>
    api.post<RecycleItem>(`/recycle/${contentId}/restore`),
  permanentDelete: (contentId: string) =>
    api.delete<{ status: string; id: string }>(`/recycle/${contentId}/permanent`),
  cleanup: (days = 30) =>
    api.post<{ status: string; deleted_count: number; cutoff_date: string }>(`/recycle/cleanup?days=${days}`),
};
