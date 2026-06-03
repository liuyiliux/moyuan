import { useState, useEffect } from "react";

interface TemplateData {
  system_prompt: string;
  user_prompt_template: string;
  id?: string;
  name?: string;
}

interface Props {
  onClose: () => void;
}

const VARIABLES = [
  { key: "sources", desc: "知识点原文" },
  { key: "distractors", desc: "干扰项素材" },
  { key: "question_count", desc: "题目数量" },
  { key: "question_types", desc: "题型描述（如'单选题、多选题'）" },
  { key: "mode_desc", desc: "出题模式描述（如'按主题「摄影」出题'）" },
  { key: "topic", desc: "主题关键词" },
];

export default function PromptEditor({ onClose }: Props) {
  const [template, setTemplate] = useState<TemplateData>({ system_prompt: "", user_prompt_template: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/ai/quiz-template")
      .then(r => r.json())
      .then(data => {
        setTemplate(data.template || { system_prompt: "", user_prompt_template: "" });
        if (data.note) setMessage(data.note);
      })
      .catch(() => setMessage("加载模板失败"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/ai/quiz-template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_prompt: template.system_prompt,
          user_prompt_template: template.user_prompt_template,
        }),
      });
      const data = await res.json();
      setMessage(data.message || "保存成功");
    } catch {
      setMessage("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/ai/quiz-template/reset", { method: "POST" });
      const data = await res.json();
      setTemplate(data.template || { system_prompt: "", user_prompt_template: "" });
      setMessage(data.message || "已恢复默认");
    } catch {
      setMessage("恢复失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 w-full max-w-2xl max-h-[85vh] overflow-auto shadow-xl">
          <p className="text-sm text-[var(--text-muted)]">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white dark:bg-zinc-800 rounded-xl p-6 w-full max-w-2xl max-h-[85vh] overflow-auto shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">编辑出题 Prompt</h3>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* 5.3: 可用变量提示 */}
        <div className="mb-4 p-2 bg-[var(--bg-secondary)] dark:bg-[var(--bg-elevated)] rounded-lg">
          <p className="text-xs text-[var(--text-muted)] mb-1">可用变量（使用 {'{{变量名}}'} 引用，系统会自动替换）：</p>
          <div className="flex flex-wrap gap-1.5">
            {VARIABLES.map(v => (
              <span
                key={v.key}
                className="text-[10px] px-1.5 py-0.5 bg-[var(--accent-soft)] dark:bg-indigo-900/20 text-[var(--accent-text)] dark:text-indigo-300 rounded font-mono"
                title={v.desc}
              >
                {`{{${v.key}}}`}
              </span>
            ))}
          </div>
        </div>

        {/* System Prompt */}
        <div className="mb-3">
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">System Prompt</label>
          <textarea
            value={template.system_prompt}
            onChange={e => setTemplate(prev => ({ ...prev, system_prompt: e.target.value }))}
            rows={10}
            className="w-full text-xs border border-[var(--border-subtle)] dark:border-zinc-600 rounded-lg px-3 py-2 bg-[var(--bg-primary)] dark:bg-[var(--bg-elevated)] text-[var(--text-primary)] font-mono resize-y focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>

        {/* User Prompt Template */}
        <div className="mb-3">
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">User Prompt Template</label>
          <textarea
            value={template.user_prompt_template}
            onChange={e => setTemplate(prev => ({ ...prev, user_prompt_template: e.target.value }))}
            rows={8}
            className="w-full text-xs border border-[var(--border-subtle)] dark:border-zinc-600 rounded-lg px-3 py-2 bg-[var(--bg-primary)] dark:bg-[var(--bg-elevated)] text-[var(--text-primary)] font-mono resize-y focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>

        {/* Message */}
        {message && (
          <p className="text-xs mb-3 text-[var(--accent-text)]">{message}</p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "保存中..." : "保存"}
          </button>
          <button
            onClick={handleReset}
            disabled={saving}
            className="px-4 py-1.5 text-xs font-medium text-[var(--text-secondary)] bg-[var(--bg-secondary)] dark:bg-[var(--bg-elevated)] rounded-lg hover:bg-[var(--border-subtle)] disabled:opacity-50 transition-colors"
          >
            恢复默认
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
