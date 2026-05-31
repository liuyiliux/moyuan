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

export const backupApi = {
  /** 列出所有备份 */
  list: () => api.get<{ backups: BackupItem[] }>("/backup"),

  /** 创建备份 */
  create: () => api.post<BackupCreated>("/backup"),

  /** 删除指定备份 */
  delete: (filename: string) => api.delete<{ ok: boolean }>(`/backup/${encodeURIComponent(filename)}`),

  /** 导出完整知识库 */
  export: () => api.post<BackupCreated>("/backup/export"),
};
