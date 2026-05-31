const BASE_URL = "/api";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (res.status === 204) return undefined as T;

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(data) }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(data) }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(data) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

// ── Types ──

export interface ProviderConfig {
  id: string;
  name: string;
  provider_type: "openai" | "tencent_ocr" | "tencent_ima" | "custom";
  base_url: string | null;
  api_key_masked: string | null;
  default_models: Record<string, string> | null;
  extra_params: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProviderCreate {
  name: string;
  provider_type: string;
  base_url?: string;
  api_key?: string;
  default_models?: Record<string, string>;
  extra_params?: Record<string, unknown>;
}

export interface ProviderUpdate {
  name?: string;
  provider_type?: string;
  base_url?: string;
  api_key?: string;
  default_models?: Record<string, string>;
  extra_params?: Record<string, unknown>;
  is_active?: boolean;
}

export interface TestResult {
  success: boolean;
  message: string;
  latency_ms: number | null;
}

export interface FunctionBinding {
  function: string;
  provider_id: string | null;
  model: string | null;
  extra_params: Record<string, unknown> | null;
}

export interface FunctionBindings {
  bindings: Record<string, FunctionBinding>;
}

// ── Provider API ──

export const providerApi = {
  list: () => api.get<ProviderConfig[]>("/providers"),
  get: (id: string) => api.get<ProviderConfig>(`/providers/${id}`),
  create: (data: ProviderCreate) => api.post<ProviderConfig>("/providers", data),
  update: (id: string, data: ProviderUpdate) => api.put<ProviderConfig>(`/providers/${id}`, data),
  delete: (id: string) => api.delete<void>(`/providers/${id}`),
  test: (id: string) => api.post<TestResult>(`/providers/${id}/test`),
  getBindings: () => api.get<FunctionBindings>("/providers/bindings"),
  updateBindings: (data: FunctionBindings) => api.put<FunctionBindings>("/providers/bindings", data),
};
