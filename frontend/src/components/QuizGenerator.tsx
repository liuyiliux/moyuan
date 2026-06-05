import { useState, useCallback } from "react";
import {
  Loader2,
  BookOpen,
  RefreshCw as RefreshIcon,
  X,
  Shuffle,
  Search,
} from "lucide-react";
import { quizCopy, useCopy } from "../lib/copywriting";

interface Question {
  type: string;
  question: string;
  options?: string[];
  answer?: string;
  sources?: { chunk_id: string | null; page_number: number | null }[];
  explanation?: string;
  difficulty?: string;
  id?: string;
}

export interface QuizGeneratorProps {
  scopeType: "category" | "collection" | "content";
  scopeId: string;
  scopeName: string;
  /** 内嵌模式（无遮罩、无关闭按钮） vs 弹窗模式 */
  embedded?: boolean;
  /** 弹窗关闭回调（embedded=false 时必传） */
  onClose?: () => void;
  /** 出题成功后的回调（用于自动跳转答题） */
  onGenerated?: () => void;
}

const QUESTION_KEYS = ["single", "multiple", "truefalse", "open"] as const;
const QUESTION_COUNTS = [3, 5, 8, 10];

function getTypeColor(type: string) {
  const map: Record<string, string> = {
    single: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
    multiple: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300",
    truefalse: "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300",
    open: "bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-400",
  };
  return map[type] || "bg-gray-100 dark:bg-zinc-700";
}

function getTypeLabel(qt: ReturnType<typeof useCopy<typeof quizCopy>>, type: string): string {
  const map: Record<string, string> = {
    single: qt.typeSingle, multiple: qt.typeMultiple,
    truefalse: qt.typeTrueFalse, open: qt.typeOpen,
  };
  return map[type] || type;
}

