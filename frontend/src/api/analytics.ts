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

export interface SearchDailyTrend {
  day: string;
  count: number;
}

export interface GrowthStat {
  week: string;
  count: number;
}

// ─── Analytics API ───

export const analyticsApi = {
  overview: (brainId?: string | null) =>
    api.get<AnalyticsOverview>(`/analytics/overview${brainId ? `?brain_id=${brainId}` : ""}`),
  tags: (limit = 20, brainId?: string | null) =>
    api.get<{ tags: TagStat[] }>(`/analytics/tags?limit=${limit}${brainId ? `&brain_id=${brainId}` : ""}`),
  searchTrends: (limit = 20, days = 30, brainId?: string | null) =>
    api.get<{ trends: SearchTrend[]; daily: SearchDailyTrend[]; days: number }>(
      `/analytics/search-trends?limit=${limit}&days=${days}${brainId ? `&brain_id=${brainId}` : ""}`
    ),
  growth: (brainId?: string | null) =>
    api.get<{ growth: GrowthStat[] }>(`/analytics/growth${brainId ? `?brain_id=${brainId}` : ""}`),
};
