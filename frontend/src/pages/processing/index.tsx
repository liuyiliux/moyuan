import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import {
  contentApi,
  fileApi,
  type ProcessingCenterAction,
  type ProcessingCenterItem,
  type ProcessingCenterResponse,
} from "../../api/content";
import { useBrain } from "../../lib/brain-context";

type ProcessingGroup = "active" | "needs_action" | "failed" | "done" | "all";

const PAGE_SIZE = 20;

const groupOptions: Array<{ value: ProcessingGroup; label: string }> = [
  { value: "active", label: "进行中" },
  { value: "needs_action", label: "待处理" },
  { value: "failed", label: "失败" },
  { value: "done", label: "已完成" },
  { value: "all", label: "全部" },
];

const statusLabels: Record<string, string> = {
  pending: "待处理",
  queued: "排队中",
  processing: "解析中",
  chunking: "切块中",
  chunked: "待嵌入",
  embedding: "嵌入中",
  completed: "已完成",
  partial: "部分完成",
  failed: "失败",
};

const typeLabels: Record<string, string> = {
  note: "笔记",
  image: "图片",
  video: "视频",
  audio: "音频",
  pdf: "PDF",
  doc: "文档",
  web: "网页",
  other: "其他",
};

function statusClass(status: string): string {
  if (status === "failed") return "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300";
  if (status === "completed") return "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300";
  if (status === "chunked" || status === "partial") return "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
  if (status === "processing" || status === "chunking" || status === "embedding") return "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300";
  return "bg-[var(--bg-secondary)] text-[var(--text-secondary)]";
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function shortError(value: string | null): string {
  if (!value) return "";
  const firstLine = value.split(/\r?\n/).find((line) => line.trim());
  return (firstLine || value).slice(0, 180);
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-[var(--text-muted)]">{label}</span>
        <span className="text-[var(--text-muted)]">{icon}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{value}</div>
    </div>
  );
}

function ActionButton({
  item,
  busy,
  onEnqueue,
  onEmbed,
}: {
  item: ProcessingCenterItem;
  busy: boolean;
  onEnqueue: (item: ProcessingCenterItem) => void;
  onEmbed: (item: ProcessingCenterItem) => void;
}) {
  if (item.processing_status === "chunked" || item.processing_status === "partial") {
    return (
      <button
        onClick={() => onEmbed(item)}
        disabled={busy}
        className="dao-btn dao-btn-secondary text-xs inline-flex items-center gap-1.5 px-3 py-1.5 disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        生成嵌入
      </button>
    );
  }

  if (item.processing_status === "pending" || item.processing_status === "failed") {
    return (
      <button
        onClick={() => onEnqueue(item)}
        disabled={busy}
        className="dao-btn dao-btn-primary text-xs inline-flex items-center gap-1.5 px-3 py-1.5 disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
        入队处理
      </button>
    );
  }

  return null;
}

