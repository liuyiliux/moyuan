import { api } from "./provider";

export interface MaintenanceSummary {
  orphan_files: {
    count: number;
    bytes: number;
    samples: Array<{ path: string; size: number }>;
  };
  test_data: {
    providers: number;
    bindings: number;
  };
  invalid_config: {
    bindings: number;
  };
  unassigned: {
    total: number;
    active: number;
    deleted: number;
  };
  recycle: {
    deleted: number;
  };
  processing: {
    stuck_contents: number;
    stale_tasks: number;
  };
}

export const maintenanceApi = {
  summary: () => api.get<MaintenanceSummary>("/maintenance/summary"),
  action: (action: "cleanup_orphans" | "cleanup_test_config") =>
    api.post<Record<string, unknown>>("/maintenance/actions", { action }),
};
