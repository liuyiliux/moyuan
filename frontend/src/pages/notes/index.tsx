import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus, Save, Trash2, Star, Pin, FileText, Loader2, Clock,
} from "lucide-react";
import VersionHistoryPanel from "../../components/VersionHistoryPanel";
import { Card, Button } from "../../components";
import { notesCopy, useCopy } from "../../lib/copywriting";

interface Note {
  id: string;
  title: string;
  content: string;
  is_starred: boolean;
  is_pinned: boolean;
  created_at: string | null;
  updated_at: string | null;
  version_count: number;
  versions?: { title: string; text_content: string; updated_at: string }[];
}

const noteApi = {
  list: (page = 1, star = false) =>
    fetch(`/api/notes?page=${page}&page_size=50&star=${star}`).then((r) => r.json()),
  get: (id: string) => fetch(`/api/notes/${id}`).then((r) => r.json()),
  create: (title: string, content = "") =>
    fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content }),
    }).then((r) => r.json()),
  update: (id: string, data: { title?: string; content?: string }) =>
    fetch(`/api/notes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((r) => r.json()),
  delete: (id: string) => fetch(`/api/notes/${id}`, { method: "DELETE" }).then((r) => r.json()),
};

export default function NotesPage() {
  const nt = useCopy(notesCopy);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const noteId = searchParams.get("id");

  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [starOnly, setStarOnly] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    const data = await noteApi.list(1, starOnly);
    setNotes(data.items || []);
    setLoading(false);
  }, [starOnly]);

  const loadNote = useCallback(async (id: string) => {
    const note = await noteApi.get(id);
    setEditing(note);
    setTitle(note.title);
    setContent(note.content || "");
    setShowVersions(false);
  }, []);

  useEffect(() => {
    if (noteId) {
      loadNote(noteId);
    } else {
      setEditing(null);
      setTitle("");
      setContent("");
    }
  }, [noteId]);

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

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      let result;
      if (editing) {
        result = await noteApi.update(editing.id, { title, content });
      } else {
        result = await noteApi.create(title, content);
      }
      setEditing(result);
      setLastSaved(new Date().toLocaleTimeString("zh-CN"));
      await loadList();
      navigate(`/notes?id=${result.id}`);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("确定要将此墨宝归入归墟吗？")) return;
    await noteApi.delete(id);
    if (editing?.id === id) {
      setEditing(null);
      navigate("/notes");
    }
    loadList();
  }

  async function handleNew() {
    setEditing(null);
    setTitle("");
    setContent("");
    navigate("/notes");
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
    <div className="max-w-6xl mx-auto px-6 py-8">
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
            <Button onClick={handleNew}>
              <Plus className="w-4 h-4" />
              新墨宝
            </Button>
          </div>

          <div className="flex gap-6">
            <div className="w-72 flex-shrink-0">
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
                        版本录
                      </button>
                      <Button onClick={handleSave} disabled={saving}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        铭刻
                      </Button>
                      <button
                        onClick={() => handleDelete(editing?.id || "")}
                        className="p-2 rounded-lg bg-bg-secondary text-text-muted hover:text-danger hover:bg-danger-soft transition-all"
                        title="归入归墟"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="落笔于此..."
                    className="w-full min-h-[500px] bg-transparent text-text-primary placeholder:text-text-muted outline-none resize-y text-base leading-relaxed font-serif"
                  />

                </Card>
              )}
            </div>

            {editing && (
              <VersionHistoryPanel
                noteId={editing.id}
                currentContent={content}
                onClose={() => setShowVersions(false)}
                onRestore={handleVersionRestore}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
