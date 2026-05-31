import { api } from "./provider";

// ── Types ──

export interface SearchResultItem {
  id: string;
  title: string;
  content_type: string;
  file_size: number | null;
  created_at: string | null;
  snippet: string;
  score: number;
  vector_score: number | null;
}

export interface SearchResponse {
  results: SearchResultItem[];
  total: number;
  took_ms: number;
  query: string;
}

export interface SearchHistoryItem {
  id: string;
  query: string;
  result_count: number;
  took_ms: number;
  created_at: string;
}

// ── API ──

export const searchApi = {
  /** 语义 / 关键词混合搜索 */
  search: (params: {
    query: string;
    top_k?: number;
    content_type?: string | null;
    enable_vector?: boolean;
    enable_keyword?: boolean;
  }): Promise<SearchResponse> =>
    api.post<SearchResponse>("/search", {
      query: params.query,
      top_k: params.top_k ?? 10,
      content_type: params.content_type,
      enable_vector: params.enable_vector ?? true,
      enable_keyword: params.enable_keyword ?? true,
    }),

  /** 搜索历史 */
  getHistory: (params?: { page?: number; page_size?: number }) =>
    api.get<{ items: SearchHistoryItem[]; total: number; page: number }>(
      `/search/history?page=${params?.page ?? 1}&page_size=${params?.page_size ?? 20}`
    ),

  /** 删除单条历史 */
  deleteHistory: (id: string) =>
    api.delete<void>(`/search/history/${id}`),
};
