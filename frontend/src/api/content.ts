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
  text_embedding: number[] | null;
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
}

export interface ContentUpdate {
  title?: string;
  text_content?: string | null;
  is_starred?: boolean;
  is_pinned?: boolean;
  brain_id?: string | null;
}

export interface DuplicateInfo {
  id: string;
  title: string;
  content_type: string;
  file_size: number | null;
  created_at: string | null;
}

export interface DeletedItem {
  id: string;
  title: string;
  content_type: string;
  file_size: number;
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

// ── API ──

export const fileApi = {
  /** 上传文件 */
  upload: async (file: File, brainId?: string): Promise<FileUploadResponse> => {
    const formData = new FormData();
    formData.append("file", file);
    if (brainId) {
      formData.append("brain_id", brainId);
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
    is_deleted?: boolean;
    page?: number;
    page_size?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.content_type) searchParams.set("content_type", params.content_type);
    if (params?.brain_id) searchParams.set("brain_id", params.brain_id);
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
  checkDuplicate: async (file: File): Promise<DuplicateCheckResponse> => {
    const formData = new FormData();
    formData.append("file", file);
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
  getDeleted: (page?: number, page_size?: number) => {
    const searchParams = new URLSearchParams();
    searchParams.set("is_deleted", "true");
    if (page) searchParams.set("page", String(page));
    if (page_size) searchParams.set("page_size", String(page_size));
    const qs = searchParams.toString();
    return api.get<{ items: DeletedItem[]; total: number }>(`/files?${qs}`);
  },

  /** 恢复已删除文件 */
  restore: (id: string) => api.post<void>(`/files/${id}/restore`),

  /** 永久删除文件 */
  permanentDelete: (id: string) => api.delete<void>(`/files/${id}/permanent`),

  /** 批量操作 */
  batch: (ids: string[], action: string) => api.post<void>("/contents/batch", { ids, action }),
};

export const contentApi = {
  /** 创建内容 */
  create: (data: ContentCreate) => api.post<FileItem>("/contents", data),

  /** 更新内容 */
  update: (id: string, data: ContentUpdate) =>
    api.patch<FileItem>(`/contents/${id}`, data),

  /** 置顶/取消置顶 */
  pin: (id: string) => api.post<{ is_pinned: boolean }>(`/contents/${id}/pin`),
};
