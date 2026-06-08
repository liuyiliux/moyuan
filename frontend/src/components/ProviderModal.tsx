import { useEffect, useState } from "react";
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
import { Cpu, FileAudio, Settings2, Wifi } from "lucide-react";

const FUNCTION_KEYS = ["summarize", "embedding", "chunking", "quiz", "judge", "ocr", "transcribe", "qa"];

const FUNCTION_LABELS: Record<string, string> = {
  summarize: "摘要",
  embedding: "嵌入",
  chunking: "分块",
  quiz: "出题",
  judge: "判题",
  ocr: "OCR",
  transcribe: "转写",
  qa: "问答",
};

const MODEL_PLACEHOLDERS: Record<string, string> = {
  summarize: "gpt-4o",
  embedding: "Qwen/Qwen3-Embedding-8B",
  chunking: "BAAI/bge-m3",
  quiz: "gpt-4o",
  judge: "gpt-4o-mini",
  ocr: "gpt-4o-mini",
  transcribe: "whisper-1 或 tiny",
  qa: "gpt-4o",
};

const PROVIDER_TYPES = [
  { value: "openai", label: "OpenAI 兼容" },
  { value: "custom", label: "自定义" },
];

const TRANSCRIBE_BACKENDS = [
  { value: "", label: "OpenAI Whisper API" },
  { value: "faster_whisper", label: "本地 faster-whisper" },
];

interface Props {
  open: boolean;
  provider: ProviderConfig | null;
  onClose: () => void;
  onSaved: () => void;
}

function stringParam(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function cleanObject(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => {
      if (value === null || value === undefined) return false;
      if (typeof value === "string") return value.trim() !== "";
      return true;
    })
  );
}

function tryParseJson(value: string): Record<string, unknown> {
  if (!value.trim()) return {};
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("通用参数必须是 JSON 对象");
  }
  return parsed as Record<string, unknown>;
}

