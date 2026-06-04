import { useState, useEffect, useCallback } from "react";
import QuizGenerator from "../../components/QuizGenerator";
import {
  BookOpen,
  Edit3,
  AlertCircle,
  Search,
  Loader2,
  CheckCircle,
  XCircle,
  ChevronRight,
} from "lucide-react";
import { categoryApi, collectionApi } from "../../api/organization";
import type { Category, Collection } from "../../api/organization";

type TabKey = "generate" | "answer" | "wrong";
type ScopeFilter = { type: string; id: string; name: string };

interface HistoryQuestion {
  id: string;
  type: string;
  question: string;
  options?: string[];
  answer?: string;
  explanation?: string;
  sources?: { chunk_id: string | null; page_number: number | null }[];
  difficulty?: string;
  content_id?: string;
  created_at?: string;
  user_answer?: string;
  answered_at?: string;
}

const TYPE_LABELS: Record<string, string> = {
  single: "单选",
  multiple: "多选",
  truefalse: "判断",
  open: "简答",
};

function QuestionCard({
  q,
  index,
  showAnswer,
  onToggleAnswer,
  isWrong,
  userAnswer,
}: {
  q: HistoryQuestion;
  index: number;
  showAnswer: boolean;
  onToggleAnswer: () => void;
  isWrong?: boolean;
  userAnswer?: string;
}) {
  return (
    <div
      className={`rounded-lg p-3 ${
        isWrong
          ? "bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30"
          : "bg-[var(--bg-secondary)] dark:bg-[var(--bg-elevated)]"
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
            q.type === "single"
              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
              : q.type === "multiple"
              ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
              : q.type === "truefalse"
              ? "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300"
              : "bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-400"
          }`}
        >
          {TYPE_LABELS[q.type] || q.type}
        </span>
        {q.sources?.[0]?.page_number && (
          <span className="text-[10px] text-[var(--accent-text)] bg-[var(--accent-soft)] dark:bg-indigo-900/20 px-1.5 py-0.5 rounded">
            第{q.sources[0].page_number}页
          </span>
        )}
      </div>
      <p className="text-sm font-medium text-[var(--text-primary)] mb-1">
        {index + 1}. {q.question}
      </p>

      {/* 答题模式：显示选项供选择 */}
      {q.options?.length && !showAnswer && isWrong === undefined && (
        <div className="mt-1 space-y-0.5">
          {q.options.map((opt, j) => (
            <button
              key={j}
              onClick={onToggleAnswer}
              className="text-xs text-[var(--text-secondary)] pl-4 hover:text-[var(--accent-text)] hover:bg-[var(--accent-soft)] dark:hover:bg-indigo-900/10 rounded py-0.5 w-full text-left transition-colors"
            >
              {String.fromCharCode(65 + j)}. {opt}
            </button>
          ))}
        </div>
      )}

      {/* 已展示选项但未揭示答案 */}
      {q.options?.length && !showAnswer && isWrong !== undefined && (
        <div className="mt-1 space-y-0.5">
          {q.options.map((opt, j) => (
            <p key={j} className="text-xs text-[var(--text-secondary)] pl-4">
              {String.fromCharCode(65 + j)}. {opt}
            </p>
          ))}
        </div>
      )}

      {/* 答案区域 */}
      {q.answer && (
        <div className="mt-1">
          {showAnswer ? (
            <div>
              {isWrong ? (
                <>
                  {userAnswer && (
                    <p className="text-xs text-red-600 dark:text-red-400">
                      ✗ 你的答案: {userAnswer}
                    </p>
                  )}
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                    ✓ 正确答案: {q.answer}
                  </p>
                </>
              ) : (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  ✓ 答案: {q.answer}
                </p>
              )}
              {q.explanation && (
                <p className="mt-0.5 text-xs text-[var(--text-muted)] italic">
                  {q.explanation}
                </p>
              )}
            </div>
          ) : (
            <button
              onClick={onToggleAnswer}
              className="text-xs text-[var(--text-muted)] hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors flex items-center gap-1"
            >
              <span className="inline-block w-4 h-4 rounded-full border border-current text-[10px] leading-4 text-center">
                ?
              </span>
              点击查看答案
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function QuizPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("generate");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter | null>(null);

  // Filter options
  const [categories, setCategories] = useState<Category[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);

  // History / wrong questions
  const [historyQuestions, setHistoryQuestions] = useState<HistoryQuestion[]>([]);
  const [wrongQuestions, setWrongQuestions] = useState<HistoryQuestion[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingWrong, setLoadingWrong] = useState(false);

  // Answer mode state
  const [revealedAnswers, setRevealedAnswers] = useState<Set<number>>(new Set());
  const [answerResults, setAnswerResults] = useState<Map<number, boolean>>(new Map());

  // Load filter options
  useEffect(() => {
    categoryApi.listAll().then(setCategories).catch(() => {});
    collectionApi.list(1, 100).then(setCollections).catch(() => {});
  }, []);

  // Load history questions
  const loadHistory = useCallback(async () => {
    if (activeTab !== "answer") return;
    setLoadingHistory(true);
    try {
      const params = new URLSearchParams();
      if (scopeFilter) {
        params.set("scope_type", scopeFilter.type);
        params.set("scope_id", scopeFilter.id);
      }
      params.set("page", "1");
      params.set("page_size", "20");
      const res = await fetch(`/api/ai/quiz/history?${params}`);
      const data = await res.json();
      setHistoryQuestions(data.questions || []);
      setRevealedAnswers(new Set());
      setAnswerResults(new Map());
    } catch {
      setHistoryQuestions([]);
    } finally {
      setLoadingHistory(false);
    }
  }, [activeTab, scopeFilter]);

  // Load wrong questions
  const loadWrong = useCallback(async () => {
    if (activeTab !== "wrong") return;
    setLoadingWrong(true);
    try {
      const params = new URLSearchParams();
      if (scopeFilter) {
        params.set("scope_type", scopeFilter.type);
        params.set("scope_id", scopeFilter.id);
      }
      params.set("page", "1");
      params.set("page_size", "20");
      const res = await fetch(`/api/ai/quiz/wrong?${params}`);
      const data = await res.json();
      setWrongQuestions(data.questions || []);
    } catch {
      setWrongQuestions([]);
    } finally {
      setLoadingWrong(false);
    }
  }, [activeTab, scopeFilter]);

  useEffect(() => {
    if (activeTab === "answer") loadHistory();
    if (activeTab === "wrong") loadWrong();
  }, [activeTab, scopeFilter, loadHistory, loadWrong]);

  // Answer mode: reveal answer and determine correct/wrong
  const handleRevealAnswer = async (index: number) => {
    const newRevealed = new Set(revealedAnswers);
    newRevealed.add(index);
    setRevealedAnswers(newRevealed);

    // Mark as incorrect (user clicked "show answer" without answering correctly first)
    // In a real scenario, user would select an option first
    const q = historyQuestions[index];
    if (q?.id) {
      setAnswerResults((prev) => new Map(prev).set(index, false));
      // Record to backend
      try {
        await fetch("/api/ai/quiz/record", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question_id: q.id,
            user_answer: "(查看答案)",
            is_correct: false,
          }),
        });
      } catch {}
    }
  };

  // Remove wrong mark
  const handleRemoveWrong = async (q: HistoryQuestion) => {
    if (!q.id) return;
    try {
      await fetch(`/api/ai/quiz/wrong/${q.id}`, { method: "DELETE" });
      setWrongQuestions((prev) => prev.filter((wq) => wq.id !== q.id));
    } catch {}
  };

  const tabs: { key: TabKey; icon: React.ReactNode; label: string }[] = [
    { key: "generate", icon: <BookOpen className="w-4 h-4" />, label: "出题" },
    { key: "answer", icon: <Edit3 className="w-4 h-4" />, label: "答题" },
    { key: "wrong", icon: <AlertCircle className="w-4 h-4" />, label: "错题" },
  ];

  const [openDropdown, setOpenDropdown] = useState<"category" | "collection" | null>(null);

  const clearScope = () => setScopeFilter(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!openDropdown) return;
    const handler = () => setOpenDropdown(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [openDropdown]);

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">考校</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              智能出题测验，随机刷题 + 主题出题 + 错题本
            </p>
          </div>
        </div>

        {/* Scope Filter */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <span className="text-xs text-[var(--text-muted)]">范围:</span>

          {/* All */}
          <button
            onClick={clearScope}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
              !scopeFilter
                ? "bg-[var(--accent-soft)] text-[var(--accent-text)]"
                : "bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            全部道藏
          </button>

          {/* Categories */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setOpenDropdown(openDropdown === "category" ? null : "category"); }}
              className="text-xs px-3 py-1.5 rounded-lg font-medium bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors flex items-center gap-1"
            >
              分类 <ChevronRight className="w-3 h-3 rotate-90" />
            </button>
            {openDropdown === "category" && (
            <div className="absolute left-0 top-full mt-1 w-48 max-h-60 overflow-auto bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg shadow-lg z-50">
              {categories.length === 0 && (
                <p className="text-xs text-[var(--text-muted)] px-3 py-2">暂无分类</p>
              )}
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() =>
                    setScopeFilter({ type: "category", id: cat.id, name: cat.name })
                  }
                  className="w-full text-left px-3 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  {cat.name}
                </button>
              ))}
            </div>
            )}
          </div>

          {/* Collections */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setOpenDropdown(openDropdown === "collection" ? null : "collection"); }}
              className="text-xs px-3 py-1.5 rounded-lg font-medium bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors flex items-center gap-1"
            >
              合集 <ChevronRight className="w-3 h-3 rotate-90" />
            </button>
            {openDropdown === "collection" && (
            <div className="absolute left-0 top-full mt-1 w-48 max-h-60 overflow-auto bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg shadow-lg z-50">
              {collections.length === 0 && (
                <p className="text-xs text-[var(--text-muted)] px-3 py-2">暂无合集</p>
              )}
              {collections.map((col) => (
                <button
                  key={col.id}
                  onClick={() =>
                    setScopeFilter({ type: "collection", id: col.id, name: col.name })
                  }
                  className="w-full text-left px-3 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  {col.name}
                </button>
              ))}
            </div>
            )}
          </div>

          {/* Current scope indicator */}
          {scopeFilter && (
            <span className="text-xs px-2 py-1 rounded bg-[var(--warning-soft)] dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 flex items-center gap-1">
              <Search className="w-3 h-3" />
              {scopeFilter.type === "category" ? "分类" : "合集"}「{scopeFilter.name}」
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6 p-0.5 bg-[var(--bg-secondary)] dark:bg-[var(--bg-elevated)] rounded-lg w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab.key
                  ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "generate" && (
          <QuizGenerator
            scopeType={scopeFilter ? (scopeFilter.type as "category" | "collection") : "content"}
            scopeId={scopeFilter ? scopeFilter.id : ""}
            scopeName={scopeFilter ? scopeFilter.name : "全部道藏"}
            embedded
          />
        )}

        {activeTab === "answer" && (
          <div>
            {loadingHistory ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
              </div>
            ) : historyQuestions.length === 0 ? (
              <div className="text-center py-12">
                <BookOpen className="w-12 h-12 mx-auto text-[var(--text-muted)] mb-3" />
                <p className="text-sm text-[var(--text-muted)]">
                  {scopeFilter
                    ? "该范围内暂无历史题目，请先生成题目"
                    : "暂无历史题目，请先生成题目"}
                </p>
                <button
                  onClick={() => setActiveTab("generate")}
                  className="mt-3 text-sm text-[var(--accent-text)] hover:underline"
                >
                  去出题 →
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {historyQuestions.map((q, i) => (
                  <QuestionCard
                    key={q.id || i}
                    q={q}
                    index={i}
                    showAnswer={revealedAnswers.has(i)}
                    onToggleAnswer={() => handleRevealAnswer(i)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "wrong" && (
          <div>
            {loadingWrong ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
              </div>
            ) : wrongQuestions.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="w-12 h-12 mx-auto text-emerald-500 mb-3" />
                <p className="text-sm text-[var(--text-muted)]">
                  暂无错题，继续保持！
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {wrongQuestions.map((q, i) => (
                  <QuestionCard
                    key={q.id || i}
                    q={q}
                    index={i}
                    showAnswer
                    onToggleAnswer={() => {}}
                    isWrong
                    userAnswer={q.user_answer}
                  />
                ))}
                {wrongQuestions.length > 0 && (
                  <button
                    onClick={() => loadWrong()}
                    disabled={loadingWrong}
                    className="text-xs text-[var(--accent-text)] hover:underline mt-2"
                  >
                    刷新错题列表
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
