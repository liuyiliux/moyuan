import { api } from "./provider";

/** 单条内容关系 */
export interface ContentRelation {
  id: string;
  source_id: string;
  target_id: string;
  relation_type: "reference" | "series" | "similar";
  sort_order: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/** 带目标内容摘要的关系 */
export interface RelationWithContent extends ContentRelation {
  target_title: string;
  target_type: string;
}

export interface RelationSuggestion {
  id: string;
  title: string;
  content_type: string;
  similarity: number;
  reason: string;
}

/** 系列导航信息 */
export interface SeriesInfo {
  series_name: string;
  current_index: number;
  total: number;
  prev: { id: string; title: string } | null;
  next: { id: string; title: string } | null;
  items: { id: string; title: string; sort_order: number }[];
}

/** 图谱节点数据（由 KnowledgeGraph 内部使用） */
export interface GraphNode {
  id: string;
  title: string;
  content_type: string;
  isCenter: boolean;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

/** 图谱连线数据（由 KnowledgeGraph 内部使用） */
export interface GraphLink {
  source: string;
  target: string;
  relation_type: string;
  label: string;
}

/** 创建关系请求体 */
export interface CreateRelationPayload {
  source_id: string;
  target_id: string;
  relation_type: string;
  sort_order?: number;
  metadata?: Record<string, unknown>;
}

// ── Relations API ──

export const relationApi = {
  /** 获取指定内容的所有关系（可按类型过滤） */
  list: (contentId: string, type?: string): Promise<RelationWithContent[]> => {
    const qs = type
      ? `?content_id=${contentId}&type=${type}`
      : `?content_id=${contentId}`;
    return api.get<RelationWithContent[]>(`/relations${qs}`);
  },

  /** 创建一条新关系 */
  create: (data: CreateRelationPayload): Promise<ContentRelation> =>
    api.post<ContentRelation>("/relations", data),

  /** 获取待确认的相似关联建议 */
  suggestions: (contentId: string, limit = 5): Promise<RelationSuggestion[]> =>
    api.get<RelationSuggestion[]>(`/relations/suggestions?content_id=${contentId}&limit=${limit}`),

  /** 删除一条关系 */
  delete: (id: string): Promise<void> =>
    api.delete<void>(`/relations/${id}`),

  /** 获取系列导航信息 */
  getSeries: (contentId: string): Promise<SeriesInfo> =>
    api.get<SeriesInfo>(`/relations/series?content_id=${contentId}`),
};