export default function QuizGenerator({
  scopeType,
  scopeId,
  scopeName,
  embedded = false,
  onClose,
  onGenerated,
}: QuizGeneratorProps) {
  const qt = useCopy(quizCopy);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [quizCount, setQuizCount] = useState(5);
  const [quizMode, setQuizMode] = useState<"random" | "topic">("random");
  const [quizTopic, setQuizTopic] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>(["single", "multiple", "truefalse", "open"]);
  const [minDifficulty, setMinDifficulty] = useState<number | undefined>(undefined);
  const [maxDifficulty, setMaxDifficulty] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const toggleType = (key: string) => {
    setSelectedTypes((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const scopeLabel =
    scopeType === "category"
      ? `${qt.scopeFilterCategory}「${scopeName}」`
      : scopeType === "collection"
      ? `${qt.scopeFilterCollection}「${scopeName}」`
      : `「${scopeName}」`;

  const handleGenerate = useCallback(async () => {
    if (quizMode === "topic" && !quizTopic.trim()) {
      setError("请输入出题主题");
      return;
    }
    setError(null);
    setGenerating(true);
    try {
      const body: Record<string, unknown> = {
        content_ids: [],
        question_count: quizCount,
        mode: quizMode,
        topic: quizMode === "topic" ? quizTopic.trim() : undefined,
        question_types: selectedTypes,
      };
      if (minDifficulty != null) body.min_difficulty = minDifficulty;
      if (maxDifficulty != null) body.max_difficulty = maxDifficulty;
      if (scopeId) {
        body.scope_type = scopeType;
        body.scope_id = scopeId;
      }
      const res = await fetch("/api/ai/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setRevealed(new Set());
      setQuestions(data.questions || []);
      if (data.questions?.length > 0) {
        onGenerated?.();
      }
    } catch (e) {
      setQuestions([{ type: "open", question: "生成失败: " + (e as Error).message }]);
    } finally {
      setGenerating(false);
    }
  }, [quizCount, quizMode, quizTopic, selectedTypes, minDifficulty, maxDifficulty, scopeType, scopeId]);

  const body = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          {scopeLabel}{qt.tabGenerate}
        </h3>
        {!embedded && onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Mode Switch */}
      <div className="flex items-center gap-1 mb-3 p-0.5 bg-[var(--bg-secondary)] dark:bg-[var(--bg-elevated)] rounded-lg">
        <button
          onClick={() => setQuizMode("random")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            quizMode === "random"
              ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm"
              : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          }`}
        >
          <Shuffle className="w-3 h-3" />
          {qt.tabGenerate}（随机）
        </button>
        <button
          onClick={() => setQuizMode("topic")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            quizMode === "topic"
              ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm"
              : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          }`}
        >
          <Search className="w-3 h-3" />
          {qt.tabGenerate}（主题）
        </button>
      </div>

      {/* Topic Input */}
      {quizMode === "topic" && (
        <div className="mb-3">
          <input
            type="text"
            value={quizTopic}
            onChange={(e) => setQuizTopic(e.target.value)}
            placeholder="输入出题主题..."
            className="w-full px-3 py-1.5 text-xs border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-primary)] dark:bg-[var(--bg-elevated)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
          />
          {error && <p className="text-xs text-[var(--danger)] mt-1">{error}</p>}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs text-[var(--text-muted)]">数量</span>
        <select
          value={quizCount}
          onChange={(e) => setQuizCount(Number(e.target.value))}
          className="text-xs border border-[var(--border-subtle)] rounded px-2 py-0.5 bg-[var(--bg-primary)] dark:bg-[var(--bg-elevated)] text-[var(--text-primary)]"
        >
          {QUESTION_COUNTS.map((n) => (
            <option key={n} value={n}>{n} 题</option>
          ))}
        </select>

        <span className="text-xs text-[var(--text-muted)] ml-2">题型</span>
        {QUESTION_KEYS.map((key) => (
          <button
            key={key}
            onClick={() => toggleType(key)}
            className={`text-xs px-2 py-0.5 rounded font-medium border transition-colors ${
              selectedTypes.includes(key)
                ? getTypeColor(key) + " border-current/30"
                : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {getTypeLabel(qt, key)}
          </button>
        ))}

        <div className="flex-1" />

        {/* Difficulty filter */}
        <span className="text-xs text-[var(--text-muted)] ml-1">难度</span>
        <select
          value={minDifficulty ?? ""}
          onChange={(e) => setMinDifficulty(e.target.value ? Number(e.target.value) : undefined)}
          className="text-xs border border-[var(--border-subtle)] rounded px-1.5 py-0.5 bg-[var(--bg-primary)] dark:bg-[var(--bg-elevated)] text-[var(--text-primary)]"
        >
          <option value="">不限</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <span className="text-xs text-[var(--text-muted)]">-</span>
        <select
          value={maxDifficulty ?? ""}
          onChange={(e) => setMaxDifficulty(e.target.value ? Number(e.target.value) : undefined)}
          className="text-xs border border-[var(--border-subtle)] rounded px-1.5 py-0.5 bg-[var(--bg-primary)] dark:bg-[var(--bg-elevated)] text-[var(--text-primary)]"
        >
          <option value="">不限</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>

        <div className="flex-1" />

        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--warning-soft)] dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-lg text-xs font-medium hover:bg-amber-200 dark:hover:bg-amber-900/50 disabled:opacity-50 transition-colors"
        >
          {generating ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <BookOpen className="w-3 h-3" />
          )}
          {generating ? "生成中..." : questions ? "重新生成" : "生成题目"}
        </button>

        {questions && questions.length > 0 && (
          <button
            onClick={handleGenerate}
            className="p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] rounded"
            title="重新生成"
          >
            <RefreshIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Content Area */}
      {generating ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
        </div>
      ) : questions === null ? (
        <div className="flex-1 flex items-center justify-center py-8">
          <p className="text-xs text-[var(--text-muted)]">选择范围和模式后，点击生成题目开始</p>
        </div>
      ) : questions.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-8">
          <p className="text-xs text-[var(--text-muted)]">该范围内暂无文本内容可供出题</p>
        </div>
      ) : (
        <div className="space-y-2 flex-1 overflow-auto">
          {questions.map((q, i) => (
            <div key={i} className="bg-[var(--bg-secondary)] dark:bg-[var(--bg-elevated)] rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${getTypeColor(q.type)}`}>
                  {getTypeLabel(qt, q.type)}
                </span>
                {q.difficulty && (
                  <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded">
                    难度:{q.difficulty}
                  </span>
                )}
                {q.sources?.map((src, si) =>
                  src.page_number ? (
                    <span key={si} className="text-[10px] text-[var(--accent-text)] bg-[var(--accent-soft)] dark:bg-indigo-900/20 px-1.5 py-0.5 rounded">
                      第{src.page_number}页{si > 0 ? ` (来源${si + 1})` : ""}
                    </span>
                  ) : null
                )}
              </div>
              <p className="text-sm font-medium text-[var(--text-primary)] mb-1">
                {i + 1}. {q.question}
              </p>
              {q.options?.length ? (
                <div className="mt-1 space-y-0.5">
                  {q.options.map((opt, j) => (
                    <p key={j} className="text-xs text-[var(--text-secondary)] pl-4">
                      {String.fromCharCode(65 + j)}. {opt}
                    </p>
                  ))}
                </div>
              ) : null}
              {q.answer && (
                <div className="mt-1">
                  {revealed.has(i) ? (
                    <div>
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">
                        ✓ {qt.correctAnswer}: {q.answer}
                      </p>
                      {q.explanation && (
                        <p className="mt-0.5 text-xs text-[var(--text-muted)] italic">{q.explanation}</p>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => setRevealed((prev) => new Set(prev).add(i))}
                      className="text-xs text-[var(--text-muted)] hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors flex items-center gap-1"
                    >
                      <span className="inline-block w-4 h-4 rounded-full border border-current text-[10px] leading-4 text-center">?</span>
                      点击查看答案
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (!embedded) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
        <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 w-full max-w-lg max-h-[85vh] overflow-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
          {body}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--bg-card)] dark:bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
      {body}
    </div>
  );
}
