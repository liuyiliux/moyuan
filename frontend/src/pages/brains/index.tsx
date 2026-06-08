import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Brain, Plus, Settings, Archive, Trash2, RotateCcw, Edit, X, Loader2, BarChart3 } from "lucide-react";
import { brainApi, getCurrentBrainId, setCurrentBrainId, type Brain as BrainType, type BrainConfig, type BrainOverview } from "../../api/brains";
import { contentApi } from "../../api/content";
import { providerApi, type ProviderConfig } from "../../api/provider";
import ConfirmDialog from "../../components/ConfirmDialog";
import Toast from "../../components/Toast";
import { brainsCopy, useCopy } from "../../lib/copywriting";

interface BrainFormData {
  name: string;
  description: string;
  icon: string;
  template: "blank" | "study";
}

export default function BrainsPage() {
  const t = useCopy(brainsCopy);
  const [searchParams] = useSearchParams();
  const [brains, setBrains] = useState<BrainType[]>([]);
  const [archivedBrains, setArchivedBrains] = useState<BrainType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showOverviewModal, setShowOverviewModal] = useState(false);
  const [selectedBrain, setSelectedBrain] = useState<BrainType | null>(null);
  const [config, setConfig] = useState<BrainConfig>({});
  const [overview, setOverview] = useState<BrainOverview | null>(null);
  const [isOverviewLoading, setIsOverviewLoading] = useState(false);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [formData, setFormData] = useState<BrainFormData>({ name: "", description: "", icon: "", template: "study" });
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    loadBrains();
    if (searchParams.get("create") === "true") setShowCreateModal(true);
  }, [searchParams]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  async function loadBrains() {
    setIsLoading(true);
    try {
      const [active, archived] = await Promise.all([brainApi.list(false), brainApi.list(true)]);
      setBrains(active);
      setArchivedBrains(archived.filter((b) => b.archived));
    } catch {
      notify("error", "加载工作区失败");
    } finally {
      setIsLoading(false);
    }
  }

  function notify(type: "success" | "error", message: string) {
    setNotification({ type, message });
  }

  async function handleCreate() {
    if (!formData.name.trim()) { notify("error", "请输入工作区名称"); return; }
    try {
      await brainApi.create({
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        icon: formData.icon.trim() || undefined,
        template: formData.template,
      });
      notify("success", "工作区创建成功");
      setShowCreateModal(false);
      setFormData({ name: "", description: "", icon: "", template: "study" });
      loadBrains();
    } catch { notify("error", "创建工作区失败"); }
  }

  async function handleEdit() {
    if (!selectedBrain || !formData.name.trim()) { notify("error", "请输入工作区名称"); return; }
    try {
      await brainApi.update(selectedBrain.id, { name: formData.name.trim(), description: formData.description.trim() || undefined, icon: formData.icon.trim() || undefined });
      notify("success", "工作区更新成功");
      setShowEditModal(false);
      setSelectedBrain(null);
      setFormData({ name: "", description: "", icon: "", template: "study" });
      loadBrains();
    } catch { notify("error", "更新工作区失败"); }
  }

  async function handleDelete() {
    if (!selectedBrain) return;
    try {
      await brainApi.delete(selectedBrain.id);
      notify("success", "工作区已删除");
      setShowDeleteModal(false);
      if (getCurrentBrainId() === selectedBrain.id) setCurrentBrainId("");
      setSelectedBrain(null);
      loadBrains();
    } catch { notify("error", "删除工作区失败"); }
  }

  async function handleArchive(brain: BrainType) {
    try { await brainApi.archive(brain.id); notify("success", "工作区已归档"); loadBrains(); }
    catch { notify("error", "归档工作区失败"); }
  }

  async function handleRestore(brain: BrainType) {
    try { await brainApi.restore(brain.id); notify("success", "工作区已恢复"); loadBrains(); }
    catch { notify("error", "恢复工作区失败"); }
  }

  async function handleOpenConfig(brain: BrainType) {
    setSelectedBrain(brain);
    try {
      const [brainConfig, providerList] = await Promise.all([brainApi.getConfig(brain.id), providerApi.list()]);
      setConfig(brainConfig);
      setProviders(providerList);
      setShowConfigModal(true);
    }
    catch { notify("error", "加载配置失败"); }
  }

  async function handleOpenOverview(brain: BrainType) {
    setSelectedBrain(brain);
    setOverview(null);
    setShowOverviewModal(true);
    setIsOverviewLoading(true);
    try {
      setOverview(await brainApi.getOverview(brain.id));
    } catch {
      notify("error", "加载概览失败");
      setShowOverviewModal(false);
      setSelectedBrain(null);
    } finally {
      setIsOverviewLoading(false);
    }
  }

  async function handleSaveConfig() {
    if (!selectedBrain) return;
    const cleaned: BrainConfig = {};
    if (config.provider_id?.trim()) cleaned.provider_id = config.provider_id.trim();
    if (config.embedding_model?.trim()) cleaned.embedding_model = config.embedding_model.trim();
    if (config.summarize_model?.trim()) cleaned.summarize_model = config.summarize_model.trim();
    if (config.quiz_model?.trim()) cleaned.quiz_model = config.quiz_model.trim();
    try { await brainApi.updateConfig(selectedBrain.id, cleaned); notify("success", "配置已保存"); setShowConfigModal(false); setSelectedBrain(null); setConfig({}); }
    catch { notify("error", "保存配置失败"); }
  }

  function openEditModal(brain: BrainType) {
    setSelectedBrain(brain);
    setFormData({ name: brain.name, description: brain.description || "", icon: brain.icon || "", template: "blank" });
    setShowEditModal(true);
  }

  function openDeleteModal(brain: BrainType) { setSelectedBrain(brain); setShowDeleteModal(true); }

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" /></div>;
  }

  return (
    <div className="min-h-screen p-6">
      {/* Toast */}
      {notification && <Toast type={notification.type} message={notification.message} onClose={() => setNotification(null)} />}

      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] tracking-tight">{t.title}</h1>
            <p className="text-[var(--text-muted)] mt-1 text-sm">{t.subtitle}</p>
          </div>
          <button onClick={() => setShowCreateModal(true)} className="dao-btn dao-btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> {t.btnCreate}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-6">
          <button onClick={() => setShowArchived(false)} className={`px-3 py-1.5 rounded-md text-[13px] font-medium transition-all ${!showArchived ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]" : "text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"}`}>
            {t.tabActive}
          </button>
          <button onClick={() => setShowArchived(true)} className={`px-3 py-1.5 rounded-md text-[13px] font-medium transition-all ${showArchived ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]" : "text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"}`}>
            {t.tabArchived(archivedBrains.length)}
          </button>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(showArchived ? archivedBrains : brains).map((brain) => (
            <div key={brain.id} className="dao-card dao-glow-hover p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  {brain.icon ? <span className="text-2xl">{brain.icon}</span> : <div className="w-10 h-10 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center"><Brain className="w-5 h-5 text-[var(--accent)]" /></div>}
                  <div>
                    <h3 className="font-semibold text-[var(--text-primary)]">{brain.name}</h3>
                    {brain.is_default && <span className="notion-badge text-[11px] mt-1">{t.defaultBadge}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  <button onClick={() => handleOpenOverview(brain)} className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-all" title="概览"><BarChart3 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => handleOpenConfig(brain)} className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-all" title="配置"><Settings className="w-3.5 h-3.5" /></button>
                  <button onClick={() => openEditModal(brain)} className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-all" title="编辑"><Edit className="w-3.5 h-3.5" /></button>
                  {brain.archived ? (
                    <button onClick={() => handleRestore(brain)} className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all" title={t.btnRestore}><RotateCcw className="w-3.5 h-3.5" /></button>
                  ) : (
                    <button onClick={() => handleArchive(brain)} className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--warning)] hover:bg-[var(--warning-soft)] transition-all" title={t.btnArchive}><Archive className="w-3.5 h-3.5" /></button>
                  )}
                  <button onClick={() => openDeleteModal(brain)} className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] transition-all" title={t.btnDelete}><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              {brain.description && <p className="text-[13px] text-[var(--text-secondary)] mb-3 line-clamp-2">{brain.description}</p>}
              <div className="flex items-center justify-between text-[12px] text-[var(--text-muted)]">
                <span>{t.itemCount(brain.content_count)}</span>
                <span>{new Date(brain.updated_at).toLocaleDateString("zh-CN")}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Empty */}
        {(showArchived ? archivedBrains : brains).length === 0 && (
          <div className="text-center py-16">
            <Brain className="w-16 h-16 text-[var(--text-muted)] mx-auto mb-4" />
            <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">{showArchived ? t.emptyArchived : t.empty}</h3>
            <p className="text-[var(--text-secondary)] mb-6 text-sm">{showArchived ? t.emptyArchivedHint : t.emptyHint}</p>
            {!showArchived && <button onClick={() => setShowCreateModal(true)} className="dao-btn dao-btn-primary text-sm">{t.btnCreate}</button>}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && <Modal title={t.modalCreate} onClose={() => { setShowCreateModal(false); setFormData({ name: "", description: "", icon: "", template: "study" }); }}>
        <ModalForm formData={formData} setFormData={setFormData} showTemplate />
        <ModalActions onCancel={() => { setShowCreateModal(false); setFormData({ name: "", description: "", icon: "", template: "study" }); }} onConfirm={handleCreate} confirmText="创建" />
      </Modal>}

      {/* Edit Modal */}
      {showEditModal && selectedBrain && <Modal title={t.modalEdit} onClose={() => { setShowEditModal(false); setSelectedBrain(null); setFormData({ name: "", description: "", icon: "", template: "study" }); }}>
        <ModalForm formData={formData} setFormData={setFormData} />
        <ModalActions onCancel={() => { setShowEditModal(false); setSelectedBrain(null); setFormData({ name: "", description: "", icon: "", template: "study" }); }} onConfirm={handleEdit} confirmText={t.btnSave} />
      </Modal>}

      {/* Delete Confirm */}
      <ConfirmDialog
        open={showDeleteModal}
        title={t.confirmDeleteTitle}
        message={t.confirmDeleteMsg(selectedBrain?.name || "")}
        confirmLabel={t.confirmDeleteBtn}
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => { setShowDeleteModal(false); setSelectedBrain(null); }}
      />

      {/* Overview Modal */}
      {showOverviewModal && selectedBrain && <Modal title={`概览 — ${selectedBrain.name}`} widthClass="max-w-2xl" onClose={() => { setShowOverviewModal(false); setSelectedBrain(null); setOverview(null); }}>
        <OverviewPanel overview={overview} loading={isOverviewLoading} />
      </Modal>}

      {/* Config Modal */}
      {showConfigModal && selectedBrain && <Modal title={t.modalConfig(selectedBrain.name)} onClose={() => { setShowConfigModal(false); setSelectedBrain(null); setConfig({}); }}>
        <div className="p-6 space-y-4">
          <ProviderField providers={providers} value={config.provider_id || ""} onChange={(v) => setConfig({ ...config, provider_id: v || undefined })} />
          <ConfigField label="嵌入模型" value={config.embedding_model || ""} onChange={(v) => setConfig({ ...config, embedding_model: v })} placeholder={providers.find((p) => p.id === config.provider_id)?.default_models?.embedding || "text-embedding-3-small"} />
          <ConfigField label="摘要模型" value={config.summarize_model || ""} onChange={(v) => setConfig({ ...config, summarize_model: v })} placeholder={providers.find((p) => p.id === config.provider_id)?.default_models?.summarize || "gpt-4o-mini"} />
          <ConfigField label="题库模型" value={config.quiz_model || ""} onChange={(v) => setConfig({ ...config, quiz_model: v })} placeholder={providers.find((p) => p.id === config.provider_id)?.default_models?.quiz || "gpt-4o"} />
        </div>
        <ModalActions onCancel={() => { setShowConfigModal(false); setSelectedBrain(null); setConfig({}); }} onConfirm={handleSaveConfig} confirmText="保存配置" />
      </Modal>}
    </div>
  );
}