export function ProviderModal({ open, provider, onClose, onSaved }: Props) {
  const isEdit = provider !== null;

  const [name, setName] = useState("");
  const [providerType, setProviderType] = useState("openai");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);
  const [defaultModels, setDefaultModels] = useState<Record<string, string>>({});
  const [transcribeBackend, setTranscribeBackend] = useState("");
  const [modelPath, setModelPath] = useState("");
  const [language, setLanguage] = useState("");
  const [device, setDevice] = useState("auto");
  const [computeType, setComputeType] = useState("default");
  const [beamSize, setBeamSize] = useState("5");
  const [rawParams, setRawParams] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [error, setError] = useState("");

  const isLocalTranscribe = transcribeBackend === "faster_whisper";

  useEffect(() => {
    const params = provider?.extra_params || {};
    if (provider) {
      setName(provider.name);
      setProviderType(provider.provider_type);
      setBaseUrl(provider.base_url || "");
      setApiKey("");
      setClearApiKey(false);
      setDefaultModels(provider.default_models || {});
      setTranscribeBackend(stringParam(params, "transcribe_backend"));
      setModelPath(stringParam(params, "model_path"));
      setLanguage(stringParam(params, "language"));
      setDevice(stringParam(params, "device") || "auto");
      setComputeType(stringParam(params, "compute_type") || "default");
      setBeamSize(stringParam(params, "beam_size") || "5");
      const knownKeys = new Set([
        "transcribe_backend",
        "model_path",
        "language",
        "device",
        "compute_type",
        "beam_size",
      ]);
      const rest = Object.fromEntries(Object.entries(params).filter(([key]) => !knownKeys.has(key)));
      setRawParams(Object.keys(rest).length ? JSON.stringify(rest, null, 2) : "");
    } else {
      setName("");
      setProviderType("openai");
      setBaseUrl("");
      setApiKey("");
      setClearApiKey(false);
      setDefaultModels({});
      setTranscribeBackend("");
      setModelPath("");
      setLanguage("");
      setDevice("auto");
      setComputeType("default");
      setBeamSize("5");
      setRawParams("");
    }
    setTestResult(null);
    setError("");
  }, [provider, open]);

  useEffect(() => {
    if (providerType === "custom" && isLocalTranscribe && !baseUrl) {
      setBaseUrl("local:faster-whisper");
    }
  }, [providerType, isLocalTranscribe, baseUrl]);

  const updateModel = (fn: string, value: string) => {
    setDefaultModels((prev) => {
      const next = { ...prev };
      if (value.trim()) next[fn] = value;
      else delete next[fn];
      return next;
    });
  };

  const buildExtraParams = () => {
    const general = tryParseJson(rawParams);
    const typed = cleanObject({
      transcribe_backend: transcribeBackend,
      model_path: modelPath,
      language,
      device: isLocalTranscribe ? device : "",
      compute_type: isLocalTranscribe ? computeType : "",
      beam_size: isLocalTranscribe ? beamSize : "",
    });
    return cleanObject({ ...general, ...typed });
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("请输入提供商名称");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const extraParams = buildExtraParams();
      const models = cleanObject(defaultModels) as Record<string, string>;

      if (isEdit) {
        const data: ProviderUpdate = {
          name,
          provider_type: providerType,
          base_url: baseUrl,
          default_models: models,
          extra_params: extraParams,
        };
        if (clearApiKey) data.api_key = "";
        else if (apiKey.trim()) data.api_key = apiKey;
        await providerApi.update(provider!.id, data);
      } else {
        const data: ProviderCreate = {
          name,
          provider_type: providerType,
          base_url: baseUrl || undefined,
          api_key: apiKey || undefined,
          default_models: Object.keys(models).length > 0 ? models : undefined,
          extra_params: Object.keys(extraParams).length > 0 ? extraParams : undefined,
        };
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
      <div className="max-h-[72vh] overflow-y-auto pr-1 space-y-5">
        {error && (
          <div className="p-3 text-sm text-[var(--danger)] bg-[var(--danger-soft)] dark:bg-red-900/20 rounded-lg">{error}</div>
        )}

        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <Settings2 className="w-4 h-4 text-[var(--accent-text)]" />
            基础配置
          </div>
          <Input label="名称 *" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如 OpenAI、DeepSeek、本地转写" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[var(--text-secondary)] dark:text-[var(--text-muted)]">类型</label>
              <select value={providerType} onChange={(e) => setProviderType(e.target.value)} className="dao-input w-full">
                {PROVIDER_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
            <Input
              label="Base URL"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={isLocalTranscribe ? "local:faster-whisper" : "https://api.openai.com/v1"}
            />
          </div>

          <Input
            label="API Key"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              if (e.target.value.trim()) setClearApiKey(false);
            }}
            type="password"
            disabled={clearApiKey}
            placeholder={isEdit ? "留空则保持原密钥" : "sk-..."}
          />
          {isEdit && (
            <label className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] dark:text-[var(--text-muted)]">
              <input
                type="checkbox"
                checked={clearApiKey}
                onChange={(e) => {
                  setClearApiKey(e.target.checked);
                  if (e.target.checked) setApiKey("");
                }}
                className="h-4 w-4 rounded border-[var(--border)]"
              />
              清空已保存密钥
            </label>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <FileAudio className="w-4 h-4 text-[var(--accent-text)]" />
            转写服务
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[var(--text-secondary)] dark:text-[var(--text-muted)]">后端</label>
              <select value={transcribeBackend} onChange={(e) => setTranscribeBackend(e.target.value)} className="dao-input w-full">
                {TRANSCRIBE_BACKENDS.map((backend) => (
                  <option key={backend.value || "api"} value={backend.value}>{backend.label}</option>
                ))}
              </select>
            </div>
            <Input label="语言" value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="zh、en，留空自动识别" />
          </div>

          {isLocalTranscribe && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input label="模型路径 / 规格" value={modelPath} onChange={(e) => setModelPath(e.target.value)} placeholder="tiny、base 或本地模型目录" />
              <Input label="运行设备" value={device} onChange={(e) => setDevice(e.target.value)} placeholder="auto、cpu、cuda" />
              <Input label="计算精度" value={computeType} onChange={(e) => setComputeType(e.target.value)} placeholder="default、int8、float16" />
              <Input label="搜索束宽" value={beamSize} onChange={(e) => setBeamSize(e.target.value)} type="number" min="1" placeholder="5" />
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <Cpu className="w-4 h-4 text-[var(--accent-text)]" />
            默认模型
          </div>
          <div className="space-y-2">
            {FUNCTION_KEYS.map((fn) => (
              <div key={fn} className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3">
                <Badge variant="default" className="justify-center">{FUNCTION_LABELS[fn]}</Badge>
                <input
                  value={defaultModels[fn] || ""}
                  onChange={(e) => updateModel(fn, e.target.value)}
                  placeholder={MODEL_PLACEHOLDERS[fn]}
                  className="dao-input w-full min-w-0"
                />
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <label className="block text-sm font-medium text-[var(--text-secondary)] dark:text-[var(--text-muted)]">
            通用请求参数 JSON
          </label>
          <textarea
            value={rawParams}
            onChange={(e) => setRawParams(e.target.value)}
            placeholder='{"temperature":0.2,"timeout":30}'
            rows={4}
            className="dao-input w-full font-mono text-xs resize-y"
          />
        </section>

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
              {testResult.latency_ms && <span className="text-xs opacity-70">({testResult.latency_ms}ms)</span>}
            </div>
            <p className="mt-1">{testResult.message}</p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
