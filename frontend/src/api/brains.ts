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
  provider_id?: string;
}

// ── Brain API ──

export const brainApi = {
  list: (archived = false) => api.get<Brain[]>(`/brains?archived=${archived}`),
  get: (id: string) => api.get<Brain>(`/brains/${id}`),
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