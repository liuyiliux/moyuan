import { useState, useEffect } from "react";
import { Dialog } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Badge } from "./ui/Badge";
import type {
  ProviderConfig,
  ProviderCreate,
  ProviderUpdate,
  TestResult,
} from "../api/provider";
import { providerApi } from "../api/provider";
import { Wifi } from "lucide-react";

const FUNCTION_KEYS = ["summarize", "embedding", "chunking", "quiz"];

const FUNCTION_LABELS: Record<string, string> = {
  summarize: "摘要生成",
  embedding: "嵌入向量",
  chunking: "语义切片",
  quiz: "题库生成",
};

const PROVIDER_TYPES = [
  { value: "openai", label: "OpenAI 兼容" },
  { value: "tencent_ocr", label: "腾讯云 OCR" },
  { value: "tencent_ima", label: "腾讯云 IMA" },
  { value: "custom", label: "自定义" },
];

interface Props {
  open: boolean;
  provider: ProviderConfig | null; // null = create mode
  onClose: () => void;
  onSaved: () => void;
}

export function ProviderModal({ open, provider, onClose, onSaved }: Props) {
  const isEdit = provider !== null;

  const [name, setName] = useState("");
  const [providerType, setProviderType] = useState("openai");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [defaultModels, setDefaultModels] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (provider) {
      setName(provider.name);
      setProviderType(provider.provider_type);
      setBaseUrl(provider.base_url || "");
      setApiKey("");
      setDefaultModels(provider.default_models || {});
    } else {
      setName("");
      setProviderType("openai");
      setBaseUrl("");
      setApiKey("");
      setDefaultModels({});
    }
    setTestResult(null);
    setError("");
  }, [provider, open]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("请输入提供商名称");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (isEdit) {
        const data: ProviderUpdate = { name, provider_type: providerType, base_url: baseUrl || undefined };
        if (apiKey) data.api_key = apiKey;
        data.default_models = Object.keys(defaultModels).length > 0 ? defaultModels : undefined;
        await providerApi.update(provider!.id, data);
      } else {
        const data: ProviderCreate = { name, provider_type: providerType };
        if (baseUrl) data.base_url = baseUrl;
        if (apiKey) data.api_key = apiKey;
        if (Object.keys(defaultModels).length > 0) data.default_models = defaultModels;
        await providerApi.create(data);
      }
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!isEdit) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await providerApi.test(provider!.id);
      setTestResult(result);
    } catch (e: unknown) {
      setTestResult({ success: false, message: e instanceof Error ? e.message : "测试失败", latency_ms: null });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? "编辑提供商" : "新增提供商"}
      size="lg"
      footer={
        <>
          {isEdit && (
            <Button variant="outline" onClick={handleTest} loading={testing}>
              <Wifi className="w-4 h-4" /> 测试连接
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button onClick={handleSave} loading={saving}>
            {isEdit ? "保存" : "创建"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 text-sm text-[var(--danger)] bg-[var(--danger-soft)] dark:bg-red-900/20 rounded-lg">{error}</div>
        )}

        <Input label="名称 *" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：OpenAI、DeepSeek" />

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-[var(--text-secondary)] dark:text-[var(--text-muted)]">类型</label>
          <select
            value={providerType}
            onChange={(e) => setProviderType(e.target.value)}
            className="dao-input w-full"
          >
            {PROVIDER_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <Input label="Base URL" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" />

        <Input
          label="API Key"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          type="password"
          placeholder={isEdit ? "留空则保持原有 Key" : "sk-..."}
        />

        {/* Default Models */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-[var(--text-secondary)] dark:text-[var(--text-muted)]">默认模型</label>
          <p className="text-xs text-[var(--text-muted)]">为不同功能指定默认使用的模型</p>
          <div className="space-y-2 mt-2">
            {FUNCTION_KEYS.map((fn) => (
              <div key={fn} className="flex items-center gap-3">
                <Badge variant="default" className="w-20 justify-center">{FUNCTION_LABELS[fn]}</Badge>
                <input
                  value={defaultModels[fn] || ""}
                  onChange={(e) =>
                    setDefaultModels((prev) => ({ ...prev, [fn]: e.target.value }))
                  }
                  placeholder={fn === "summarize" ? "gpt-4o" : fn === "embedding" ? "Qwen/Qwen3-VL-Embedding-8B" : fn === "chunking" ? "BAAI/bge-m3" : "gpt-4o"}
                  className="dao-input flex-1"
                />
                {fn === "embedding" && (
                  <span className="text-xs text-[var(--text-muted)]">支持多模态</span>
                )}
                {fn === "chunking" && (
                  <span className="text-xs text-[var(--text-muted)]">语义边界检测</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Test Result */}
        {testResult && (
          <div
            className={`p-3 text-sm rounded-lg ${
              testResult.success
                ? "bg-[var(--success-soft)] text-green-700 dark:bg-green-900/20 dark:text-green-400"
                : "bg-[var(--danger-soft)] text-[var(--danger)] dark:bg-red-900/20 dark:text-red-400"
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              <Wifi className="w-4 h-4" />
              {testResult.success ? "连接成功" : "连接失败"}
              {testResult.latency_ms && (
                <span className="text-xs opacity-70">({testResult.latency_ms}ms)</span>
              )}
            </div>
            <p className="mt-1">{testResult.message}</p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
