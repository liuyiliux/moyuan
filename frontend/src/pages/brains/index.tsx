import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Brain, Plus, Settings, Archive, Trash2, RotateCcw, Edit, X, Loader2 } from "lucide-react";
import { brainApi, getCurrentBrainId, setCurrentBrainId, type Brain as BrainType, type BrainConfig } from "../../api/brains";
import ConfirmDialog from "../../components/ConfirmDialog";
import Toast from "../../components/Toast";

interface BrainFormData {
  name: string;
  description: string;
  icon: string;
}

export default function BrainsPage() {
  const [searchParams] = useSearchParams();
  const [brains, setBrains] = useState<BrainType[]>([]);
  const [archivedBrains, setArchivedBrains] = useState<BrainType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedBrain, setSelectedBrain] = useState<BrainType | null>(null);
  const [config, setConfig] = useState<BrainConfig>({});
  const [formData, setFormData] = useState<BrainFormData>({ name: "", description: "", icon: "" });
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
      await brainApi.create({ name: formData.name.trim(), description: formData.description.trim() || undefined, icon: formData.icon.trim() || undefined });
      notify("success", "工作区创建成功");
      setShowCreateModal(false);
      setFormData({ name: "", description: "", icon: "" });
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
      setFormData({ name: "", description: "", icon: "" });
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
    try { setConfig(await brainApi.getConfig(brain.id)); setShowConfigModal(true); }
    catch { notify("error", "加载配置失败"); }
  }

  async function handleSaveConfig() {
    if (!selectedBrain) return;
    try { await brainApi.updateConfig(selectedBrain.id, config); notify("success", "配置已保存"); setShowConfigModal(false); setSelectedBrain(null); setConfig({}); }
    catch { notify("error", "保存配置失败"); }
  }

  function openEditModal(brain: BrainType) {
    setSelectedBrain(brain);
    setFormData({ name: brain.name, description: brain.description || "", icon: brain.icon || "" });
    setShowEditModal(true);
  }

  function openDeleteModal(brain: BrainType) { setSelectedBrain(brain); setShowDeleteModal(true); }

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" /></div>;
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] p-6">
      {/* Toast */}
      {notification && <Toast type={notification.type} message={notification.message} onClose={() => setNotification(null)} />}

      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] tracking-tight">工作区管理</h1>
            <p className="text-[var(--text-muted)] mt-1 text-sm">管理你的知识库和工作空间</p>
          </div>
          <button onClick={() => setShowCreateModal(true)} className="taste-btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> 新建工作区
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-6">
          <button onClick={() => setShowArchived(false)} className={`px-3 py-1.5 rounded-md text-[13px] font-medium transition-all ${!showArchived ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]" : "text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"}`}>
            活跃工作区
          </button>
          <button onClick={() => setShowArchived(true)} className={`px-3 py-1.5 rounded-md text-[13px] font-medium transition-all ${showArchived ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]" : "text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"}`}>
            已归档 ({archivedBrains.length})
          </button>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(showArchived ? archivedBrains : brains).map((brain) => (
            <div key={brain.id} className="taste-card-glow p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  {brain.icon ? <span className="text-2xl">{brain.icon}</span> : <div className="w-10 h-10 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center"><Brain className="w-5 h-5 text-[var(--accent)]" /></div>}
                  <div>
                    <h3 className="font-semibold text-[var(--text-primary)]">{brain.name}</h3>
                    {brain.is_default && <span className="notion-badge text-[11px] mt-1">默认</span>}
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  <button onClick={() => handleOpenConfig(brain)} className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-all" title="配置"><Settings className="w-3.5 h-3.5" /></button>
                  <button onClick={() => openEditModal(brain)} className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-all" title="编辑"><Edit className="w-3.5 h-3.5" /></button>
                  {brain.archived ? (
                    <button onClick={() => handleRestore(brain)} className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all" title="恢复"><RotateCcw className="w-3.5 h-3.5" /></button>
                  ) : (
                    <button onClick={() => handleArchive(brain)} className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--warning)] hover:bg-[var(--warning-soft)] transition-all" title="归档"><Archive className="w-3.5 h-3.5" /></button>
                  )}
                  <button onClick={() => openDeleteModal(brain)} className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] transition-all" title="删除"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              {brain.description && <p className="text-[13px] text-[var(--text-secondary)] mb-3 line-clamp-2">{brain.description}</p>}
              <div className="flex items-center justify-between text-[12px] text-[var(--text-muted)]">
                <span>{brain.content_count} 条内容</span>
                <span>{new Date(brain.updated_at).toLocaleDateString("zh-CN")}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Empty */}
        {(showArchived ? archivedBrains : brains).length === 0 && (
          <div className="text-center py-16">
            <Brain className="w-16 h-16 text-[var(--text-muted)] mx-auto mb-4" />
            <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">{showArchived ? "暂无已归档工作区" : "还没有工作区"}</h3>
            <p className="text-[var(--text-secondary)] mb-6 text-sm">{showArchived ? "所有工作区都处于活跃状态" : "创建你的第一个工作区开始使用"}</p>
            {!showArchived && <button onClick={() => setShowCreateModal(true)} className="taste-btn-primary text-sm">创建第一个工作区</button>}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && <Modal title="新建工作区" onClose={() => { setShowCreateModal(false); setFormData({ name: "", description: "", icon: "" }); }}>
        <ModalForm formData={formData} setFormData={setFormData} />
        <ModalActions onCancel={() => { setShowCreateModal(false); setFormData({ name: "", description: "", icon: "" }); }} onConfirm={handleCreate} confirmText="创建" />
      </Modal>}

      {/* Edit Modal */}
      {showEditModal && selectedBrain && <Modal title="编辑工作区" onClose={() => { setShowEditModal(false); setSelectedBrain(null); setFormData({ name: "", description: "", icon: "" }); }}>
        <ModalForm formData={formData} setFormData={setFormData} />
        <ModalActions onCancel={() => { setShowEditModal(false); setSelectedBrain(null); setFormData({ name: "", description: "", icon: "" }); }} onConfirm={handleEdit} confirmText="保存" />
      </Modal>}

      {/* Delete Confirm */}
      <ConfirmDialog
        open={showDeleteModal}
        title="删除工作区"
        message={`确定要删除「${selectedBrain?.name}」吗？此操作不可恢复，该工作区下的所有内容将被永久删除。`}
        confirmLabel="确认删除"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => { setShowDeleteModal(false); setSelectedBrain(null); }}
      />

      {/* Config Modal */}
      {showConfigModal && selectedBrain && <Modal title={`AI 配置 — ${selectedBrain.name}`} onClose={() => { setShowConfigModal(false); setSelectedBrain(null); setConfig({}); }}>
        <div className="p-6 space-y-4">
          <ConfigField label="嵌入模型" value={config.embedding_model || ""} onChange={(v) => setConfig({ ...config, embedding_model: v })} placeholder="text-embedding-3-small" />
          <ConfigField label="摘要模型" value={config.summarize_model || ""} onChange={(v) => setConfig({ ...config, summarize_model: v })} placeholder="gpt-4o-mini" />
          <ConfigField label="题库模型" value={config.quiz_model || ""} onChange={(v) => setConfig({ ...config, quiz_model: v })} placeholder="gpt-4o" />
          <ConfigField label="提供商 ID" value={config.provider_id || ""} onChange={(v) => setConfig({ ...config, provider_id: v })} placeholder="可选，留空使用全局配置" />
        </div>
        <ModalActions onCancel={() => { setShowConfigModal(false); setSelectedBrain(null); setConfig({}); }} onConfirm={handleSaveConfig} confirmText="保存配置" />
      </Modal>}
    </div>
  );
}

