import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileWarning,
  Loader2,
  RefreshCw,
  Settings2,
  Trash2,
  Wrench,
} from "lucide-react";
import ConfirmDialog from "../../components/ConfirmDialog";
import Toast from "../../components/Toast";
import { maintenanceApi, type MaintenanceSummary } from "../../api/maintenance";

type Action = "cleanup_orphans" | "cleanup_test_config";
type ToastState = { type: "success" | "error" | "info"; message: string };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function HealthCard({
  title,
  value,
  detail,
  icon,
  status,
  action,
  link,
}: {
  title: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  status: "ok" | "warn" | "danger";
  action?: React.ReactNode;
  link?: React.ReactNode;
}) {
  const colorClass = {
    ok: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-300",
    warn: "text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-300",
    danger: "text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-300",
  }[status];

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${colorClass}`}>{icon}</span>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
          </div>
          <div className="mt-4 text-2xl font-semibold tabular-nums text-[var(--text-primary)]">{value}</div>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{detail}</p>
        </div>
        {(action || link) && <div className="flex shrink-0 flex-col gap-2">{action}{link}</div>}
      </div>
    </div>
  );
}

export default function MaintenancePage() {
  const [summary, setSummary] = useState<MaintenanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<Action | null>(null);
  const [confirmAction, setConfirmAction] = useState<Action | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const testConfigCount = useMemo(
    () => (summary?.test_data.providers ?? 0) + (summary?.test_data.bindings ?? 0),
    [summary],
  );
  const processingCount = useMemo(
    () => (summary?.processing.stuck_contents ?? 0) + (summary?.processing.stale_tasks ?? 0),
    [summary],
  );

  async function load() {
    setLoading(true);
    try {
      setSummary(await maintenanceApi.summary());
    } catch (error) {
      setToast({ type: "error", message: `加载维护信息失败：${(error as Error).message}` });
    } finally {
      setLoading(false);
    }
  }

  async function runAction(action: Action) {
    setBusyAction(action);
    try {
      const result = await maintenanceApi.action(action);
      if (action === "cleanup_orphans") {
        setToast({
          type: "success",
          message: `已清理 ${result.deleted_count ?? 0} 个孤儿文件，释放 ${formatBytes(Number(result.deleted_bytes ?? 0))}`,
        });
      } else {
        setToast({
          type: "success",
          message: `已清理 ${result.deleted_providers ?? 0} 个测试服务商、${result.deleted_bindings ?? 0} 条测试绑定`,
        });
      }
      await load();
    } catch (error) {
      setToast({ type: "error", message: `维护操作失败：${(error as Error).message}` });
    } finally {
      setBusyAction(null);
      setConfirmAction(null);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-[var(--text-primary)]">
            <Wrench className="h-6 w-6 text-[var(--text-secondary)]" />
            数据维护
          </h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">集中检查孤儿文件、测试数据、未归属内容和处理异常。</p>
        </div>
        <button onClick={load} disabled={loading} className="dao-btn dao-btn-secondary text-sm inline-flex items-center gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          重新扫描
        </button>
      </div>

      {loading && !summary ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
        </div>
      ) : summary ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <HealthCard
              title="孤儿物理文件"
              value={`${summary.orphan_files.count} 个`}
              detail={`未被数据库引用，占用 ${formatBytes(summary.orphan_files.bytes)}`}
              icon={<FileWarning className="h-4 w-4" />}
              status={summary.orphan_files.count > 0 ? "warn" : "ok"}
              action={
                <button
                  onClick={() => setConfirmAction("cleanup_orphans")}
                  disabled={summary.orphan_files.count === 0 || busyAction !== null}
                  className="dao-btn text-xs bg-[var(--danger-soft)] text-[var(--danger)] disabled:opacity-50"
                >
                  {busyAction === "cleanup_orphans" ? "清理中" : "清理"}
                </button>
              }
            />
            <HealthCard
              title="测试配置残留"
              value={`${testConfigCount} 项`}
              detail={`测试服务商 ${summary.test_data.providers} 个，测试绑定 ${summary.test_data.bindings} 条`}
              icon={<Settings2 className="h-4 w-4" />}
              status={testConfigCount > 0 ? "danger" : "ok"}
              action={
                <button
                  onClick={() => setConfirmAction("cleanup_test_config")}
                  disabled={testConfigCount === 0 || busyAction !== null}
                  className="dao-btn text-xs bg-[var(--danger-soft)] text-[var(--danger)] disabled:opacity-50"
                >
                  {busyAction === "cleanup_test_config" ? "清理中" : "清理"}
                </button>
              }
            />
            <HealthCard
              title="未归属内容"
              value={`${summary.unassigned.total} 条`}
              detail={`可归入 ${summary.unassigned.active} 条，回收站/已删除 ${summary.unassigned.deleted} 条`}
              icon={<Database className="h-4 w-4" />}
              status={summary.unassigned.active > 0 ? "warn" : "ok"}
              link={<Link to="/brains" className="dao-btn dao-btn-ghost text-xs">去处理</Link>}
            />
            <HealthCard
              title="回收站"
              value={`${summary.recycle.deleted} 条`}
              detail="已软删除内容，可在回收站恢复或永久删除"
              icon={<Trash2 className="h-4 w-4" />}
              status={summary.recycle.deleted > 0 ? "warn" : "ok"}
              link={<Link to="/recycle" className="dao-btn dao-btn-ghost text-xs">打开</Link>}
            />
            <HealthCard
              title="处理异常"
              value={`${processingCount} 项`}
              detail={`卡住内容 ${summary.processing.stuck_contents} 条，过期任务 ${summary.processing.stale_tasks} 条`}
              icon={<AlertTriangle className="h-4 w-4" />}
              status={processingCount > 0 ? "danger" : "ok"}
              link={<Link to="/processing" className="dao-btn dao-btn-ghost text-xs">查看队列</Link>}
            />
            <HealthCard
              title="绑定完整性"
              value={`${summary.invalid_config.bindings} 条`}
              detail="指向不存在服务商的功能绑定"
              icon={<CheckCircle2 className="h-4 w-4" />}
              status={summary.invalid_config.bindings > 0 ? "danger" : "ok"}
              link={<Link to="/settings" className="dao-btn dao-btn-ghost text-xs">去设置</Link>}
            />
          </div>

          {summary.orphan_files.samples.length > 0 && (
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">孤儿文件样本</h3>
              <div className="mt-3 divide-y divide-[var(--border-subtle)] text-sm">
                {summary.orphan_files.samples.slice(0, 8).map((item) => (
                  <div key={item.path} className="flex items-center justify-between gap-4 py-2">
                    <code className="truncate text-xs text-[var(--text-secondary)]">{item.path}</code>
                    <span className="shrink-0 text-xs text-[var(--text-muted)]">{formatBytes(item.size)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmAction === "cleanup_orphans"}
        title="清理孤儿文件"
        message={`确定要删除 ${summary?.orphan_files.count ?? 0} 个未被数据库引用的物理文件吗？此操作不可恢复。`}
        confirmLabel="确认清理"
        variant="danger"
        loading={busyAction === "cleanup_orphans"}
        onConfirm={() => void runAction("cleanup_orphans")}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === "cleanup_test_config"}
        title="清理测试配置"
        message={`确定要删除测试服务商和测试功能绑定吗？真实配置不会被删除。`}
        confirmLabel="确认清理"
        variant="danger"
        loading={busyAction === "cleanup_test_config"}
        onConfirm={() => void runAction("cleanup_test_config")}
        onCancel={() => setConfirmAction(null)}
      />
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
}
