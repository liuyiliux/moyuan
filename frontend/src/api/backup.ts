import { api } from "./provider";

export interface BackupItem {
  filename: string;
  size: number;
  created_at: string;
}

export interface BackupCreated {
  status: string;
  filename: string;
  size: number;
  created_at: string;
}

export interface BackupRestored {
  status: string;
  filename: string;
  mode: "all" | "files" | "config";
  restored_files: number;
  database_status: "missing" | "restored" | "failed" | "skipped";
  database_detail: string | null;
  config_status: "missing" | "restored" | "skipped";
  restored_config: {
    providers: number;
    function_bindings: number;
    brains: number;
  };
  storage_root: string;
}

export interface BackupInspection {
  filename: string;
  size: number;
  created_at: string;
  format_version: number | null;
  manifest: Record<string, unknown> | null;
  has_database_sql: boolean;
  file_count: number;
  provider_configs: number;
  function_bindings: number;
  brain_configs: number;
  api_keys_included: boolean | null;
  config_preview: {
    providers: BackupConfigPreview;
    function_bindings: BackupConfigPreview;
    brains: BackupConfigPreview;
  };
}

export interface BackupConfigPreview {
  new: number;
  overwrite: number;
  invalid: number;
}

export const backupApi = {
  /** 列出所有备份 */
  list: () => api.get<{ backups: BackupItem[] }>("/backup"),

  /** 创建备份 */
  create: () => api.post<BackupCreated>("/backup"),

  /** 删除指定备份 */
  delete: (filename: string) => api.delete<{ ok: boolean }>(`/backup/${encodeURIComponent(filename)}`),

  restore: (filename: string, mode: "all" | "files" | "config" = "all") =>
    api.post<BackupRestored>(`/backup/${encodeURIComponent(filename)}/restore?mode=${mode}`),

  inspect: (filename: string) => api.get<BackupInspection>(`/backup/${encodeURIComponent(filename)}/inspect`),

  /** 导出完整知识库 */
  export: () => api.post<BackupCreated>("/backup/export"),
};
