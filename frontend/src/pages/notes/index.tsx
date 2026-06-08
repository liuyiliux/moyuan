import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus, Save, Trash2, Star, Pin, FileText, Loader2, Clock,
  Eye, Columns, Edit3,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import VersionHistoryPanel from "../../components/VersionHistoryPanel";
import ConfirmDialog from "../../components/ConfirmDialog";
import Toast from "../../components/Toast";
import { Card, Button } from "../../components";
import { notesCopy, useCopy } from "../../lib/copywriting";
import { useBrain } from "../../lib/brain-context";
import { api } from "../../api/provider";

interface Note {
  id: string;
  title: string;
  content: string;
  is_starred: boolean;
  is_pinned: boolean;
  brain_id?: string | null;
  created_at: string | null;
  updated_at: string | null;
  version_count: number;
  versions?: { title: string; text_content: string; updated_at: string }[];
}

const noteApi = {
  list: (page = 1, star = false, brainId?: string | null) => {
    const qs = new URLSearchParams({ page: String(page), page_size: "50", star: String(star) });
    if (brainId) qs.set("brain_id", brainId);
    return api.get<{ items: Note[] }>(`/notes?${qs.toString()}`);
  },
  get: (id: string) => api.get<Note>(`/notes/${id}`),
  create: (title: string, content = "", brainId?: string | null) =>
    api.post<Note>("/notes", { title, content, brain_id: brainId || undefined }),
  update: (id: string, data: { title?: string; content?: string; create_version?: boolean }) =>
    api.put<Note>(`/notes/${id}`, data),
  delete: (id: string) => api.delete<unknown>(`/notes/${id}`),
};

