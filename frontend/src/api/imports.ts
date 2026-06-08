import { api } from "./provider";

export interface ImportBatch {
  batch_id: string;
  import_root: string | null;
  total: number;
  active: number;
  deleted: number;
  failed: number;
  pending: number;
  ready_to_embed: number;
  processing: number;
  completed: number;
  created_at: string | null;
  updated_at: string | null;
  samples: Array<{
    id: string;
    title: string;
    content_type: string;
    processing_status: string;
  }>;
}

export interface ImportBatchResponse {
  items: ImportBatch[];
  total: number;
  page: number;
  page_size: number;
}

export const importsApi = {
  batches: (params?: { brainId?: string | null; page?: number; pageSize?: number }) => {
    const searchParams = new URLSearchParams({
      page: String(params?.page ?? 1),
      page_size: String(params?.pageSize ?? 20),
    });
    if (params?.brainId) searchParams.set("brain_id", params.brainId);
    return api.get<ImportBatchResponse>(`/imports/batches?${searchParams.toString()}`);
  },
  action: (batchId: string, action: "chunk_pending" | "embed_ready", brainId?: string | null) =>
    api.post<{ status: string; action: string; total: number; success: number; failed: unknown[] }>(
      `/imports/batches/${encodeURIComponent(batchId)}/actions`,
      { action, brain_id: brainId || undefined },
    ),
};