/* ── Shared Components ── */

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[var(--bg-card)] dark:bg-[var(--bg-card)] rounded-xl w-full max-w-md taste-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-[var(--border-subtle)]">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalForm({ formData, setFormData }: { formData: BrainFormData; setFormData: (d: BrainFormData) => void }) {
  return (
    <div className="p-6 space-y-4">
      <div>
        <label className="block text-[13px] font-medium text-[var(--text-primary)] mb-1.5">工作区名称 *</label>
        <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="输入工作区名称" className="taste-input w-full" />
      </div>
      <div>
        <label className="block text-[13px] font-medium text-[var(--text-primary)] mb-1.5">描述</label>
        <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="可选描述" rows={3} className="taste-input w-full resize-none" />
      </div>
      <div>
        <label className="block text-[13px] font-medium text-[var(--text-primary)] mb-1.5">图标（emoji）</label>
        <input type="text" value={formData.icon} onChange={(e) => setFormData({ ...formData, icon: e.target.value })} placeholder="🧠" className="taste-input w-full" />
      </div>
    </div>
  );
}

function ModalActions({ onCancel, onConfirm, confirmText }: { onCancel: () => void; onConfirm: () => void; confirmText: string }) {
  return (
    <div className="flex justify-end gap-2 px-6 py-4 border-t border-[var(--border-subtle)]">
      <button onClick={onCancel} className="taste-btn-ghost text-[13px]">取消</button>
      <button onClick={onConfirm} className="taste-btn-primary text-[13px]">{confirmText}</button>
    </div>
  );
}

function ConfigField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-[var(--text-primary)] mb-1.5">{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="taste-input w-full" />
    </div>
  );
}
