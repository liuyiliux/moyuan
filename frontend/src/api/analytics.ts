import { api } from "./provider";

// ─── Types ───

export interface AnalyticsOverview {
  total_contents: number;
  total_storage_bytes: number;
  total_storage_mb: number;
  embedded: number;
  by_type: Record<string, number>;
}

export interface TagStat {
  name: string;
  color: string;
  count: number;
}

export interface SearchTrend {
  query: string;
  count: number;
}

export interface GrowthStat {
  week: string;
  count: number;
}

// ─── Analytics API ───

export const analyticsApi = {
  overview: () => api.get<AnalyticsOverview>("/analytics/overview"),
  tags: (limit = 20) => api.get<{ tags: TagStat[] }>(`/analytics/tags?limit=${limit}`),
  searchTrends: (limit = 20) => api.get<{ trends: SearchTrend[] }>(`/analytics/search-trends?limit=${limit}`),
  growth: () => api.get<{ growth: GrowthStat[] }>("/analytics/growth"),
};
