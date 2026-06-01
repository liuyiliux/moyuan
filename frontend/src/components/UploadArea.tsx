import { useRef, useState, type DragEvent, type ChangeEvent } from "react";
import { fileApi, type DuplicateInfo } from "../api/content";
import DuplicateModal from "./DuplicateModal";
import { UploadCloud, FileText, FileAudio, FileVideo, FileSpreadsheet, CheckCircle } from "lucide-react";

interface UploadAreaProps {
  onUploaded?: (files: UploadResult[]) => void;
  brainId?: string;
}

export interface UploadResult {
  content_id: string;
  title: string;
  content_type: string;
  is_duplicate: boolean;
  action: "uploaded" | "skipped" | "kept_both";
}

const TYPE_ICON_MAP: Record<string, React.ReactNode> = {
  image: <FileText className="w-5 h-5 text-[var(--success)]" />,
  video: <FileVideo className="w-5 h-5 text-purple-500" />,
  audio: <FileAudio className="w-5 h-5 text-orange-500" />,
  pdf: <FileText className="w-5 h-5 text-[var(--danger)]" />,
  doc: <FileSpreadsheet className="w-5 h-5 text-[var(--accent-text)]" />,
};

function getFileIcon(contentType: string) {
  return TYPE_ICON_MAP[contentType] ?? <FileText className="w-5 h-5 text-[var(--text-muted)]" />;
}

export default function UploadArea({ onUploaded, brainId }: UploadAreaProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Duplicate modal state
  const [dupModal, setDupModal] = useState<{
    filename: string;
    file: File;
    duplicates: DuplicateInfo[];
  } | null>(null);

  /** 等待用户对重复文件的决定 */
  function waitForDupDecision(file: File, duplicates: DuplicateInfo[]): Promise<{ action: "skip" | "upload" | "overwrite"; targetId?: string }> {
    return new Promise((resolve) => {
      setDupModal({
        filename: file.name,
        file,
        duplicates,
      });
      (window as any).__dupResolve = resolve;
    });
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);

    const res: UploadResult[] = [];

    for (const file of Array.from(files)) {
      try {
        // 先检查重复
        const check = await fileApi.checkDuplicate(file);

        let overwriteTargetId: string | undefined;

        if (check.is_duplicate) {
          const decision = await waitForDupDecision(file, check.duplicates);
          if (decision.action === "skip") {
            res.push({
              content_id: check.file_md5,
              title: file.name,
              content_type: "other",
              is_duplicate: true,
              action: "skipped",
            });
            continue;
          }
          if (decision.action === "overwrite" && decision.targetId) {
            overwriteTargetId = decision.targetId;
          }
        }

        // 实际开始上传
        setUploading(true);
        const data = await fileApi.upload(file, brainId, overwriteTargetId);
        res.push({
          content_id: data.content_id,
          title: data.title,
          content_type: data.content_type,
          is_duplicate: data.is_duplicate,
          action: overwriteTargetId ? "kept_both" : check.is_duplicate ? "kept_both" : "uploaded",
        });
      } catch (err) {
        setError((err as Error).message);
        break;
      } finally {
        setUploading(false);
      }
    }

    setResults(res);
    onUploaded?.(res);
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(true);
  }
  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
  }
  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }
  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    handleFiles(e.target.files);
    e.target.value = "";
  }

  return (
    <div className="w-full">
      {/* Drop zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          isDragging
            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
            : "border-[var(--border-subtle)] hover:border-[var(--text-muted)]"
        }`}
      >
        <UploadCloud className="w-10 h-10 mx-auto text-[var(--text-muted)] dark:text-[var(--text-muted)] mb-3" />
        <p className="text-sm text-[var(--text-secondary)] dark:text-[var(--text-muted)]">
          拖拽文件到这里，或{" "}
          <span className="text-[var(--accent-text)] dark:text-[var(--accent-text)] font-medium">点击选择</span>
        </p>
        <p className="text-xs text-[var(--text-muted)] dark:text-[var(--text-muted)] mt-1">
          支持图片、音频、视频、PDF、文档等格式
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={onInputChange}
        />
      </div>

      {/* Uploading indicator */}
      {uploading && (
        <div className="mt-4 flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <span className="animate-spin">⏳</span> 上传中...
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-3 text-sm text-[var(--danger)] bg-[var(--danger-soft)] dark:bg-red-950/30 rounded-lg px-3 py-2">
          ❌ {error}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && !uploading && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-[var(--text-muted)] dark:text-[var(--text-muted)] uppercase tracking-wide">
            上传结果
          </p>
          {results.map((r) => (
            <div
              key={r.content_id}
              className="flex items-center gap-3 bg-[var(--bg-card)] dark:bg-[var(--bg-card)] border border-[var(--border-subtle)] dark:border-[var(--border-subtle)] rounded-lg px-3 py-2"
            >
              {getFileIcon(r.content_type)}
              <span className="flex-1 text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">
                {r.title}
              </span>
              {r.action === "skipped" ? (
                <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">已跳过</span>
              ) : r.action === "kept_both" ? (
                <span className="text-xs text-[var(--accent-text)] dark:text-[var(--accent-text)] whitespace-nowrap">
                  + 已保留
                </span>
              ) : (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 whitespace-nowrap">
                  <CheckCircle className="w-3 h-3" /> 已上传
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Duplicate Modal */}
      {dupModal && (
        <DuplicateModal
          filename={dupModal.filename}
          duplicates={dupModal.duplicates}
          uploading={uploading}
          onSkip={() => {
            (window as any).__dupResolve?.({ action: "skip" });
            setDupModal(null);
          }}
          onOverwrite={(targetId?: string) => {
            (window as any).__dupResolve?.({ action: "overwrite", targetId });
            setDupModal(null);
          }}
          onKeepBoth={() => {
            (window as any).__dupResolve?.({ action: "upload" });
            setDupModal(null);
          }}
          onCancel={() => {
            (window as any).__dupResolve?.({ action: "skip" });
            setDupModal(null);
            setUploading(false);
          }}
        />
      )}
    </div>
  );
}