export default function NotesPage() {
  const nt = useCopy(notesCopy);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentBrainId } = useBrain();
  const noteId = searchParams.get("id");

  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [viewMode, setViewMode] = useState<"edit" | "split" | "preview">("edit");
  const [starOnly, setStarOnly] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Note | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    const data = await noteApi.list(1, starOnly, currentBrainId);
    setNotes(data.items || []);
    setLoading(false);
  }, [starOnly, currentBrainId]);

  const loadNote = useCallback(async (id: string) => {
    const note = await noteApi.get(id);
    if (currentBrainId && note.brain_id && note.brain_id !== currentBrainId) {
      navigate("/notes");
      return;
    }
    setEditing(note);
    setTitle(note.title);
    setContent(note.content || "");
    setShowVersions(false);
  }, [currentBrainId, navigate]);

  useEffect(() => {
    if (noteId) {
      loadNote(noteId);
    } else {
      setEditing(null);
      setTitle("");
      setContent("");
    }
  }, [noteId, loadNote]);

  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    }
    if (noteId) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [title, content, editing]);

  async function handleSave(createVersion = false) {
    if (!title.trim()) return;
    setSaving(true);
    try {
      let result;
      if (editing) {
        result = await noteApi.update(editing.id, { title, content, create_version: createVersion });
      } else {
        result = await noteApi.create(title, content, currentBrainId);
      }
      setEditing(result);
      setLastSaved(new Date().toLocaleTimeString("zh-CN"));
      await loadList();
      if (!editing) navigate(`/notes?id=${result.id}`);
      setToast({ type: "success", message: createVersion ? "已保存新版本" : "笔记已保存" });
    } catch (e) {
      setToast({ type: "error", message: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveVersion() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      // 先保存当前内容（不记版本），确保编辑器内容落库
      const r1 = await noteApi.update(editing!.id, { title, content, create_version: false });
      setEditing(r1);
      // 再新增版本（create_version=true 会快照刚才保存的内容）
      const r2 = await noteApi.update(editing!.id, { title, content, create_version: true });
      setEditing(r2);
      setLastSaved(new Date().toLocaleTimeString("zh-CN"));
      await loadList();
      setToast({ type: "success", message: "已保存新版本" });
    } catch (e) {
      setToast({ type: "error", message: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await noteApi.delete(deleteTarget.id);
      if (editing?.id === deleteTarget.id) {
        setEditing(null);
        navigate("/notes");
      }
      setDeleteTarget(null);
      setToast({ type: "success", message: "已归入归墟" });
      await loadList();
    } catch (e) {
      setToast({ type: "error", message: "删除失败: " + (e as Error).message });
    } finally {
      setDeleting(false);
    }
  }

  async function handleNew() {
    try {
      const result = await noteApi.create("新笔记", "", currentBrainId);
      await loadList();
      navigate(`/notes?id=${result.id}`);
      setToast({ type: "success", message: "新笔记已创建" });
    } catch (e) {
      setToast({ type: "error", message: "创建失败: " + (e as Error).message });
    }
  }

  function handleVersionRestore(restoredTitle: string, restoredContent: string) {
    setTitle(restoredTitle);
    setContent(restoredContent);
  }

  function formatDate(iso: string | null) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="max-w-[90vw] mx-auto px-6 py-8">
      {!loading && notes.length === 0 && !noteId ? (
        <div className="flex items-center justify-center h-[80vh]">
          <Card className="p-10 text-center max-w-md">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-accent-soft mb-6">
              <FileText className="w-10 h-10 text-jade/60" />
            </div>
            <h2 className="text-xl font-serif font-semibold text-text-primary mb-2">书空白页</h2>
            <p className="text-text-muted text-sm mb-6">落笔成书，记录数字修行之道</p>
            <Button onClick={handleNew} size="lg">
              <Plus className="w-5 h-5" />
              开卷落笔
            </Button>
          </Card>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-serif font-semibold text-text-primary">{nt.title}</h1>
              <p className="text-sm text-text-muted mt-1.5">{nt.subtitle}</p>
            </div>
            {noteId && (
              <Button onClick={handleNew}>
                <Plus className="w-4 h-4" />
                {nt.btnNew}
              </Button>
            )}
          </div>

          <div className="flex gap-6">
            <div className="w-48 flex-shrink-0">
              <Card className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-text-primary">墨宝录</h2>
                </div>

                <button
                  onClick={() => setStarOnly(!starOnly)}
                  className={`mb-3 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all w-full ${
                    starOnly
                      ? "bg-accent-soft text-jade"
                      : "bg-bg-secondary text-text-secondary hover:bg-accent-soft hover:text-jade"
                  }`}
                >
                  <Star className={`w-4 h-4 ${starOnly ? "fill-gold text-gold" : ""}`} />
                  {starOnly ? "珍藏墨宝" : "全部墨宝"}
                </button>

                {loading && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
                  </div>
                )}

                <div className="space-y-1 max-h-[calc(100vh-300px)] overflow-y-auto">
                  {notes.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => navigate(`/notes?id=${n.id}`)}
                      className={`group px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                        editing?.id === n.id
                          ? "bg-accent-soft border border-jade/30"
                          : "hover:bg-bg-secondary"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {n.is_pinned && <Pin className="w-3.5 h-3.5 text-jade" />}
                        <span className="text-sm text-text-primary truncate flex-1">
                          {n.title || "无题"}
                        </span>
                        {n.is_starred && <Star className="w-3.5 h-3.5 text-gold fill-gold" />}
                      </div>
                      <p className="text-xs text-text-muted mt-1">
                        {formatDate(n.updated_at)}
                        {n.version_count > 0 && ` · ${n.version_count} 版`}
                      </p>
                    </div>
                  ))}
                  {!loading && notes.length === 0 && (
                    <p className="text-center py-8 text-sm text-text-muted">尚无墨宝</p>
                  )}
                </div>
              </Card>
            </div>

            <div className="flex-1 min-w-0">
              {!noteId && (
                <div className="flex items-center justify-center h-[60vh] text-center">
                  <Card className="p-8 max-w-sm">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-accent-soft mb-6">
                      <FileText className="w-8 h-8 text-jade/60" />
                    </div>
                    <p className="text-text-muted text-sm mb-4">选择墨宝或点击「新墨宝」开始书写</p>
                    <Button onClick={handleNew}>
                      <Plus className="w-4 h-4" />
                      提笔挥毫
                    </Button>
                  </Card>
                </div>
              )}

              {noteId && (
                <Card className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3 flex-1">
                      <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="墨宝标题..."
                        className="text-xl font-serif font-semibold bg-transparent text-text-primary placeholder:text-text-muted outline-none w-full"
                      />
                      {lastSaved && (
                        <span className="text-xs text-text-muted flex-shrink-0">
                          已铭刻 {lastSaved}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => setShowVersions(!showVersions)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                          showVersions
                            ? "bg-accent-soft text-jade"
                            : "bg-bg-secondary text-text-secondary hover:bg-accent-soft hover:text-jade"
                        }`}
                      >
                        <Clock className="w-4 h-4" />
                        {nt.btnVersions}
                      </button>
                      <Button onClick={() => handleSave(false)} disabled={saving} variant="secondary">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {saving ? nt.saving : nt.btnSave}
                      </Button>
                      <Button onClick={handleSaveVersion} disabled={saving}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {saving ? nt.saving : nt.btnSaveVersion}
                      </Button>
                      <button
                        onClick={() => editing && setDeleteTarget(editing)}
                        className="p-2 rounded-lg bg-bg-secondary text-text-muted hover:text-danger hover:bg-danger-soft transition-all"
                        title="归入归墟"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* 编辑模式切换 */}
                  <div className="flex items-center gap-1 mb-2 p-0.5 bg-bg-secondary rounded-lg w-fit">
                    <button
                      onClick={() => setViewMode("edit")}
                      title="编辑"
                      className={`p-1.5 rounded-md transition-colors ${viewMode === "edit" ? "bg-white dark:bg-zinc-700 text-text-primary shadow-sm" : "text-text-muted hover:text-text-secondary"}`}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setViewMode("split")}
                      title="分屏"
                      className={`p-1.5 rounded-md transition-colors ${viewMode === "split" ? "bg-white dark:bg-zinc-700 text-text-primary shadow-sm" : "text-text-muted hover:text-text-secondary"}`}
                    >
                      <Columns className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setViewMode("preview")}
                      title="预览"
                      className={`p-1.5 rounded-md transition-colors ${viewMode === "preview" ? "bg-white dark:bg-zinc-700 text-text-primary shadow-sm" : "text-text-muted hover:text-text-secondary"}`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* 编辑器 / 预览 */}
                  <div className={`${viewMode === "split" ? "grid grid-cols-2 gap-4" : ""}`}>
                    {viewMode !== "preview" && (
                      <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="落笔于此...支持 Markdown 格式"
                        className="w-full min-h-[calc(100vh-16rem)] bg-transparent text-text-primary placeholder:text-text-muted outline-none resize-y text-base leading-relaxed font-serif"
                      />
                    )}
                    {viewMode !== "edit" && (
                      <div className="min-h-[calc(100vh-16rem)] prose prose-sm dark:prose-invert max-w-none overflow-auto">
                        {content.trim() ? (
                          <ReactMarkdown remarkPlugins={[remarkBreaks]}>{content}</ReactMarkdown>
                        ) : (
                          <p className="text-text-muted italic">暂无内容</p>
                        )}
                      </div>
                    )}
                  </div>

                </Card>
              )}
            </div>

            {editing && showVersions && (
              <VersionHistoryPanel
                versions={editing.versions || []}
                currentContent={content}
                onClose={() => setShowVersions(false)}
                onRestore={handleVersionRestore}
              />
            )}
          </div>
        </>
      )}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="归入归墟"
        message={`确定要将「${deleteTarget?.title || "无题"}」归入归墟吗？`}
        confirmLabel="确认归入"
        cancelLabel="取消"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => { if (!deleting) setDeleteTarget(null); }}
      />
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}
