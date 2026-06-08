import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, FolderInput, Loader2, Play, RefreshCw, Sparkles, UploadCloud } from "lucide-react";
import { importsApi, type ImportBatch } from "../../api/imports";
import { useBrain } from "../../lib/brain-context";
import Toast from "../../components/Toast";
import { fileApi } from "../../api/content";

const PAGE_SIZE = 20;

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function progress(batch: ImportBatch): number {
  if (batch.active <= 0) return 0;
  return Math.round((batch.completed / batch.active) * 100);
}

function statusText(batch: ImportBatch): string {
  if (batch.failed > 0) return `${batch.failed} 个失败`;
  if (batch.processing > 0) return `${batch.processing} 个处理中`;
  if (batch.active > 0 && batch.completed >= batch.active) return "已完成";
  if (batch.active > 0) return "待处理";
  return "无可处理内容";
}

function fileRelativePath(file: File): string {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

function lessonKey(file: File): string {
  const name = stripExtension(baseName(fileRelativePath(file)));
  return name.replace(/\.ai-zh$/i, "").replace(/\.danmaku$/i, "");
}

function lessonIndex(title: string): number | undefined {
  const match = title.match(/^(\d{1,3})[_\s-]/);
  return match ? Number(match[1]) : undefined;
}

function isVideo(file: File): boolean {
  return /\.(mp4|mov|mkv|webm)$/i.test(baseName(fileRelativePath(file)));
}

function isSubtitle(file: File): boolean {
  return /\.srt$/i.test(baseName(fileRelativePath(file)));
}

function isDanmaku(file: File): boolean {
  return /\.danmaku\.json$/i.test(baseName(fileRelativePath(file)));
}

function srtToText(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (/^\d+$/.test(trimmed)) return false;
      if (/^\d{2}:\d{2}:\d{2}[,.]\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}[,.]\d{3}/.test(trimmed)) return false;
      return true;
    })
    .map((line) => line.replace(/<[^>]+>/g, "").trim())
    .filter(Boolean)
    .join("\n");
}

type CourseLesson = {
  key: string;
  title: string;
  video: File;
  subtitle?: File;
  danmaku?: File;
};

