import { useState, useEffect, useCallback } from "react";
import type { ProviderConfig, FunctionBindings, ProviderDiagnostics } from "../../api/provider";
import { api, providerApi } from "../../api/provider";
import { brainApi, type BrainConfig } from "../../api/brains";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { ProviderModal } from "../../components/ProviderModal";
import ConfirmDialog from "../../components/ConfirmDialog";
import { settingsCopy, useCopy } from "../../lib/copywriting";
import { useBrain } from "../../lib/brain-context";
import { Check, Plus, Pencil, Trash2, Loader2, Server, Settings2, HardDrive, AlertCircle, CheckCircle2, X, Zap, BarChart3, RefreshCw, Activity, Eye, EyeOff } from "lucide-react";

const FUNCTION_LABELS: Record<string, string> = {
  summarize: "摘要生成",
  embedding: "嵌入向量",
  chunking: "智能分块",
  quiz: "题库生成",
  judge: "答题判断",
  ocr: "图文识别",
  transcribe: "语音转写",
  qa: "知识问答",
};

const DIAGNOSTIC_LABELS: Record<string, string> = {
  "Web text extraction": "网页正文提取",
  "Web screenshots": "网页截图",
  "Local transcription": "本地语音转写",
  "Video screenshots": "视频截图",
  Summarization: "摘要生成",
  Embeddings: "嵌入向量",
  "Semantic chunking": "智能分块",
  "Quiz generation": "题库生成",
  "Answer judging": "答题判断",
  "Image OCR": "图文识别",
  "Audio/video transcription": "语音转写",
  "Knowledge Q&A": "知识问答",
};

const DIAGNOSTIC_DETAILS: Record<string, string> = {
  "Install trafilatura to extract readable article text from web pages.": "请安装 trafilatura，用于从网页中提取可阅读正文。",
  "Install Playwright and browser binaries to capture web page screenshots.": "请安装 Playwright 和浏览器运行时，用于采集网页截图。",
  "Install faster-whisper to use local audio/video transcription.": "请安装 faster-whisper，用于本地音视频转写。",
  "Install ffmpeg and add it to PATH to capture video frames.": "请安装 ffmpeg 并加入 PATH，用于截取视频画面。",
  "No provider selected.": "未选择服务提供商。",
  "Selected provider no longer exists.": "选择的服务提供商已不存在。",
  "Selected provider is disabled.": "选择的服务提供商已停用。",
  "No model configured for this function.": "该功能未配置模型。",
};

function diagnosticLabel(value: string): string {
  return DIAGNOSTIC_LABELS[value] || value;
}

function diagnosticDetail(value: string | null): string | null {
  if (!value) return null;
  return DIAGNOSTIC_DETAILS[value] || value;
}

