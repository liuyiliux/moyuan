import { api } from "./provider";

// ── Types ──

export interface FileItem {
  id: string;
  title: string;
  content_type: "note" | "image" | "video" | "audio" | "pdf" | "doc" | "web" | "other";
  source_type: string;
  source_url: string | null;
  file_path: string | null;
  file_size: number | null;
  file_md5: string | null;
  text_content: string | null;
  embedding: number[] | null;
  embedding_type: string | null;
  processing_status: string;
  processing_error: string | null;
  is_starred: boolean;
  is_pinned: boolean;
  is_deleted: boolean;
  brain_id: string | null;
  extra_meta: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface FileListResponse {
  items: FileItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface FileUploadResponse {
  content_id: string;
  title: string;
  content_type: string;
  file_path: string | null;
  file_size: number | null;
  file_md5: string | null;
  is_duplicate: boolean;
}

export interface ContentCreate {
  title: string;
  content_type?: string;
  source_type?: string;
  source_url?: string | null;
  text_content?: string | null;
  brain_id?: string | null;
  extra_meta?: Record<string, unknown> | null;
}

export interface WebPreviewResponse {
  url: string;
  title: string;
  text_content: string;
  excerpt: string;
  text_length: number;
}

export interface ContentUpdate {
  title?: string;
  text_content?: string | null;
  is_starred?: boolean;
  is_pinned?: boolean;
  brain_id?: string | null;
  extra_meta?: Record<string, unknown> | null;
}

export interface DuplicateInfo {
  id: string;
  title: string;
  content_type: string;
  file_size: number | null;
  created_at: string | null;
  match_types?: string[];
}

export interface DeletedItem {
  id: string;
  title: string;
  content_type: string;
  file_size: number;
  brain_id?: string | null;
  deleted_at: string;
  created_at: string;
}

export interface DuplicateCheckResponse {
  file_md5: string;
  filename: string;
  file_size: number;
  is_duplicate: boolean;
  duplicates: DuplicateInfo[];
}

export interface ContentProcessStatus {
  id: string;
  processing_status: string;
  processing_error: string | null;
  has_text: boolean;
  has_embedding: boolean;
  chunk_count: number;
  text_chunks: number;
  image_chunks: number;
  embedded_chunks: number;
}

export interface ProcessingTaskSnapshot {
  id: string;
  task_type: string;
  status: string;
  priority: number;
  progress: number;
  error_message: string | null;
  created_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface ProcessingCenterItem {
  id: string;
  title: string;
  content_type: string;
  source_type: string;
  file_size: number | null;
  processing_status: string;
  processing_error: string | null;
  brain_id: string | null;
  chunk_count: number;
  embedded_chunks: number;
  created_at: string | null;
  updated_at: string | null;
  latest_task: ProcessingTaskSnapshot | null;
}

export interface ProcessingCenterResponse {
  queue_size: number;
  summary: {
    total: number;
    by_status: Record<string, number>;
    active: number;
    needs_action: number;
    completed: number;
    failed: number;
  };
  tasks: Record<string, number>;
  items: ProcessingCenterItem[];
  total: number;
  page: number;
  page_size: number;
}

// ── API ──

export const fileApi = {
  /** 上传文件 */
  upload: async (
    file: File,
    brainId?: string,
    overwriteContentId?: string,
    importRelativePath?: string,
    importBatchId?: string,
  ): Promise<FileUploadResponse> => {
    const formData = new FormData();
    formData.append("file", file);
    if (brainId) {
      formData.append("brain_id", brainId);
    }
    if (overwriteContentId) {
      formData.append("overwrite_content_id", overwriteContentId);
    }
    if (importRelativePath) {
      formData.append("import_relative_path", importRelativePath);
    }
    if (importBatchId) {
      formData.append("import_batch_id", importBatchId);
    }

    const res = await fetch("/api/files/upload", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(body.detail || `HTTP ${res.status}`);
    }

    return res.json();
  },

  /** 文件列表 */
  list: (params?: {
    content_type?: string;
    brain_id?: string;
    category_id?: string;
    processing_status?: string;
    study_status?: "not_started" | "in_progress" | "completed";
    q?: string;
    is_deleted?: boolean;
    page?: number;
    page_size?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.content_type) searchParams.set("content_type", params.content_type);
    if (params?.brain_id) searchParams.set("brain_id", params.brain_id);
    if (params?.category_id) searchParams.set("category_id", params.category_id);
    if (params?.processing_status) searchParams.set("processing_status", params.processing_status);
    if (params?.study_status) searchParams.set("study_status", params.study_status);
    if (params?.q) searchParams.set("q", params.q);
    if (params?.is_deleted) searchParams.set("is_deleted", "true");
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.page_size) searchParams.set("page_size", String(params.page_size));
    const qs = searchParams.toString();
    return api.get<FileListResponse>(`/files${qs ? `?${qs}` : ""}`);
  },

  /** 文件详情 */
  get: (id: string) => api.get<FileItem>(`/files/${id}`),

  /** 软删除 */
  delete: (id: string) => api.delete<FileItem>(`/files/${id}`),

  /** 检查重复 */
  checkDuplicate: async (
    file: File,
    brainId?: string | null,
    importRelativePath?: string,
  ): Promise<DuplicateCheckResponse> => {
    const formData = new FormData();
    formData.append("file", file);
    if (brainId) formData.append("brain_id", brainId);
    if (importRelativePath) formData.append("import_relative_path", importRelativePath);
    const res = await fetch("/api/files/check-duplicate", {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(body.detail || `HTTP ${res.status}`);
    }
    return res.json();
  },

  /** 获取已删除文件列表 */
  getDeleted: (page?: number, page_size?: number, brainId?: string | null) => {
    const searchParams = new URLSearchParams();
    searchParams.set("is_deleted", "true");
    if (brainId) searchParams.set("brain_id", brainId);
    if (page) searchParams.set("page", String(page));
    if (page_size) searchParams.set("page_size", String(page_size));
    const qs = searchParams.toString();
    return api.get<{ items: DeletedItem[]; total: number }>(`/files?${qs}`);
  },

  /** 恢复已删除文件 */
  restore: (id: string) => api.post<void>(`/files/${id}/restore`),

  /** 将内容加入解析队列 */
  enqueueProcessing: (id: string) => api.post<{ status: string; content_id: string; queue_size: number }>(`/files/${id}/enqueue`),

  /** 永久删除文件 */
  permanentDelete: (id: string) => api.delete<void>(`/files/${id}/permanent`),

  /** 批量操作 */
  batch: (ids: string[], action: string, brainId?: string | null) =>
    api.post<void>("/contents/batch", { ids, action, brain_id: brainId || undefined }),
};

export const contentApi = {
  /** 创建内容 */
  create: (data: ContentCreate) => api.post<FileItem>("/contents", data),

  previewWeb: (url: string) => api.post<WebPreviewResponse>("/contents/web-preview", { url }),

  /** 更新内容 */
  update: (id: string, data: ContentUpdate) =>
    api.patch<FileItem>(`/contents/${id}`, data),

  /** 批量更新学习状态 */
  batchStudyStatus: (
    ids: string[],
    status: "not_started" | "in_progress" | "completed",
    brainId?: string | null,
  ) =>
    api.post<{ status: string; updated: number }>("/contents/batch-study-status", {
      ids,
      status,
      brain_id: brainId || undefined,
    }),

  /** 批量移动工作区 */
  batchMove: (ids: string[], targetBrainId: string, brainId?: string | null) =>
    api.post<{ status: string; moved: number }>("/contents/batch-move", {
      ids,
      target_brain_id: targetBrainId,
      brain_id: brainId || undefined,
    }),

  /** 置顶/取消置顶 */
  pin: (id: string) => api.post<{ is_pinned: boolean }>(`/contents/${id}/pin`),

  /** 触发智能分块 */
  chunkContent: (id: string) => api.post<{ status: string; processing_status: string }>(`/contents/${id}/chunk`),

  /** 触发生成嵌入 */
  embedContent: (id: string) => api.post<{ status: string; processing_status: string }>(`/contents/${id}/embed`),

  /** 批量获取处理状态 */
  getStatuses: (ids: string[], brainId?: string | null) =>
    api.post<{ items: Record<string, ContentProcessStatus> }>("/contents/status-batch", {
      ids,
      brain_id: brainId || undefined,
    }),

  /** 批量触发智能分块 */
  batchChunk: (ids: string[], brainId?: string | null) =>
    api.post<{ status: string; total: number; success: number; failed: { content_id: string; error: string }[] }>(
      `/contents/batch-chunk${brainId ? `?brain_id=${brainId}` : ""}`,
      ids
    ),

  /** 批量触发生成嵌入 */
  batchEmbed: (ids: string[], brainId?: string | null) =>
    api.post<{ status: string; total: number; success: number; failed: { content_id: string; error: string }[] }>(
      `/contents/batch-embed${brainId ? `?brain_id=${brainId}` : ""}`,
      ids
    ),

  /** 获取内容分块 */
  getChunks: (id: string, page?: number, pageSize?: number) => api.get<{
    content_id: string;
    total: number;
    page: number;
    page_size: number;
    chunks: {
      id: string;
      chunk_index: number;
      chunk_type: string;
      chunk_text: string | null;
      embedding_type: string | null;
      page_number: number | null;
      start_offset: number | null;
      end_offset: number | null;
      time_start: number | null;
      time_end: number | null;
      image_path: string | null;
      has_embedding: boolean;
    }[];
  }>(`/contents/${id}/chunks${page ? `?page=${page}&page_size=${pageSize || 50}` : ""}`),

  /** 处理状态中心 */
  processingCenter: (params?: {
    brainId?: string | null;
    group?: "active" | "needs_action" | "failed" | "done" | "all";
    page?: number;
    pageSize?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.brainId) searchParams.set("brain_id", params.brainId);
    if (params?.group) searchParams.set("group", params.group);
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.pageSize) searchParams.set("page_size", String(params.pageSize));
    const qs = searchParams.toString();
    return api.get<ProcessingCenterResponse>(`/contents/processing-center${qs ? `?${qs}` : ""}`);
  },
};