export default function ProcessingPage() {
  const { currentBrainId } = useBrain();
  const [group, setGroup] = useState<ProcessingGroup>("active");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ProcessingCenterResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [bulkAction, setBulkAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await contentApi.processingCenter({
        brainId: currentBrainId,
        group,
        page,
        pageSize: PAGE_SIZE,
      });
      setData(result);
    } catch (e) {
      setError((e as Error).message || "加载处理状态失败");
    } finally {
      setLoading(false);
    }
  }, [currentBrainId, group, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      void load();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, load]);

  useEffect(() => {
    setPage(1);
  }, [currentBrainId, group]);

  const totalPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, Math.ceil(data.total / data.page_size));
  }, [data]);

  const handleEnqueue = async (item: ProcessingCenterItem) => {
    setActionId(item.id);
    try {
      await fileApi.enqueueProcessing(item.id);
      await load();
    } catch (e) {
      setError((e as Error).message || "入队失败");
    } finally {
      setActionId(null);
    }
  };

  const handleEmbed = async (item: ProcessingCenterItem) => {
    setActionId(item.id);
    try {
      await contentApi.embedContent(item.id);
      await load();
    } catch (e) {
      setError((e as Error).message || "生成嵌入失败");
    } finally {
      setActionId(null);
    }
  };

  const handleBulkAction = async (action: ProcessingCenterAction) => {
    setBulkAction(action);
    setError(null);
    setNotice(null);
    try {
      const result = await contentApi.runProcessingCenterAction(action, currentBrainId);
      if (action === "reset_stuck_embeddings") {
        setNotice(`已重置 ${result.reset} 个卡住的嵌入任务`);
      } else if (action === "cancel_queued") {
        setNotice(`已取消 ${result.cancelled} 个排队任务`);
      } else if (action === "clear_finished_tasks") {
        setNotice(`已清理 ${result.cleared} 条历史任务`);
      } else {
        setNotice(`已入队 ${result.queued} 个内容`);
      }
      await load();
    } catch (e) {
      setError((e as Error).message || "批量操作失败");
    } finally {
      setBulkAction(null);
    }
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center">
                <Activity className="w-5 h-5 text-[var(--accent-text)]" />
              </div>
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">处理状态中心</h1>
            </div>
            <p className="mt-2 text-sm text-[var(--text-muted)]">查看解析、切块、嵌入和失败重试状态</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void load()}
              disabled={loading}
              className="dao-btn dao-btn-secondary text-sm inline-flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              刷新
            </button>
            <button
              onClick={() => setAutoRefresh((value) => !value)}
              className={`dao-btn text-sm inline-flex items-center gap-2 ${
                autoRefresh ? "dao-btn-primary" : "dao-btn-secondary"
              }`}
            >
              <Activity className="w-4 h-4" />
              {autoRefresh ? "自动刷新中" : "自动刷新"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
          <StatCard icon={<Database className="w-4 h-4" />} label="总内容" value={data?.summary.total ?? 0} />
          <StatCard icon={<Clock className="w-4 h-4" />} label="进行中" value={data?.summary.active ?? 0} />
          <StatCard icon={<AlertTriangle className="w-4 h-4" />} label="待处理" value={data?.summary.needs_action ?? 0} />
          <StatCard icon={<CheckCircle2 className="w-4 h-4" />} label="已完成" value={data?.summary.completed ?? 0} />
          <StatCard icon={<Activity className="w-4 h-4" />} label="队列中" value={data?.queue_size ?? 0} />
        </div>

        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border-subtle)]">
            <div className="flex flex-wrap gap-2">
              {groupOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setGroup(option.value)}
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                    group === option.value
                      ? "bg-[var(--accent-soft)] text-[var(--accent-text)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="text-xs text-[var(--text-muted)]">
              任务：排队 {data?.tasks.queued ?? 0} / 处理中 {data?.tasks.processing ?? 0} / 失败 {data?.tasks.failed ?? 0}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]/40">
            <button
              onClick={() => void handleBulkAction("retry_failed")}
              disabled={!!bulkAction || (data?.summary.failed ?? 0) === 0}
              className="dao-btn dao-btn-secondary text-xs inline-flex items-center gap-1.5 px-3 py-1.5 disabled:opacity-50"
            >
              {bulkAction === "retry_failed" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              重试失败
            </button>
            <button
              onClick={() => void handleBulkAction("embed_ready")}
              disabled={!!bulkAction || ((data?.summary.by_status.chunked ?? 0) + (data?.summary.by_status.partial ?? 0)) === 0}
              className="dao-btn dao-btn-secondary text-xs inline-flex items-center gap-1.5 px-3 py-1.5 disabled:opacity-50"
            >
              {bulkAction === "embed_ready" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              嵌入待处理
            </button>
            <button
              onClick={() => void handleBulkAction("reset_stuck_embeddings")}
              disabled={!!bulkAction || (data?.summary.by_status.embedding ?? 0) === 0}
              className="dao-btn dao-btn-ghost text-xs inline-flex items-center gap-1.5 px-3 py-1.5 disabled:opacity-50"
            >
              {bulkAction === "reset_stuck_embeddings" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />}
              重置卡住
            </button>
            <button
              onClick={() => void handleBulkAction("cancel_queued")}
              disabled={!!bulkAction || (data?.tasks.queued ?? 0) === 0}
              className="dao-btn dao-btn-ghost text-xs inline-flex items-center gap-1.5 px-3 py-1.5 disabled:opacity-50"
            >
              {bulkAction === "cancel_queued" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
              取消排队
            </button>
            <button
              onClick={() => void handleBulkAction("clear_finished_tasks")}
              disabled={
                !!bulkAction ||
                ((data?.tasks.completed ?? 0) + (data?.tasks.failed ?? 0) + (data?.tasks.cancelled ?? 0)) === 0
              }
              className="dao-btn dao-btn-ghost text-xs inline-flex items-center gap-1.5 px-3 py-1.5 disabled:opacity-50"
            >
              {bulkAction === "clear_finished_tasks" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              清理历史
            </button>
            {notice && <span className="text-xs text-emerald-600 dark:text-emerald-300">{notice}</span>}
          </div>

          {error && (
            <div className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--text-muted)]" />
            </div>
          ) : data && data.items.length > 0 ? (
            <div className="divide-y divide-[var(--border-subtle)]">
              {data.items.map((item) => (
                <div key={item.id} className="px-4 py-4 hover:bg-[var(--bg-secondary)]/60 transition-colors">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/contents/${item.id}`} className="font-medium text-[var(--text-primary)] hover:text-[var(--accent-text)] truncate">
                          {item.title}
                        </Link>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${statusClass(item.processing_status)}`}>
                          {statusLabels[item.processing_status] || item.processing_status}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
                        <span>{typeLabels[item.content_type] || item.content_type}</span>
                        <span>分块 {item.chunk_count}</span>
                        <span>已嵌入 {item.embedded_chunks}</span>
                        <span>更新 {formatDate(item.updated_at)}</span>
                        {item.latest_task && (
                          <span>
                            最近任务 {statusLabels[item.latest_task.status] || item.latest_task.status}
                            {item.latest_task.progress ? ` ${item.latest_task.progress}%` : ""}
                          </span>
                        )}
                      </div>
                      {(item.processing_error || item.latest_task?.error_message) && (
                        <div className="mt-2 flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span className="break-words">{shortError(item.processing_error || item.latest_task?.error_message || "")}</span>
                        </div>
                      )}
                      {item.recent_tasks.length > 0 && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="text-xs text-[var(--text-muted)]">任务时间线</span>
                          {item.recent_tasks.map((task) => (
                            <span
                              key={task.id}
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${statusClass(task.status)}`}
                              title={formatDate(task.created_at)}
                            >
                              {task.task_type}
                              <span>{statusLabels[task.status] || task.status}</span>
                              {task.progress > 0 && task.progress < 100 && <span>{task.progress}%</span>}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <ActionButton
                        item={item}
                        busy={actionId === item.id}
                        onEnqueue={handleEnqueue}
                        onEmbed={handleEmbed}
                      />
                      <Link to={`/contents/${item.id}`} className="dao-btn dao-btn-ghost text-xs px-3 py-1.5">
                        详情
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-16 text-center">
              <RotateCcw className="w-10 h-10 mx-auto text-[var(--text-muted)] mb-3" />
              <div className="text-sm font-medium text-[var(--text-primary)]">当前没有内容</div>
              <div className="mt-1 text-xs text-[var(--text-muted)]">切换筛选或上传资料后再查看</div>
            </div>
          )}

          {data && data.total > data.page_size && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-subtle)] text-sm">
              <span className="text-[var(--text-muted)]">
                第 {data.page} / {totalPages} 页，共 {data.total} 条
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="dao-btn dao-btn-ghost text-xs px-3 py-1.5 disabled:opacity-50"
                >
                  上一页
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="dao-btn dao-btn-ghost text-xs px-3 py-1.5 disabled:opacity-50"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
