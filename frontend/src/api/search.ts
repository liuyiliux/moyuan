import { api } from "./provider";

export interface ChunkInfo {
  chunk_id: string | null;
  snippet: string;
  chunk_type: string | null;
  page_number: number | null;
  start_offset: number | null;
  end_offset: number | null;
  time_start: number | null;
  time_end: number | null;
  image_path: string | null;
  score: number | null;
}

export interface SearchResultItem {
  content_id: string;
  title: string;
  content_type: string;
  file_size: number | null;
  created_at: string | null;
  score: number;
  best_chunk: ChunkInfo;
  match_count: number;
  all_chunks: ChunkInfo[];
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
  created_at: string;
}

export const searchApi = {
  search: (params: {
    query: string;
    top_k?: number;
    content_type?: string | null;
    enable_vector?: boolean;
    enable_keyword?: boolean;
    search_mode?: string;
  }): Promise<SearchResponse> =>
    api.post<SearchResponse>("/search", {
      query: params.query,
      top_k: params.top_k ?? 10,
      content_type: params.content_type,
      enable_vector: params.enable_vector ?? true,
      enable_keyword: params.enable_keyword ?? true,
      search_mode: params.search_mode ?? "all",
    }),

  searchByImage: (file: File, params?: {
    top_k?: number;
    search_mode?: string;
    content_type?: string;
  }): Promise<SearchResponse> => {
    const formData = new FormData();
    formData.append("file", file);
    const qs = new URLSearchParams();
    if (params?.top_k) qs.set("top_k", String(params.top_k));
    if (params?.search_mode) qs.set("search_mode", params.search_mode);
    if (params?.content_type) qs.set("content_type", params.content_type);
    return api.post<SearchResponse>(`/search/image?${qs.toString()}`, formData);
  },

  getHistory: (params?: { page?: number; page_size?: number }) =>
    api.get<{ items: SearchHistoryItem[]; total: number; page: number }>(
      `/search/history?page=${params?.page ?? 1}&page_size=${params?.page_size ?? 20}`
    ),

  deleteHistory: (id: string) =>
    api.delete<void>(`/search/history/${id}`),
};