export default function ImportsPage() {
  const { currentBrainId } = useBrain();
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ImportBatch[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyBatch, setBusyBatch] = useState<string | null>(null);
  const [courseImporting, setCourseImporting] = useState(false);
  const [courseProgress, setCourseProgress] = useState<{ done: number; total: number } | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await importsApi.batches({ brainId: currentBrainId, page, pageSize: PAGE_SIZE });
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [currentBrainId, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [currentBrainId]);

  async function runBatchAction(batch: ImportBatch, action: "chunk_pending" | "embed_ready") {
    setBusyBatch(`${batch.batch_id}:${action}`);
    try {
      const result = await importsApi.action(batch.batch_id, action, currentBrainId);
      setToast({
        type: "success",
        message: action === "chunk_pending"
          ? `已入队分块 ${result.success} 条`
          : `已入队嵌入 ${result.success} 条`,
      });
      await load();
    } catch (err) {
      setToast({ type: "error", message: `批次操作失败：${(err as Error).message}` });
    } finally {
      setBusyBatch(null);
    }
  }

  async function importCourseFolder(files: FileList | null) {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files).filter((file) => !fileRelativePath(file).split(/[\\/]/).some((part) => part === ".tmp"));
    const lessonMap = new Map<string, Partial<CourseLesson>>();
    for (const file of fileArray) {
      const key = lessonKey(file);
      const current = lessonMap.get(key) || { key, title: key };
      if (isVideo(file)) current.video = file;
      else if (isSubtitle(file)) current.subtitle = file;
      else if (isDanmaku(file)) current.danmaku = file;
      lessonMap.set(key, current);
    }
    const lessons = Array.from(lessonMap.values())
      .filter((item): item is CourseLesson => Boolean(item.video))
      .sort((a, b) => (lessonIndex(a.title) ?? 9999) - (lessonIndex(b.title) ?? 9999) || a.title.localeCompare(b.title, "zh-CN"));

    if (lessons.length === 0) {
      setToast({ type: "error", message: "没有找到可导入的视频文件。" });
      return;
    }

    const batchId = crypto.randomUUID();
    setCourseImporting(true);
    setCourseProgress({ done: 0, total: lessons.length });
    try {
      for (const lesson of lessons) {
        const subtitleText = lesson.subtitle ? srtToText(await lesson.subtitle.text()) : undefined;
        await fileApi.upload(
          lesson.video,
          currentBrainId || undefined,
          undefined,
          fileRelativePath(lesson.video),
          batchId,
          {
            titleOverride: lesson.title,
            textContent: subtitleText,
            subtitlePath: lesson.subtitle ? fileRelativePath(lesson.subtitle) : undefined,
            danmakuPath: lesson.danmaku ? fileRelativePath(lesson.danmaku) : undefined,
            courseIndex: lessonIndex(lesson.title),
            courseImport: true,
          },
        );
        setCourseProgress((prev) => prev ? { ...prev, done: prev.done + 1 } : prev);
      }
      setToast({ type: "success", message: `课程导入完成：${lessons.length} 节课` });
      await load();
    } catch (err) {
      setToast({ type: "error", message: `课程导入失败：${(err as Error).message}` });
    } finally {
      setCourseImporting(false);
      setCourseProgress(null);
    }
  }

  function onCourseFolderChange(event: ChangeEvent<HTMLInputElement>) {
    void importCourseFolder(event.target.files);
    event.target.value = "";
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-[var(--text-primary)]">
            <FolderInput className="h-6 w-6 text-[var(--text-secondary)]" />
            导入批次
          </h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">按文件夹导入记录查看资料批次、处理进度和失败项。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => folderInputRef.current?.click()} disabled={courseImporting} className="dao-btn dao-btn-primary text-sm inline-flex items-center gap-2">
            {courseImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            导入课程文件夹
          </button>
          <input
            ref={(el) => {
              folderInputRef.current = el;
              if (el) {
                const input = el as HTMLInputElement & { webkitdirectory?: boolean; directory?: boolean };
                input.webkitdirectory = true;
                input.directory = true;
              }
            }}
            type="file"
            multiple
            className="hidden"
            onChange={onCourseFolderChange}
          />
          <button onClick={load} disabled={loading} className="dao-btn dao-btn-secondary text-sm inline-flex items-center gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            刷新
          </button>
        </div>
      </div>

      {courseProgress && (
        <div className="mb-5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-3">
          <div className="flex items-center justify-between text-sm text-[var(--text-secondary)]">
            <span>课程导入中</span>
            <span className="tabular-nums">{courseProgress.done} / {courseProgress.total}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
            <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${(courseProgress.done / courseProgress.total) * 100}%` }} />
          </div>
        </div>
      )}

      {loading && items.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-[var(--danger)]/20 bg-[var(--danger-soft)] p-5 text-sm text-[var(--danger)]">
          加载失败：{error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-10 text-center">
          <FolderInput className="mx-auto h-10 w-10 text-[var(--text-muted)]" />
          <p className="mt-4 text-sm text-[var(--text-muted)]">暂无文件夹导入批次。</p>
          <Link to="/contents" className="dao-btn dao-btn-primary mt-5 inline-flex text-sm">去导入资料</Link>
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-4">
          {items.map((batch) => {
            const pct = progress(batch);
            const contentUrl = `/contents?import_batch_id=${encodeURIComponent(batch.batch_id)}`;
            return (
              <div key={batch.batch_id} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-semibold text-[var(--text-primary)]">
                        {batch.import_root || "未命名导入"}
                      </h2>
                      <span className="rounded-full bg-[var(--bg-secondary)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
                        {batch.total} 条
                      </span>
                      {batch.failed > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-600">
                          <AlertTriangle className="h-3 w-3" /> {statusText(batch)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" /> {statusText(batch)}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      批次 {batch.batch_id} · 创建 {formatDate(batch.created_at)} · 更新 {formatDate(batch.updated_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => void runBatchAction(batch, "chunk_pending")}
                      disabled={batch.pending + batch.failed === 0 || busyBatch !== null}
                      className="dao-btn dao-btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {busyBatch === `${batch.batch_id}:chunk_pending` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                      分块待处理
                    </button>
                    <button
                      onClick={() => void runBatchAction(batch, "embed_ready")}
                      disabled={batch.ready_to_embed === 0 || busyBatch !== null}
                      className="dao-btn dao-btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {busyBatch === `${batch.batch_id}:embed_ready` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      嵌入已分块
                    </button>
                    <Link to={contentUrl} className="dao-btn dao-btn-secondary text-xs">查看内容</Link>
                    <Link to="/processing" className="dao-btn dao-btn-ghost text-xs">处理队列</Link>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <span>处理进度</span>
                    <span>{batch.completed} / {batch.active}，{pct}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
                    <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-[var(--text-secondary)] sm:grid-cols-4 lg:grid-cols-7">
                  <span>可用 {batch.active}</span>
                  <span>待分块 {batch.pending}</span>
                  <span>待嵌入 {batch.ready_to_embed}</span>
                  <span>已完成 {batch.completed}</span>
                  <span>处理中 {batch.processing}</span>
                  <span>失败 {batch.failed}</span>
                  <span>回收站 {batch.deleted}</span>
                </div>

                {batch.samples.length > 0 && (
                  <div className="mt-4 divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-subtle)]">
                    {batch.samples.map((item) => (
                      <Link key={item.id} to={`/contents/${item.id}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-[var(--bg-secondary)]">
                        <span className="truncate text-[var(--text-primary)]">{item.title}</span>
                        <span className="shrink-0 text-xs text-[var(--text-muted)]">{item.content_type} · {item.processing_status}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            disabled={page <= 1}
            className="dao-btn dao-btn-secondary text-sm disabled:opacity-50"
          >
            上一页
          </button>
          <span className="text-sm tabular-nums text-[var(--text-muted)]">{page} / {totalPages}</span>
          <button
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            disabled={page >= totalPages}
            className="dao-btn dao-btn-secondary text-sm disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      )}
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
}
