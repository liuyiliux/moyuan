import { useState, useEffect, useRef } from "react";
import { RefreshCw, Filter, Copy, Check, AlertCircle, Info, XCircle, Clock } from "lucide-react";
import { Card, Button } from "../components";
import { logsCopy, useCopy } from "../lib/copywriting";
import { api } from "../api/provider";

export default function LogsPage() {
  const lt = useCopy(logsCopy);
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [contentIdFilter, setContentIdFilter] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  async function loadLogs() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("lines", "200");
      if (contentIdFilter.trim()) {
        params.set("content_id", contentIdFilter.trim());
      }
      const data = await api.get<{ logs?: string[] }>(`/analytics/logs?${params}`);
      setLogs(data.logs || []);
    } catch (err) {
      console.error("Failed to load logs:", err);
      setError((err as Error).message);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs();
  }, [contentIdFilter]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadLogs();
    }, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs]);

  function copyLogs() {
    const text = logs.join("");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function getLogLevel(line: string): "info" | "error" | "warning" | "debug" {
    if (line.includes("ERROR")) return "error";
    if (line.includes("WARNING")) return "warning";
    if (line.includes("DEBUG")) return "debug";
    return "info";
  }

  function getLogLevelIcon(level: "info" | "error" | "warning" | "debug") {
    switch (level) {
      case "error":
        return <XCircle className="w-3 h-3 text-danger" />;
      case "warning":
        return <AlertCircle className="w-3 h-3 text-warning" />;
      case "debug":
        return <Info className="w-3 h-3 text-text-muted" />;
      default:
        return <Clock className="w-3 h-3 text-jade" />;
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-serif font-semibold text-text-primary">
            {lt.title}
          </h1>
          <p className="text-sm text-text-muted mt-1.5">
            {lt.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={autoRefresh ? "bg-jade text-text-inverse" : ""}
          >
            <RefreshCw className={`w-4 h-4 ${autoRefresh ? "animate-spin" : ""}`} />
            {autoRefresh ? "停止刷新" : "自动刷新"}
          </Button>
          <Button
            variant="secondary"
            onClick={copyLogs}
            disabled={logs.length === 0}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? lt.copied : lt.copy}
          </Button>
        </div>
      </div>

      <Card className="mb-6">
        <div className="flex items-center gap-3">
          <Filter className="w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder={lt.placeholder}
            value={contentIdFilter}
            onChange={(e) => setContentIdFilter(e.target.value)}
            className="flex-1 dao-input"
          />
          <Button variant="secondary" onClick={loadLogs}>
            <RefreshCw className="w-4 h-4" />
            刷新
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="max-h-[600px] overflow-y-auto font-mono text-sm" ref={logsContainerRef}>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-text-muted">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />
              加载中...
            </div>
          ) : error ? (
            <div className="flex items-center justify-center gap-2 py-12 text-danger">
              <AlertCircle className="h-4 w-4" />
              加载失败: {error}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-text-muted">
              {lt.empty}
            </div>
          ) : (
            <div className="p-4 space-y-1">
              {logs.map((line, index) => {
                const level = getLogLevel(line);
                return (
                  <div
                    key={index}
                    className={`flex items-start gap-2 py-1 px-2 rounded hover:bg-bg-secondary/50 transition-colors ${
                      level === "error" ? "text-danger/90" : "text-text-secondary"
                    }`}
                  >
                    <span className="shrink-0 mt-0.5">{getLogLevelIcon(level)}</span>
                    <span className="break-all whitespace-pre-wrap">{line}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