/* ── Shared Components ── */

function Modal({ title, onClose, children, widthClass = "max-w-md" }: { title: string; onClose: () => void; children: React.ReactNode; widthClass?: string }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className={`bg-[var(--bg-card)] dark:bg-[var(--bg-card)] rounded-xl w-full ${widthClass} dao-card`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-[var(--border-subtle)]">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function OverviewPanel({ overview, loading }: { overview: BrainOverview | null; loading: boolean }) {
  const navigate = useNavigate();
  const [resumeStarting, setResumeStarting] = useState(false);
  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" /></div>;
  }
  if (!overview) {
    return <div className="p-6 text-sm text-[var(--text-muted)]">暂无概览数据</div>;
  }

  const stats = overview.stats;
  const study = overview.study;
  const pendingCount = Object.entries(stats.by_status)
    .filter(([status]) => !["completed", "failed"].includes(status))
    .reduce((sum, [, count]) => sum + count, 0);
  const statusEntries = Object.entries(stats.by_status).sort(([a], [b]) => a.localeCompare(b));
  const typeEntries = Object.entries(stats.by_type).sort(([, a], [, b]) => b - a).slice(0, 5);
  const resumePath = overview.resume_content
    ? `/contents/${overview.resume_content.id}${overview.resume_content.collection_id ? `?collection_id=${overview.resume_content.collection_id}` : ""}`
    : "";
  const handleResume = async () => {
    if (!overview.resume_content) return;
    setResumeStarting(true);
    try {
      if (overview.resume_content.study_status !== "in_progress" && overview.resume_content.study_status !== "completed") {
        await contentApi.update(overview.resume_content.id, {
          extra_meta: {
            study_status: "in_progress",
            study_started_at: new Date().toISOString(),
            study_completed_at: null,
          },
        }).catch(console.error);
      }
      navigate(resumePath);
    } finally {
      setResumeStarting(false);
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label="内容" value={String(stats.total_contents)} />
        <Metric label="待处理" value={String(pendingCount)} />
        <Metric label="失败" value={String(stats.by_status.failed || 0)} tone={(stats.by_status.failed || 0) > 0 ? "danger" : "default"} />
        <Metric label="存储" value={formatBytes(stats.storage_bytes)} />
      </div>

      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <div className="text-[13px] font-medium text-[var(--text-primary)]">学习进度</div>
            <div className="text-[12px] text-[var(--text-muted)] mt-0.5">按当前工作区内容的学习状态统计</div>
          </div>
          <div className="text-lg font-semibold text-[var(--text-primary)] shrink-0">{study.progress_percent}%</div>
        </div>
        <div className="h-2 rounded-full bg-[var(--bg-card)] overflow-hidden mb-3">
          <div className="h-full bg-emerald-500" style={{ width: `${study.progress_percent}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-2 text-[12px]">
          <div className="rounded-md bg-[var(--bg-card)] px-3 py-2">
            <div className="text-[var(--text-muted)]">未学</div>
            <div className="text-sm font-medium text-[var(--text-primary)]">{study.not_started}</div>
          </div>
          <div className="rounded-md bg-[var(--bg-card)] px-3 py-2">
            <div className="text-[var(--text-muted)]">学习中</div>
            <div className="text-sm font-medium text-[var(--text-primary)]">{study.in_progress}</div>
          </div>
          <div className="rounded-md bg-[var(--bg-card)] px-3 py-2">
            <div className="text-[var(--text-muted)]">已学完</div>
            <div className="text-sm font-medium text-[var(--text-primary)]">{study.completed}</div>
          </div>
        </div>
        {overview.resume_content && (
          <button
            type="button"
            onClick={() => void handleResume()}
            disabled={resumeStarting}
            className="mt-3 flex w-full items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-left transition-colors hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-70 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/30"
          >
            <div className="min-w-0">
              <div className="text-[12px] font-medium text-emerald-700 dark:text-emerald-300">继续学习</div>
              <div className="truncate text-sm text-[var(--text-primary)]">{overview.resume_content.title}</div>
              {overview.resume_content.collection_name && (
                <div className="mt-0.5 truncate text-[12px] text-emerald-700/80 dark:text-emerald-300/80">
                  {overview.resume_content.collection_name}
                </div>
              )}
            </div>
            <div className="shrink-0 text-[12px] text-emerald-700 dark:text-emerald-300">
              {resumeStarting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : overview.resume_content.study_status === "in_progress" ? "学习中" : "未学"}
            </div>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Metric label="分类" value={String(stats.categories)} />
        <Metric label="标签" value={String(stats.tags)} />
        <Metric label="合集" value={String(stats.collections)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Distribution title="状态分布" entries={statusEntries.map(([key, count]) => [STATUS_LABELS[key] || key, count])} />
        <Distribution title="类型分布" entries={typeEntries.map(([key, count]) => [TYPE_LABELS[key] || key, count])} />
      </div>

      <div>
        <div className="text-[13px] font-medium text-[var(--text-primary)] mb-2">最近内容</div>
        {overview.recent_contents.length === 0 ? (
          <div className="text-sm text-[var(--text-muted)] py-4">暂无内容</div>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-lg overflow-hidden">
            {overview.recent_contents.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(`/contents/${item.id}`)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left bg-[var(--bg-card)] hover:bg-[var(--bg-secondary)] transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-sm text-[var(--text-primary)] truncate">{item.title}</div>
                  <div className="text-[12px] text-[var(--text-muted)]">{TYPE_LABELS[item.content_type] || item.content_type} · {STATUS_LABELS[item.processing_status] || item.processing_status}</div>
                </div>
                <div className="text-[12px] text-[var(--text-muted)] shrink-0">{item.updated_at ? new Date(item.updated_at).toLocaleDateString("zh-CN") : "-"}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "danger" }) {
  return (
    <div className={`rounded-lg border p-3 ${tone === "danger" ? "border-[var(--danger)] bg-[var(--danger-soft)]" : "border-[var(--border-subtle)] bg-[var(--bg-secondary)]"}`}>
      <div className="text-[12px] text-[var(--text-muted)] mb-1">{label}</div>
      <div className="text-lg font-semibold text-[var(--text-primary)] truncate">{value}</div>
    </div>
  );
}

function Distribution({ title, entries }: { title: string; entries: Array<[string, number]> }) {
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  return (
    <div>
      <div className="text-[13px] font-medium text-[var(--text-primary)] mb-2">{title}</div>
      <div className="space-y-2">
        {entries.length === 0 ? (
          <div className="text-sm text-[var(--text-muted)] py-2">暂无数据</div>
        ) : entries.map(([label, count]) => (
          <div key={label}>
            <div className="flex items-center justify-between text-[12px] text-[var(--text-secondary)] mb-1">
              <span className="truncate">{label}</span>
              <span className="shrink-0">{count}</span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
              <div className="h-full bg-[var(--accent)]" style={{ width: `${total ? Math.max(6, (count / total) * 100) : 0}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModalForm({ formData, setFormData, showTemplate = false }: { formData: BrainFormData; setFormData: (d: BrainFormData) => void; showTemplate?: boolean }) {
  const t = useCopy(brainsCopy);

  return (
    <div className="p-6 space-y-4">
      <div>
        <label className="block text-[13px] font-medium text-[var(--text-primary)] mb-1.5">{t.labelName}</label>
        <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder={t.phName} className="dao-input w-full" />
      </div>
      <div>
        <label className="block text-[13px] font-medium text-[var(--text-primary)] mb-1.5">{t.labelDesc}</label>
        <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder={t.phDesc} rows={3} className="dao-input w-full resize-none" />
      </div>
      <div>
        <label className="block text-[13px] font-medium text-[var(--text-primary)] mb-1.5">{t.labelIcon}</label>
        <input type="text" value={formData.icon} onChange={(e) => setFormData({ ...formData, icon: e.target.value })} placeholder="🧠" className="dao-input w-full" />
      </div>
      {showTemplate && (
        <div>
          <label className="block text-[13px] font-medium text-[var(--text-primary)] mb-1.5">工作区模板</label>
          <select
            value={formData.template}
            onChange={(e) => setFormData({ ...formData, template: e.target.value as BrainFormData["template"] })}
            className="dao-input w-full"
          >
            <option value="study">学习型：分类 + 课程/资料合集</option>
            <option value="blank">空白：只创建未分类</option>
          </select>
        </div>
      )}
    </div>
  );
}

function ModalActions({ onCancel, onConfirm, confirmText }: { onCancel: () => void; onConfirm: () => void; confirmText: string }) {
  const ct = useCopy(brainsCopy);
  return (
    <div className="flex justify-end gap-2 px-6 py-4 border-t border-[var(--border-subtle)]">
      <button onClick={onCancel} className="dao-btn dao-btn-ghost text-[13px]">{ct.btnCancel}</button>
      <button onClick={onConfirm} className="dao-btn dao-btn-primary text-[13px]">{confirmText}</button>
    </div>
  );
}

function ConfigField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-[var(--text-primary)] mb-1.5">{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="dao-input w-full" />
    </div>
  );
}

function ProviderField({ providers, value, onChange }: { providers: ProviderConfig[]; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-[var(--text-primary)] mb-1.5">提供商</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="dao-input w-full">
        <option value="">使用全局配置</option>
        {providers.filter((p) => p.is_active).map((provider) => (
          <option key={provider.id} value={provider.id}>{provider.name}</option>
        ))}
      </select>
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  pending: "待处理",
  chunking: "切分中",
  chunked: "已切分",
  embedding: "向量化中",
  processing: "处理中",
  completed: "完成",
  failed: "失败",
};

const TYPE_LABELS: Record<string, string> = {
  note: "笔记",
  image: "图片",
  video: "视频",
  audio: "音频",
  pdf: "PDF",
  doc: "文档",
  web: "网页",
};

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}