export default function SettingsPage() {
  const st = useCopy(settingsCopy);
  const { currentBrainId } = useBrain();
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
  const [visibleApiKeys, setVisibleApiKeys] = useState<Record<string, string | null>>({});
  const [loadingApiKey, setLoadingApiKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"providers" | "bindings" | "brain" | "storage" | "embeddings" | "diagnostics">("providers");
  const [brainConfig, setBrainConfig] = useState<BrainConfig>({});
  const [brainDraft, setBrainDraft] = useState<BrainConfig>({});
  const [brainConfigLoading, setBrainConfigLoading] = useState(false);
  const [brainConfigSaving, setBrainConfigSaving] = useState(false);
  const [brainConfigMsg, setBrainConfigMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Storage config
  const [storageConfig, setStorageConfig] = useState<{
    storage_root: string;
    exists: boolean;
    disk_total: number;
    disk_used: number;
    disk_free: number;
  } | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageMigrating, setStorageMigrating] = useState(false);
  const [storageCleaning, setStorageCleaning] = useState(false);
  const [orphanSummary, setOrphanSummary] = useState<{ count: number; bytes: number } | null>(null);
  const [storagePath, setStoragePath] = useState("");
  const [storageMsg, setStorageMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<"migrate_storage" | "cleanup_orphans" | "reindex" | null>(null);

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

  const [diagnostics, setDiagnostics] = useState<ProviderDiagnostics | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);

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

  const loadBrainConfig = useCallback(async () => {
    setBrainConfigMsg(null);
    if (!currentBrainId) {
      setBrainConfig({});
      setBrainDraft({});
      return;
    }
    setBrainConfigLoading(true);
    try {
      const data = await brainApi.getConfig(currentBrainId);
      setBrainConfig(data);
      setBrainDraft(data);
    } catch (e) {
      console.error("Failed to load brain config:", e);
      setBrainConfigMsg({ type: "error", text: (e as Error).message || "加载工作区模型配置失败" });
    } finally {
      setBrainConfigLoading(false);
    }
  }, [currentBrainId]);

  const loadStorageConfig = useCallback(async () => {
    setStorageLoading(true);
    setStorageMsg(null);
    try {
      const data = await api.get<NonNullable<typeof storageConfig>>("/storage/config");
      setStorageConfig(data);
      setStoragePath(data.storage_root);
    } catch (e) {
      console.error("Failed to load storage config:", e);
      setStorageMsg({ type: "error", text: (e as Error).message });
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
      const data = await api.putForm<{ note?: string; storage_root: string; exists: boolean; disk_total: number; disk_used: number; disk_free: number }>("/storage/config", formData);
      setStorageConfig(data);
      setStorageMsg({ type: "success", text: data.note || "存储路径已更新" });
    } catch (e) {
      setStorageMsg({ type: "error", text: (e as Error).message });
    } finally {
      setStorageLoading(false);
    }
  };

  const handleMigrateStorage = async () => {
    if (!storageConfig || storagePath === storageConfig.storage_root) return;

    setStorageMigrating(true);
    setStorageMsg(null);
    try {
      const formData = new FormData();
      formData.append("path", storagePath);
      formData.append("old_path", storageConfig.storage_root);
      const data = await api.postForm<{ storage_root: string; copied: number; skipped: number; missing: number }>("/storage/migrate", formData);
      setStorageConfig((prev) => prev ? { ...prev, storage_root: data.storage_root, exists: true } : prev);
      setStoragePath(data.storage_root);
      setStorageMsg({
        type: "success",
        text: `迁移完成：复制 ${data.copied} 个，跳过 ${data.skipped} 个，缺失 ${data.missing} 个。旧路径文件已保留。`,
      });
    } catch (e) {
      setStorageMsg({ type: "error", text: (e as Error).message });
    } finally {
      setStorageMigrating(false);
    }
  };

  const handleScanOrphans = async () => {
    setStorageCleaning(true);
    setStorageMsg(null);
    try {
      const data = await api.post<{ orphan_count: number; orphan_bytes: number }>("/storage/orphan-files/cleanup?dry_run=true");
      setOrphanSummary({ count: data.orphan_count, bytes: data.orphan_bytes });
      setStorageMsg({
        type: "success",
        text: `扫描完成：发现 ${data.orphan_count} 个孤儿文件，占用 ${(data.orphan_bytes / 1024 / 1024).toFixed(2)} MB。`,
      });
    } catch (e) {
      setStorageMsg({ type: "error", text: (e as Error).message });
    } finally {
      setStorageCleaning(false);
    }
  };

  const handleCleanupOrphans = async () => {
    setStorageCleaning(true);
    setStorageMsg(null);
    try {
      const data = await api.post<{ deleted_count: number; deleted_bytes: number; errors?: unknown[] }>("/storage/orphan-files/cleanup?dry_run=false");
      setOrphanSummary({ count: 0, bytes: 0 });
      setStorageMsg({
        type: data.errors && data.errors.length > 0 ? "error" : "success",
        text: `清理完成：删除 ${data.deleted_count} 个孤儿文件，释放 ${(data.deleted_bytes / 1024 / 1024).toFixed(2)} MB。`,
      });
      void loadStorageConfig();
    } catch (e) {
      setStorageMsg({ type: "error", text: (e as Error).message });
    } finally {
      setStorageCleaning(false);
    }
  };

  const loadEmbedStats = useCallback(async () => {
      setEmbedLoading(true);
    try {
      const qs = currentBrainId ? `?brain_id=${currentBrainId}` : "";
      const data = await api.get<NonNullable<typeof embedStats>>(`/embeddings/stats${qs}`);
      setEmbedStats(data);
    } catch (e) {
      console.error("Failed to load embed stats:", e);
      setEmbedMsg({ type: "error", text: (e as Error).message });
    } finally {
      setEmbedLoading(false);
    }
  }, [currentBrainId]);

  const loadDiagnostics = useCallback(async () => {
    setDiagnosticsLoading(true);
    try {
      const data = await providerApi.diagnostics();
      setDiagnostics(data);
    } catch (e) {
      console.error("Failed to load diagnostics:", e);
    } finally {
      setDiagnosticsLoading(false);
    }
  }, []);

  const handleReindex = async () => {
    setEmbedLoading(true);
      setEmbedMsg(null);
    try {
      const qs = currentBrainId ? `?brain_id=${currentBrainId}` : "";
      const data = await api.post<{ cleared: number; queued: number }>(`/embeddings/reindex${qs}`);
      setEmbedMsg({ type: "success", text: `已清空 ${data.cleared} 条，已入队 ${data.queued} 条` });
    } catch (e) {
      setEmbedMsg({ type: "error", text: (e as Error).message });
    } finally {
      setEmbedLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    if (activeTab === "brain") void loadBrainConfig();
  }, [activeTab, loadBrainConfig]);

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

  const handleToggleApiKey = async (provider: ProviderConfig) => {
    if (Object.prototype.hasOwnProperty.call(visibleApiKeys, provider.id)) {
      setVisibleApiKeys((prev) => {
        const next = { ...prev };
        delete next[provider.id];
        return next;
      });
      return;
    }
    setLoadingApiKey(provider.id);
    try {
      const data = await providerApi.revealApiKey(provider.id);
      setVisibleApiKeys((prev) => ({ ...prev, [provider.id]: data.api_key }));
    } catch (e) {
      console.error("Reveal API key failed:", e);
      setVisibleApiKeys((prev) => ({ ...prev, [provider.id]: null }));
    } finally {
      setLoadingApiKey(null);
    }
  };

  const handleConfirmAction = () => {
    const action = confirmAction;
    setConfirmAction(null);
    if (action === "migrate_storage") void handleMigrateStorage();
    if (action === "cleanup_orphans") void handleCleanupOrphans();
    if (action === "reindex") void handleReindex();
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

  const handleBrainDraftChange = (field: keyof BrainConfig, value: string | null) => {
    setBrainDraft((prev) => ({
      ...prev,
      [field]: value || undefined,
    }));
  };

  const handleSaveBrainConfig = async () => {
    if (!currentBrainId) return;
    setBrainConfigSaving(true);
    setBrainConfigMsg(null);
    try {
      await brainApi.updateConfig(currentBrainId, brainDraft);
      const saved = await brainApi.getConfig(currentBrainId);
      setBrainConfig(saved);
      setBrainDraft(saved);
      setBrainConfigMsg({ type: "success", text: "工作区模型配置已保存" });
    } catch (e) {
      console.error("Failed to update brain config:", e);
      setBrainConfigMsg({ type: "error", text: (e as Error).message || "保存工作区模型配置失败" });
    } finally {
      setBrainConfigSaving(false);
    }
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

      <ConfirmDialog
        open={confirmAction === "migrate_storage"}
        title="迁移存储文件"
        message="确定要把现有文件复制到新的存储路径吗？原路径文件会保留。"
        confirmLabel="确认迁移"
        cancelLabel="取消"
        variant="warning"
        loading={storageMigrating}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        open={confirmAction === "cleanup_orphans"}
        title="清理孤儿文件"
        message={`确定要删除未被数据库引用的物理文件吗？${orphanSummary ? `当前扫描到 ${orphanSummary.count} 个，约 ${(orphanSummary.bytes / 1024 / 1024).toFixed(2)} MB。` : ""}`}
        confirmLabel="确认清理"
        cancelLabel="取消"
        variant="danger"
        loading={storageCleaning}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        open={confirmAction === "reindex"}
        title="重新索引知识库"
        message="确定要重新索引当前知识库的内容吗？这将清空当前知识库的现有嵌入并重新生成。"
        confirmLabel="确认重建"
        cancelLabel="取消"
        variant="warning"
        loading={embedLoading}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmAction(null)}
      />

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">设置</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">管理 AI 服务提供商和功能配置</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 mb-6 p-1 bg-[var(--bg-secondary)] rounded-lg w-fit">
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
            onClick={() => setActiveTab("brain")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === "brain"
                ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Settings2 className="w-4 h-4" /> 工作区模型
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
          <button
            onClick={() => { setActiveTab("diagnostics"); loadDiagnostics(); }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === "diagnostics"
                ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Activity className="w-4 h-4" /> 环境诊断
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
                            <span className="inline-flex items-center gap-1.5">
                              <span className="font-mono text-[var(--text-muted)]">
                                {Object.prototype.hasOwnProperty.call(visibleApiKeys, p.id)
                                  ? (visibleApiKeys[p.id] || "读取失败")
                                  : p.api_key_masked}
                              </span>
                              <button
                                type="button"
                                onClick={() => void handleToggleApiKey(p)}
                                disabled={loadingApiKey === p.id}
                                className="inline-flex items-center justify-center w-6 h-6 rounded hover:bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-50"
                                title={Object.prototype.hasOwnProperty.call(visibleApiKeys, p.id) ? "隐藏密钥" : "显示完整密钥"}
                              >
                                {loadingApiKey === p.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : Object.prototype.hasOwnProperty.call(visibleApiKeys, p.id) ? (
                                  <EyeOff className="w-3.5 h-3.5" />
                                ) : (
                                  <Eye className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </span>
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
                    className="dao-input w-full min-w-0"
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
                    className="dao-input w-full min-w-0"
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

        {activeTab === "brain" && (
          <div className="space-y-4">
            {!currentBrainId ? (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 text-sm text-[var(--text-muted)]">
                请先选择一个工作区，再配置该工作区专属模型。
              </div>
            ) : brainConfigLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--text-muted)]" />
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-[var(--text-muted)]">
                  这里的配置只覆盖当前工作区；留空时会继续使用全局功能绑定。
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  OCR 和语音转写仍在“功能绑定”中配置，避免不同入口产生不一致。
                </p>
                {brainConfigMsg && (
                  <div
                    className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
                      brainConfigMsg.type === "success"
                        ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
                        : "bg-[var(--danger-soft)] dark:bg-red-900/20 text-red-700 dark:text-red-400"
                    }`}
                  >
                    {brainConfigMsg.type === "success" ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <AlertCircle className="w-4 h-4" />
                    )}
                    {brainConfigMsg.text}
                  </div>
                )}

                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5">
                  <div className="grid gap-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                        服务提供商
                      </label>
                      <select
                        value={brainDraft.provider_id || ""}
                        onChange={(e) => handleBrainDraftChange("provider_id", e.target.value || null)}
                        disabled={brainConfigSaving}
                        className="dao-input w-full"
                      >
                        <option value="">跟随全局功能绑定</option>
                        {providers.filter((p) => p.is_active).map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>

                    {[
                      ["summarize_model", "摘要模型", "例如 gpt-4.1-mini"],
                      ["qa_model", "问答模型", "例如 gpt-4.1"],
                      ["quiz_model", "出题模型", "例如 gpt-4.1"],
                      ["judge_model", "答题判定模型", "例如 gpt-4.1-mini"],
                      ["embedding_model", "嵌入模型", "例如 text-embedding-3-large"],
                    ].map(([field, label, placeholder]) => (
                      <div key={field}>
                        <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                          {label}
                        </label>
                        <input
                          value={(brainDraft[field as keyof BrainConfig] as string | undefined) || ""}
                          onChange={(e) => handleBrainDraftChange(field as keyof BrainConfig, e.target.value || null)}
                          disabled={brainConfigSaving}
                          placeholder={placeholder}
                          className="dao-input w-full"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 flex flex-wrap justify-end gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => { setBrainDraft(brainConfig); setBrainConfigMsg(null); }}
                      disabled={brainConfigSaving}
                    >
                      重置
                    </Button>
                    <Button onClick={handleSaveBrainConfig} disabled={brainConfigSaving}>
                      {brainConfigSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      保存工作区配置
                    </Button>
                  </div>
                </div>
              </div>
            )}
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
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-4">{st.storageTitle}</h3>
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

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="text"
                        value={storagePath}
                        onChange={(e) => setStoragePath(e.target.value)}
                        placeholder={st.storagePlaceholder}
                        className="dao-input flex-1"
                      />
                      <button
                        onClick={handleUpdateStorage}
                        disabled={storageLoading || storageMigrating || storagePath === storageConfig.storage_root}
                        className="dao-btn dao-btn-primary text-sm"
                      >
                        {storageLoading ? st.storageUpdating : st.storageUpdate}
                      </button>
                      <button
                        onClick={() => setConfirmAction("migrate_storage")}
                        disabled={storageLoading || storageMigrating || storagePath === storageConfig.storage_root}
                        className="dao-btn dao-btn-ghost text-sm flex items-center justify-center gap-2"
                      >
                        {storageMigrating ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4" />}
                        {storageMigrating ? "迁移中..." : "迁移文件"}
                      </button>
                    </div>

                    <p className="text-xs text-[var(--text-muted)]">
                      迁移会复制现有文件和派生截图到新路径，原路径文件不会自动删除。
                    </p>

                    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/50 px-4 py-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h4 className="text-sm font-medium text-[var(--text-primary)]">孤儿文件清理</h4>
                          <p className="mt-1 text-xs text-[var(--text-muted)]">
                            清理已不被 contents 或 content_chunks 引用的物理文件。
                            {orphanSummary && ` 当前扫描：${orphanSummary.count} 个，${(orphanSummary.bytes / 1024 / 1024).toFixed(2)} MB。`}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={handleScanOrphans}
                            disabled={storageCleaning}
                            className="dao-btn dao-btn-ghost text-sm inline-flex items-center justify-center gap-2"
                          >
                            {storageCleaning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            扫描
                          </button>
                          <button
                            onClick={() => setConfirmAction("cleanup_orphans")}
                            disabled={storageCleaning || (orphanSummary !== null && orphanSummary.count === 0)}
                            className="dao-btn text-sm inline-flex items-center justify-center gap-2 bg-[var(--danger-soft)] text-[var(--danger)] hover:bg-[var(--danger-soft)] disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                            清理孤儿文件
                          </button>
                        </div>
                      </div>
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
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-4">{st.reindexTitle}</h3>
                  <p className="text-sm text-[var(--text-muted)] dark:text-[var(--text-muted)] mb-4">
                    {st.reindexDesc}
                  </p>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setConfirmAction("reindex")}
                      disabled={embedLoading}
                      className="dao-btn dao-btn-primary text-sm flex items-center gap-2"
                    >
                      {embedLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <BarChart3 className="w-4 h-4" />
                      )}
                      {st.reindexBtn}
                    </button>
                    <button
                      onClick={loadEmbedStats}
                      disabled={embedLoading}
                      className="dao-btn dao-btn-ghost text-sm flex items-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" /> {st.reindexRefresh}
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

        {activeTab === "diagnostics" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-[var(--text-muted)]">
                检查多模态处理所需的本地工具、Python 包和功能绑定。
              </p>
              <button
                onClick={loadDiagnostics}
                disabled={diagnosticsLoading}
                className="dao-btn dao-btn-ghost text-sm flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${diagnosticsLoading ? "animate-spin" : ""}`} />
                刷新
              </button>
            </div>

            {diagnosticsLoading && !diagnostics && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--text-muted)]" />
              </div>
            )}

            {diagnostics && (
              <>
                <div className="p-6 bg-[var(--bg-card)] dark:bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] dark:border-[var(--border-subtle)]">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">运行环境</h3>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {diagnostics.checks.map((check) => (
                      <div
                        key={check.key}
                        className="p-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] dark:bg-[var(--bg-elevated)]"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-[var(--text-primary)]">{diagnosticLabel(check.label)}</p>
                          {check.ok ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-[var(--warning)] shrink-0" />
                          )}
                        </div>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">{check.ok ? "可用" : "缺失"}</p>
                        {diagnosticDetail(check.detail) && (
                          <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">{diagnosticDetail(check.detail)}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-6 bg-[var(--bg-card)] dark:bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] dark:border-[var(--border-subtle)]">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">功能绑定</h3>
                  <div className="space-y-2">
                    {diagnostics.bindings.map((binding) => (
                      <div
                        key={binding.function}
                        className="grid grid-cols-[minmax(120px,1fr)_minmax(140px,1.2fr)_minmax(160px,1.4fr)_24px] items-center gap-3 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] dark:bg-[var(--bg-elevated)]"
                      >
                        <div>
                          <p className="text-sm font-medium text-[var(--text-primary)]">{diagnosticLabel(binding.label)}</p>
                          {diagnosticDetail(binding.detail) && (
                            <p className="mt-0.5 text-xs text-[var(--warning)]">{diagnosticDetail(binding.detail)}</p>
                          )}
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] truncate">
                          {binding.provider_name || "未选择提供商"}
                        </p>
                        <p className="text-xs font-mono text-[var(--text-muted)] truncate">
                          {binding.model || "未配置模型"}
                        </p>
                        {binding.ok ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-[var(--warning)]" />
                        )}
                      </div>
                    ))}
                  </div>
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
