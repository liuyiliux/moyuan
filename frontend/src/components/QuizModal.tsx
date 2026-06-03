import { useState, useCallback } from "react";
import { Loader2, BookOpen, RefreshCw as RefreshIcon, X } from "lucide-react";

interface QuizModalProps {
  scopeType: "category" | "collection";
  scopeId: string;
  scopeName: string;
  onClose: () => void;
}

interface Question {
  type: string; question: string; options?: string[]; answer?: string;
  sources?: { chunk_id: string | null; page_number: number | null }[];
  explanation?: string; difficulty?: string;
}

export default function QuizModal({ scopeType, scopeId, scopeName, onClose }: QuizModalProps) {
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [quizCount, setQuizCount] = useState(5);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/ai/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_ids: [],
          question_count: quizCount,
          mode: "random",
          question_types: ["single", "multiple", "truefalse", "open"],
          scope_type: scopeType,
          scope_id: scopeId,
        }),
      });
      const data = await res.json();
      setRevealed(new Set());
      setQuestions(data.questions || []);
    } catch (e) {
      setQuestions([{ type: "open", question: "生成失败: " + (e as Error).message }]);
    } finally {
      setGenerating(false);
    }
  }, [quizCount, scopeType, scopeId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white dark:bg-zinc-800 rounded-xl p-6 w-full max-w-lg max-h-[85vh] overflow-auto shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {scopeType === "category" ? `分类「${scopeName}」出题` : `合集「${scopeName}」出题`}
          </h3>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] text-lg leading-none">×</button>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-[var(--text-muted)]">数量</span>
          <select
            value={quizCount}
            onChange={(e) => setQuizCount(Number(e.target.value))}
            className="text-xs border rounded px-2 py-0.5 bg-[var(--bg-primary)] dark:bg-[var(--bg-elevated)] text-[var(--text-primary)]"
          >
            {[3, 5, 8, 10].map(n => (
              <option key={n} value={n}>{n} 题</option>
            ))}
          </select>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--warning-soft)] dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-lg text-xs font-medium hover:bg-amber-200 dark:hover:bg-amber-900/50 disabled:opacity-50"
          >
            {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <BookOpen className="w-3 h-3" />}
            {generating ? "生成中..." : questions ? "重新生成" : "生成题目"}
          </button>
          {questions && (
            <button
              onClick={handleGenerate}
              className="p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] rounded"
              title="重新生成"
            >
              <RefreshIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {generating ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
          </div>
        ) : questions === null ? (
          <p className="text-xs text-[var(--text-muted)] py-4 text-center">点击上方按钮生成题目</p>
        ) : questions.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] py-4 text-center">该范围内暂无文本内容可供出题</p>
        ) : (
          <div className="space-y-2">
            {questions.map((q, i) => (
              <div key={i} className="bg-[var(--bg-secondary)] dark:bg-[var(--bg-elevated)] rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    q.type === "single" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" :
                    q.type === "multiple" ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300" :
                    q.type === "truefalse" ? "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300" :
                    "bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-400"
                  }`}>
                    {{single: "单选", multiple: "多选", truefalse: "判断", open: "简答"}[q.type] || q.type}
                  </span>
                  {q.sources?.[0]?.page_number && (
                    <span className="text-[10px] text-[var(--accent-text)] bg-[var(--accent-soft)] dark:bg-indigo-900/20 px-1.5 py-0.5 rounded">
                      第{q.sources[0].page_number}页
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-[var(--text-primary)] mb-1">{i + 1}. {q.question}</p>
                {q.options?.length ? (
                  <div className="mt-1 space-y-0.5">
                    {q.options.map((opt, j) => (
                      <p key={j} className="text-xs text-[var(--text-secondary)] pl-4">{String.fromCharCode(65 + j)}. {opt}</p>
                    ))}
                  </div>
                ) : null}
                {q.answer && (
                  <div className="mt-1">
                    {revealed.has(i) ? (
                      <div>
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">✓ 答案: {q.answer}</p>
                        {q.explanation && <p className="mt-0.5 text-xs text-[var(--text-muted)] italic">{q.explanation}</p>}
                      </div>
                    ) : (
                      <button
                        onClick={() => setRevealed(prev => new Set(prev).add(i))}
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
    </div>
  );
}
