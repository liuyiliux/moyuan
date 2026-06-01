import { useState, useEffect, useCallback } from "react";
import type { ProviderConfig, FunctionBindings } from "../../api/provider";
import { providerApi } from "../../api/provider";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { ProviderModal } from "../../components/ProviderModal";
import ConfirmDialog from "../../components/ConfirmDialog";
import { Check, Plus, Pencil, Trash2, Loader2, Server, Settings2, HardDrive, AlertCircle, CheckCircle2, X, Zap, BarChart3, RefreshCw } from "lucide-react";

const FUNCTION_LABELS: Record<string, string> = {
  summarize: "摘要生成",
  embedding: "嵌入向量",
  chunking: "智能分块",
  quiz: "题库生成",
  ocr: "图文识别",
  transcribe: "语音转写",
};

export default function SettingsPage() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [bindings, setBindings] = useState<FunctionBindings | null>(null);
  const [bindingDrafts, setBindingDrafts] = useState<FunctionBindings | null>(null);
  const [editingBinding, setEditingBinding] = useState<string | null>(null);
  const [savingBinding, setSavingBinding] = useState<string | null>(null);
  const [bindingMsg, setBindingMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderConfig | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"providers" | "bindings" | "storage" | "embeddings">("providers");

  // Storage config
  const [storageConfig, setStorageConfig] = useState<{
    storage_root: string;
    exists: boolean;
    disk_total: number;
    disk_used: number;
    disk_free: number;
  } | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storagePath, setStoragePath] = useState("");
  const [storageMsg, setStorageMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Embedding stats
  const [embedStats, setEmbedStats] = useState<{
    total_text_contents: number;
    text_embedded: number;
    text_pending: number;
    image_embedded: number;
    embedding_dimension: number;
  } | null>(null);
  const [embedLoading, setEmbedLoading] = useState(false);
  const [embedMsg, setEmbedMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [providersData, bindingsData] = await Promise.all([
        providerApi.list(),
        providerApi.getBindings(),
      ]);
      setProviders(providersData);
      setBindings(bindingsData);
      setBindingDrafts(bindingsData);
    } catch (e) {
      console.error("Failed to load settings:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStorageConfig = useCallback(async () => {
    setStorageLoading(true);
    setStorageMsg(null);
    try {
      const res = await fetch("/api/storage/config");
      const data = await res.json();
      setStorageConfig(data);
      setStoragePath(data.storage_root);
    } catch (e) {
      console.error("Failed to load storage config:", e);
    } finally {
      setStorageLoading(false);
    }
  }, []);

  const handleUpdateStorage = async () => {
    setStorageLoading(true);
    setStorageMsg(null);
    try {
      const formData = new FormData();
      formData.append("path", storagePath);
      const res = await fetch("/api/storage/config", { method: "PUT", body: formData });
      const data = await res.json();
      if (res.ok) {
        setStorageConfig(data);
        setStorageMsg({ type: "success", text: data.note || "存储路径已更新" });
      } else {
        setStorageMsg({ type: "error", text: data.detail || "更新失败" });
      }
    } catch (e) {
      setStorageMsg({ type: "error", text: (e as Error).message });
    } finally {
      setStorageLoading(false);
    }
  };

  const loadEmbedStats = useCallback(async () => {
    setEmbedLoading(true);
    try {
      const res = await fetch("/api/embeddings/stats");
      const data = await res.json();
      setEmbedStats(data);
    } catch (e) {
      console.error("Failed to load embed stats:", e);
    } finally {
      setEmbedLoading(false);
    }
  }, []);

  const handleReindex = async () => {
    if (!confirm("确定要重新索引所有内容吗？这将清空现有嵌入并重新生成。")) return;
    setEmbedLoading(true);
    setEmbedMsg(null);
    try {
      const res = await fetch("/api/embeddings/reindex", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setEmbedMsg({ type: "success", text: `已清空 ${data.cleared} 条，已入队 ${data.queued} 条` });
      } else {
        setEmbedMsg({ type: "error", text: data.detail || "操作失败" });
      }
    } catch (e) {
      setEmbedMsg({ type: "error", text: (e as Error).message });
    } finally {
      setEmbedLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleEdit = (p: ProviderConfig) => {
    setEditingProvider(p);
    setModalOpen(true);
  };

  const handleCreate = () => {
    setEditingProvider(null);
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await providerApi.delete(id);
      setProviders((prev) => prev.filter((p) => p.id !== id));
      setDeleteConfirm(null);
    } catch (e) {
      console.error("Delete failed:", e);
    }
  };

  const handleModalSaved = () => {
    setModalOpen(false);
    setEditingProvider(null);
    fetchData();
  };

  const handleEditBinding = (fn: string) => {
    if (!bindings) return;
    setBindingDrafts(bindings);
    setEditingBinding(fn);
    setBindingMsg(null);
  };

  const handleCancelBinding = () => {
    setBindingDrafts(bindings);
    setEditingBinding(null);
    setBindingMsg(null);
  };

  const handleBindingDraftChange = (fn: string, field: "provider_id" | "model", value: string | null) => {
    if (!bindingDrafts) return;
    const updated = {
      bindings: {
        ...bindingDrafts.bindings,
        [fn]: {
          ...bindingDrafts.bindings[fn],
          [field]: value || null,
        },
      },
    };
    setBindingDrafts(updated);
  };

  const handleSaveBinding = async (fn: string) => {
    if (!bindingDrafts) return;
    setSavingBinding(fn);
    setBindingMsg(null);
    try {
      const saved = await providerApi.updateBindings(bindingDrafts);
      setBindings(saved);
      setBindingDrafts(saved);
      setEditingBinding(null);
      setBindingMsg({ type: "success", text: "功能绑定已保存" });
    } catch (e) {
      console.error("Failed to update bindings:", e);
      setBindingMsg({ type: "error", text: (e as Error).message || "保存失败" });
    } finally {
      setSavingBinding(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Delete Confirm */}
      <ConfirmDialog
        open={deleteConfirm !== null}
        title="删除服务提供商"
        message="确定要删除此服务提供商配置吗？此操作不可恢复。"
        confirmLabel="确认删除"
        variant="danger"
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
      />

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">设置</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">管理 AI 服务提供商和功能配置</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 bg-[var(--bg-secondary)] rounded-lg w-fit">
          <button
            onClick={() => setActiveTab("providers")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === "providers"
                ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Server className="w-4 h-4" /> 服务提供商
          </button>
          <button
            onClick={() => setActiveTab("bindings")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === "bindings"
                ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Settings2 className="w-4 h-4" /> 功能绑定
          </button>
          <button
            onClick={() => { setActiveTab("storage"); loadStorageConfig(); }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === "storage"
                ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <HardDrive className="w-4 h-4" /> 存储配置
          </button>
          <button
            onClick={() => { setActiveTab("embeddings"); loadEmbedStats(); }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === "embeddings"
                ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Zap className="w-4 h-4" /> 嵌入管理
          </button>
        </div>

        {/* Providers Tab */}
        {activeTab === "providers" && (
          <>
            <div className="flex justify-end mb-4">
              <Button onClick={handleCreate}>
                <Plus className="w-4 h-4" /> 新增提供商
              </Button>
            </div>

            {providers.length === 0 ? (
              <div className="text-center py-16 bg-[var(--bg-card)] dark:bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] dark:border-[var(--border-subtle)]">
                <Server className="w-12 h-12 mx-auto text-[var(--text-muted)] dark:text-[var(--text-secondary)] mb-4" />
                <p className="text-[var(--text-muted)] dark:text-[var(--text-muted)]">暂无配置的服务提供商</p>
                <p className="text-sm text-[var(--text-muted)] dark:text-[var(--text-muted)] mt-1">点击上方按钮添加第一个提供商</p>
              </div>
            ) : (
              <div className="space-y-3">
                {providers.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-4 bg-[var(--bg-card)] dark:bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] dark:border-[var(--border-subtle)]"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-[var(--bg-secondary)] dark:bg-[var(--bg-elevated)] flex items-center justify-center">
                        <Server className="w-5 h-5 text-[var(--text-muted)]" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-[var(--text-primary)] dark:text-[var(--text-primary)]">{p.name}</h3>
                          <Badge variant={p.is_active ? "success" : "error"}>
                            {p.is_active ? "启用" : "禁用"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text-muted)]">
                          <span>{p.provider_type}</span>
                          {p.base_url && <span>{p.base_url}</span>}
                          {p.api_key_masked && (
                            <span className="font-mono text-[var(--text-muted)]">{p.api_key_masked}</span>
                          )}
                        </div>
                        {p.default_models && Object.keys(p.default_models).length > 0 && (
                          <div className="flex gap-2 mt-2">
                            {Object.entries(p.default_models).map(([fn, model]) => (
                              <Badge key={fn} variant="default" className="text-xs">
                                {FUNCTION_LABELS[fn] || fn}: {model}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(p)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(p.id)}>
                        <Trash2 className="w-4 h-4 text-[var(--danger)]" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Bindings Tab */}
        {activeTab === "bindings" && bindings && bindingDrafts && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-muted)]">
              为每个功能选择默认使用的服务提供商和模型
            </p>
            {bindingMsg && (
              <div
                className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
                  bindingMsg.type === "success"
                    ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
                    : "bg-[var(--danger-soft)] dark:bg-red-900/20 text-red-700 dark:text-red-400"
                }`}
              >
                {bindingMsg.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                {bindingMsg.text}
              </div>
            )}
            {Object.entries(bindings.bindings).map(([fn, binding]) => (
              <div
                key={fn}
                className="p-4 bg-[var(--bg-card)] dark:bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] dark:border-[var(--border-subtle)]"
              >
                <div className="grid grid-cols-[96px_minmax(140px,180px)_minmax(260px,1fr)_88px] items-center gap-4">
                  <Badge variant="default" className="w-24 justify-center text-sm py-1">
                    {FUNCTION_LABELS[fn] || fn}
                  </Badge>
                  <select
                    value={(bindingDrafts.bindings[fn] || binding).provider_id || ""}
                    disabled={editingBinding !== fn || savingBinding === fn}
                    onChange={(e) => handleBindingDraftChange(fn, "provider_id", e.target.value || null)}
                    className="taste-input w-full min-w-0"
                  >
                    <option value="">选择提供商...</option>
                    {providers.filter((p) => p.is_active).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <input
                    value={(bindingDrafts.bindings[fn] || binding).model || ""}
                    disabled={editingBinding !== fn || savingBinding === fn}
                    onChange={(e) => handleBindingDraftChange(fn, "model", e.target.value || null)}
                    placeholder="模型名称"
                    className="taste-input w-full min-w-0"
                  />
                  {editingBinding === fn ? (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSaveBinding(fn)}
                        disabled={savingBinding === fn}
                      >
                        {savingBinding === fn ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCancelBinding}
                        disabled={savingBinding === fn}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => handleEditBinding(fn)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Storage Tab */}
        {activeTab === "storage" && (
          <div className="space-y-6">
            {storageLoading && !storageConfig && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--text-muted)]" />
              </div>
            )}

            {storageConfig && (
              <>
                {/* 磁盘使用情况 */}
                <div className="p-6 bg-[var(--bg-card)] dark:bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] dark:border-[var(--border-subtle)]">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-4">磁盘使用</h3>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: "总容量", value: storageConfig.disk_total },
                      { label: "已使用", value: storageConfig.disk_used },
                      { label: "可用", value: storageConfig.disk_free },
                    ].map((item) => (
                      <div key={item.label} className="text-center">
                        <p className="text-xs text-[var(--text-muted)] dark:text-[var(--text-muted)]">{item.label}</p>
                        <p className="text-lg font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] font-mono">
                          {item.value > 0 ? (item.value / 1024 / 1024 / 1024).toFixed(1) + " GB" : "-"}
                        </p>
                      </div>
                    ))}
                  </div>
                  {/* 使用率进度条 */}
                  {storageConfig.disk_total > 0 && (
                    <div className="mt-4">
                      <div className="w-full h-2 bg-[var(--bg-secondary)] dark:bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[var(--accent)] rounded-full transition-all"
                          style={{ width: `${(storageConfig.disk_used / storageConfig.disk_total) * 100}%` }}
                        />
                      </div>
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        使用率 {((storageConfig.disk_used / storageConfig.disk_total) * 100).toFixed(1)}%
                      </p>
                    </div>
                  )}
                </div>

                {/* 存储路径配置 */}
                <div className="p-6 bg-[var(--bg-card)] dark:bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] dark:border-[var(--border-subtle)]">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-4">存储路径</h3>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-[var(--text-muted)] dark:text-[var(--text-muted)]">
                      <span className="text-[var(--text-muted)]">当前路径：</span>
                      <code className="px-2 py-0.5 bg-[var(--bg-secondary)] dark:bg-[var(--bg-elevated)] rounded text-xs font-mono text-[var(--text-secondary)] dark:text-[var(--text-muted)]">
                        {storageConfig.storage_root}
                      </code>
                      {storageConfig.exists ? (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> 可用
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--danger)] dark:text-red-400 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> 不可用
                        </span>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={storagePath}
                        onChange={(e) => setStoragePath(e.target.value)}
                        placeholder="输入新的存储路径..."
                        className="taste-input flex-1"
                      />
                      <button
                        onClick={handleUpdateStorage}
                        disabled={storageLoading || storagePath === storageConfig.storage_root}
                        className="taste-btn-primary text-sm"
                      >
                        {storageLoading ? "更新中..." : "更新路径"}
                      </button>
                    </div>

                    {storageMsg && (
                      <div
                        className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
                          storageMsg.type === "success"
                            ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
                            : "bg-[var(--danger-soft)] dark:bg-red-900/20 text-red-700 dark:text-red-400"
                        }`}
                      >
                        {storageMsg.type === "success" ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : (
                          <AlertCircle className="w-4 h-4" />
                        )}
                        {storageMsg.text}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Embeddings Tab */}
        {activeTab === "embeddings" && (
          <div className="space-y-6">
            {embedLoading && !embedStats && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--text-muted)]" />
              </div>
            )}

            {embedStats && (
              <>
                {/* 统计卡片 */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: "含文本内容", value: embedStats.total_text_contents },
                    { label: "已嵌入", value: embedStats.text_embedded, color: "text-emerald-600" },
                    { label: "待嵌入", value: embedStats.text_pending, color: "text-[var(--warning)]" },
                    { label: "嵌入维度", value: embedStats.embedding_dimension },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="p-4 bg-[var(--bg-card)] dark:bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] dark:border-[var(--border-subtle)] text-center"
                    >
                      <p className={`text-2xl font-bold font-mono ${item.color || "text-[var(--text-primary)] dark:text-[var(--text-primary)]"}`}>
                        {item.value}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] dark:text-[var(--text-muted)] mt-1">{item.label}</p>
                    </div>
                  ))}
                </div>

                {/* 进度条 */}
                <div className="p-6 bg-[var(--bg-card)] dark:bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] dark:border-[var(--border-subtle)]">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-4">
                    文本嵌入进度
                  </h3>
                  {embedStats.total_text_contents > 0 ? (
                    <>
                      <div className="w-full h-3 bg-[var(--bg-secondary)] dark:bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{
                            width: `${(embedStats.text_embedded / embedStats.total_text_contents) * 100}%`,
                          }}
                        />
                      </div>
                      <div className="flex justify-between mt-2 text-xs text-[var(--text-muted)]">
                        <span>
                          {embedStats.text_embedded} / {embedStats.total_text_contents} 已嵌入
                        </span>
                        <span>
                          {((embedStats.text_embedded / embedStats.total_text_contents) * 100).toFixed(1)}%
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-[var(--text-muted)]">暂无文本内容</p>
                  )}
                </div>

                {/* 重新索引按钮 */}
                <div className="p-6 bg-[var(--bg-card)] dark:bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] dark:border-[var(--border-subtle)]">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-4">索引管理</h3>
                  <p className="text-sm text-[var(--text-muted)] dark:text-[var(--text-muted)] mb-4">
                    当更换嵌入模型或需要重建索引时，可以清空现有嵌入并重新生成。
                  </p>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={handleReindex}
                      disabled={embedLoading}
                      className="taste-btn-primary text-sm flex items-center gap-2"
                    >
                      {embedLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <BarChart3 className="w-4 h-4" />
                      )}
                      重建索引
                    </button>
                    <button
                      onClick={loadEmbedStats}
                      disabled={embedLoading}
                      className="taste-btn-ghost text-sm flex items-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" /> 刷新统计
                    </button>
                  </div>
                  {embedMsg && (
                    <div
                      className={`mt-4 flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
                        embedMsg.type === "success"
                          ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
                          : "bg-[var(--danger-soft)] dark:bg-red-900/20 text-red-700 dark:text-red-400"
                      }`}
                    >
                      {embedMsg.type === "success" ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <AlertCircle className="w-4 h-4" />
                      )}
                      {embedMsg.text}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      <ProviderModal
        open={modalOpen}
        provider={editingProvider}
        onClose={() => { setModalOpen(false); setEditingProvider(null); }}
        onSaved={handleModalSaved}
      />
    </div>
  );
}
