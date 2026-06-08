import { api } from "./provider";

// ── Types ──

export interface Brain {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  is_default: boolean;
  archived: boolean;
  config: Record<string, string> | null;
  content_count: number;
  created_at: string;
  updated_at: string;
}

export interface BrainCreate {
  name: string;
  description?: string;
  icon?: string;
  template?: "blank" | "study";
}

export interface BrainUpdate {
  name?: string;
  description?: string;
  icon?: string;
}

export interface BrainConfig {
  embedding_model?: string;
  summarize_model?: string;
  quiz_model?: string;
  qa_model?: string;
  judge_model?: string;
  provider_id?: string;
}

export interface BrainOverview {
  brain: Brain;
  stats: {
    total_contents: number;
    storage_bytes: number;
    by_status: Record<string, number>;
    by_type: Record<string, number>;
    categories: number;
    tags: number;
    collections: number;
  };
  study: {
    total: number;
    completed: number;
    in_progress: number;
    not_started: number;
    progress_percent: number;
  };
  resume_content: {
    id: string;
    title: string;
    content_type: string;
    processing_status: string;
    study_status: string;
    collection_id: string | null;
    collection_name: string | null;
    updated_at: string | null;
  } | null;
  recent_contents: Array<{
    id: string;
    title: string;
    content_type: string;
    processing_status: string;
    file_size: number | null;
    created_at: string | null;
    updated_at: string | null;
  }>;
}

// ── Brain API ──

export const brainApi = {
  list: (archived = false) => api.get<Brain[]>(`/brains?archived=${archived}`),
  get: (id: string) => api.get<Brain>(`/brains/${id}`),
  getOverview: (id: string) => api.get<BrainOverview>(`/brains/${id}/overview`),
  create: (data: BrainCreate) => api.post<Brain>("/brains", data),
  update: (id: string, data: BrainUpdate) => api.put<Brain>(`/brains/${id}`, data),
  delete: (id: string) => api.delete<void>(`/brains/${id}`),
  archive: (id: string) => api.post<void>(`/brains/${id}/archive`),
  restore: (id: string) => api.post<void>(`/brains/${id}/restore`),
  getConfig: (id: string) => api.get<BrainConfig>(`/brains/${id}/config`),
  updateConfig: (id: string, config: BrainConfig) => api.put<void>(`/brains/${id}/config`, config),
};

// ── Current Brain Management ──

const BRAIN_STORAGE_KEY = "moyuan_current_brain_id";

export function getCurrentBrainId(): string | null {
  return localStorage.getItem(BRAIN_STORAGE_KEY);
}

export function setCurrentBrainId(id: string): void {
  localStorage.setItem(BRAIN_STORAGE_KEY, id);
}
