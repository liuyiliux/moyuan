import { useState, useEffect, useCallback } from "react";
import QuizGenerator from "../../components/QuizGenerator";
import {
  BookOpen, Edit3, AlertCircle, Search, Loader2,
  CheckCircle, XCircle, ChevronRight, Send,
} from "lucide-react";
import { categoryApi, collectionApi } from "../../api/organization";
import type { Category, Collection } from "../../api/organization";
import { quizCopy, useCopy } from "../../lib/copywriting";

type TabKey = "generate" | "answer" | "wrong";
type ScopeFilter = { type: string; id: string; name: string };

interface HistoryQuestion {
  id: string; type: string; question: string;
  options?: string[]; answer?: string;
  explanation?: string;
  sources?: { chunk_id: string | null; page_number: number | null }[];
  difficulty?: string; content_id?: string; created_at?: string;
  user_answer?: string; answered_at?: string;
}

type AnswerState = Record<string, { submitted: boolean; selected: string | string[]; correct: boolean }>;

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

export default function QuizPage() {
  const qt = useCopy(quizCopy);
  const [activeTab, setActiveTab] = useState<TabKey>("generate");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [historyQuestions, setHistoryQuestions] = useState<HistoryQuestion[]>([]);
  const [wrongQuestions, setWrongQuestions] = useState<HistoryQuestion[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingWrong, setLoadingWrong] = useState(false);
  const [generatingWrong, setGeneratingWrong] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<"category" | "collection" | null>(null);

  const [answers, setAnswers] = useState<AnswerState>({});
  const [answerStats, setAnswerStats] = useState<{ correct: number; total: number } | null>(null);

  useEffect(() => {
    categoryApi.listAll().then(setCategories).catch(() => {});
    collectionApi.list(1, 100).then(setCollections).catch(() => {});
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    setAnswers({});
    setAnswerStats(null);
    try {
      const params = new URLSearchParams();
      if (scopeFilter) {
        params.set("scope_type", scopeFilter.type);
        params.set("scope_id", scopeFilter.id);
      }
      params.set("page", "1"); params.set("page_size", "20");
      const res = await fetch(`/api/ai/quiz/history?${params}`);
      const data = await res.json();
      setHistoryQuestions(data.questions || []);
    } catch { setHistoryQuestions([]); }
    finally { setLoadingHistory(false); }
  }, [scopeFilter]);

  const loadWrong = useCallback(async () => {
    setLoadingWrong(true);
    try {
      const params = new URLSearchParams();
      if (scopeFilter) {
        params.set("scope_type", scopeFilter.type);
        params.set("scope_id", scopeFilter.id);
      }
      params.set("page", "1"); params.set("page_size", "20");
      const res = await fetch(`/api/ai/quiz/wrong?${params}`);
      const data = await res.json();
      console.log("[quiz] wrong response:", data);
      setWrongQuestions(data.questions || []);
    } catch { setWrongQuestions([]); }
    finally { setLoadingWrong(false); }
  }, [scopeFilter]);

  useEffect(() => {
    if (activeTab === "answer") loadHistory();
    if (activeTab === "wrong") loadWrong();
  }, [activeTab, scopeFilter, loadHistory, loadWrong]);

  function normalizeTrueFalse(val: string): string {
    const v = val.trim().toLowerCase();
    if (v === "true" || v === "对" || v === "√" || v === "✓" || v === "正确" || v === "正确" || v === "是" || v === "yes") return "true";
    if (v === "false" || v === "错" || v === "×" || v === "✗" || v === "错误" || v === "否" || v === "no") return "false";
    return v;
  }
  function checkAnswer(q: HistoryQuestion, userAns: string | string[]): boolean {
    if (!q.answer) return false;
    if (q.type === "multiple") {
      // 将用户选的字母（A/B/C/D）映射为实际选项文本
      const userLetters = Array.isArray(userAns) ? userAns : [userAns];
      const userTexts = userLetters
        .map(letter => {
          const idx = letter.charCodeAt(0) - 65; // A=0, B=1, ...
          return q.options?.[idx] || letter;
        })
        .map(t => t.trim());
      // 将 AI 返回的答案（中文逗号分隔）拆分为数组
      const correctTexts = q.answer
        .split(/[,，]/)
        .map(t => t.trim())
        .filter(Boolean);
      // 集合比较
      const userSet = new Set(userTexts);
      if (correctTexts.length !== userTexts.length) return false;
      return correctTexts.every(t => userSet.has(t));
    }
    if (q.type === "truefalse") {
      return normalizeTrueFalse(String(userAns)) === normalizeTrueFalse(q.answer);
    }
    return String(userAns).trim().toUpperCase() === q.answer.trim().toUpperCase();
  }

  async function recordAnswer(q: HistoryQuestion, userAns: string, isCorrect: boolean) {
    if (!q.id) return;
    try {
      const res = await fetch("/api/ai/quiz/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_id: q.id, user_answer: userAns, is_correct: isCorrect }),
      });
      if (!res.ok) {
        const err = await res.text();
        console.error("[quiz] record answer failed:", res.status, err);
      }
    } catch (e) {
      console.error("[quiz] record answer error:", e);
    }
  }

  function handleSingle(q: HistoryQuestion, optionLetter: string) {
    if (answers[q.id]?.submitted) return;
    const isCorrect = checkAnswer(q, optionLetter);
    setAnswers(prev => ({ ...prev, [q.id]: { submitted: true, selected: optionLetter, correct: isCorrect } }));
    recordAnswer(q, optionLetter, isCorrect);
    updateStats(isCorrect);
  }

  function toggleMulti(q: HistoryQuestion, optionLetter: string) {
    if (answers[q.id]?.submitted) return;
    const cur = (answers[q.id]?.selected as string[]) || [];
    const next = cur.includes(optionLetter) ? cur.filter(c => c !== optionLetter) : [...cur, optionLetter];
    setAnswers(prev => ({ ...prev, [q.id]: { submitted: false, selected: next, correct: false } }));
  }

  function submitMulti(q: HistoryQuestion) {
    const sel = (answers[q.id]?.selected as string[]) || [];
    if (sel.length === 0) return;
    const isCorrect = checkAnswer(q, sel);
    setAnswers(prev => ({ ...prev, [q.id]: { submitted: true, selected: sel, correct: isCorrect } }));
    recordAnswer(q, sel.join(""), isCorrect);
    updateStats(isCorrect);
  }

  function handleTrueFalse(q: HistoryQuestion, val: string) {
    if (answers[q.id]?.submitted) return;
    const isCorrect = checkAnswer(q, val === "对" ? "对" : "错");
    setAnswers(prev => ({ ...prev, [q.id]: { submitted: true, selected: val, correct: isCorrect } }));
    recordAnswer(q, val, isCorrect);
    updateStats(isCorrect);
  }

  async function submitOpen(q: HistoryQuestion, text: string) {
    if (answers[q.id]?.submitted || !text.trim()) return;
    try {
      const res = await fetch("/api/ai/quiz/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q.question,
          correct_answer: q.answer || "",
          user_answer: text.trim(),
        }),
      });
      const data = await res.json();
      const isCorrect = data.is_correct || false;
      setAnswers(prev => ({ ...prev, [q.id]: { submitted: true, selected: text.trim() + (data.explanation ? ` — ${data.explanation}` : ""), correct: isCorrect } }));
      recordAnswer(q, text.trim(), isCorrect);
      updateStats(isCorrect);
    } catch {
      const isCorrect = checkAnswer(q, text.trim());
      setAnswers(prev => ({ ...prev, [q.id]: { submitted: true, selected: text.trim(), correct: isCorrect } }));
      recordAnswer(q, text.trim(), isCorrect);
      updateStats(isCorrect);
    }
  }

  function updateStats(isCorrect: boolean) {
    setAnswerStats(prev => ({
      correct: (prev?.correct || 0) + (isCorrect ? 1 : 0),
      total: (prev?.total || 0) + 1,
    }));
  }

  const handleRemoveWrong = async (q: HistoryQuestion) => {
    if (!q.id) return;
    try {
      await fetch(`/api/ai/quiz/wrong/${q.id}`, { method: "DELETE" });
      setWrongQuestions(prev => prev.filter(wq => wq.id !== q.id));
    } catch {}
  };

  useEffect(() => {
    if (!openDropdown) return;
    const handler = () => setOpenDropdown(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [openDropdown]);

  const tabs: { key: TabKey; icon: React.ReactNode; label: string }[] = [
    { key: "generate", icon: <BookOpen className="w-4 h-4" />, label: qt.tabGenerate },
    { key: "answer", icon: <Edit3 className="w-4 h-4" />, label: qt.tabAnswer },
    { key: "wrong", icon: <AlertCircle className="w-4 h-4" />, label: qt.tabWrong },
  ];

  const clearScope = () => setScopeFilter(null);

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">{qt.title}</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">{qt.subtitle}</p>
          </div>
        </div>

        {/* Scope Filter */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <span className="text-xs text-[var(--text-muted)]">{qt.scopeLabel}</span>
          <button onClick={clearScope}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
              !scopeFilter ? "bg-[var(--accent-soft)] text-[var(--accent-text)]" : "bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}>{qt.scopeAll}</button>

          <div className="relative">
            <button onClick={(e) => { e.stopPropagation(); setOpenDropdown(openDropdown === "category" ? null : "category"); }}
              className="text-xs px-3 py-1.5 rounded-lg font-medium bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors flex items-center gap-1">
              {qt.scopeCategory} <ChevronRight className="w-3 h-3 rotate-90" /></button>
            {openDropdown === "category" && (
            <div className="absolute left-0 top-full mt-1 w-48 max-h-60 overflow-auto bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg shadow-lg z-50">
              {categories.length === 0 && (
                <p className="text-xs text-[var(--text-muted)] px-3 py-2">{qt.noCategory}</p>
              )}
              {categories.map(cat => (
                <button key={cat.id} onClick={() => setScopeFilter({ type: "category", id: cat.id, name: cat.name })}
                  className="w-full text-left px-3 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors">{cat.name}</button>
              ))}
            </div>)}
          </div>

          <div className="relative">
            <button onClick={(e) => { e.stopPropagation(); setOpenDropdown(openDropdown === "collection" ? null : "collection"); }}
              className="text-xs px-3 py-1.5 rounded-lg font-medium bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors flex items-center gap-1">
              {qt.scopeCollection} <ChevronRight className="w-3 h-3 rotate-90" /></button>
            {openDropdown === "collection" && (
            <div className="absolute left-0 top-full mt-1 w-48 max-h-60 overflow-auto bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg shadow-lg z-50">
              {collections.length === 0 && (
                <p className="text-xs text-[var(--text-muted)] px-3 py-2">{qt.noCollection}</p>
              )}
              {collections.map(col => (
                <button key={col.id} onClick={() => setScopeFilter({ type: "collection", id: col.id, name: col.name })}
                  className="w-full text-left px-3 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors">{col.name}</button>
              ))}
            </div>)}
          </div>

          {scopeFilter && (
            <span className="text-xs px-2 py-1 rounded bg-[var(--warning-soft)] dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 flex items-center gap-1">
              <Search className="w-3 h-3" />
              {(scopeFilter.type === "category" ? qt.scopeFilterCategory : qt.scopeFilterCollection)}「{scopeFilter.name}」
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6 p-0.5 bg-[var(--bg-secondary)] dark:bg-[var(--bg-elevated)] rounded-lg w-fit">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab.key ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}>{tab.icon}{tab.label}</button>
          ))}
        </div>

        {/* Generate Tab */}
        {activeTab === "generate" && (
          <QuizGenerator
            scopeType={scopeFilter ? (scopeFilter.type as "category" | "collection") : "content"}
            scopeId={scopeFilter ? scopeFilter.id : ""}
            scopeName={scopeFilter ? scopeFilter.name : qt.scopeAll}
            embedded
            onGenerated={() => setActiveTab("answer")}
          />
        )}

        {/* Answer Tab */}
        {activeTab === "answer" && (
          <div>
            {answerStats && (
              <div className="mb-4 p-3 bg-[var(--accent-soft)] dark:bg-indigo-900/20 rounded-lg flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-500" />
                <span className="text-sm text-[var(--text-primary)]">
                  已答 {answerStats.total} 题，正确 {answerStats.correct} 题，正确率 {answerStats.total > 0 ? Math.round(answerStats.correct / answerStats.total * 100) : 0}%
                </span>
              </div>
            )}
            {loadingHistory ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" /></div>
            ) : historyQuestions.length === 0 ? (
              <div className="text-center py-12">
                <BookOpen className="w-12 h-12 mx-auto text-[var(--text-muted)] mb-3" />
                <p className="text-sm text-[var(--text-muted)]">{scopeFilter ? qt.answerEmptyScoped : qt.answerEmpty}</p>
                <button onClick={() => setActiveTab("generate")} className="mt-3 text-sm text-[var(--accent-text)] hover:underline">{qt.goGenerate}</button>
              </div>
            ) : (
              <div className="space-y-3">
                {historyQuestions.map((q, i) => (
                  <AnswerQuestionCard
                    key={q.id || i}
                    q={q} index={i}
                    state={answers[q.id] || { submitted: false, selected: "", correct: false }}
                    qt={qt}
                    onSingle={(letter) => handleSingle(q, letter)}
                    onMultiToggle={(letter) => toggleMulti(q, letter)}
                    onMultiSubmit={() => submitMulti(q)}
                    onTrueFalse={(val) => handleTrueFalse(q, val)}
                    onOpenSubmit={(text) => submitOpen(q, text)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Wrong Tab */}
        {activeTab === "wrong" && (
          <div>
            {loadingWrong ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" /></div>
            ) : wrongQuestions.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="w-12 h-12 mx-auto text-emerald-500 mb-3" />
                <p className="text-sm text-[var(--text-muted)]">{qt.wrongEmptyHint}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* 错题补强按钮 */}
                {wrongQuestions.length > 0 && (
                  <button
                    onClick={async () => {
                      setGeneratingWrong(true);
                      const wrongTexts = wrongQuestions.map(wq => wq.question).filter(Boolean);
                      try {
                        const body: Record<string, unknown> = {
                          wrong_question_texts: wrongTexts,
                          question_count: 5,
                        };
                        if (scopeFilter) {
                          body.scope_type = scopeFilter.type;
                          body.scope_id = scopeFilter.id;
                        }
                        const res = await fetch("/api/ai/wrong_quiz", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(body),
                        });
                        const data = await res.json();
                        if (data.questions?.length) {
                          setActiveTab("generate");
                        }
                      } catch {}
                      finally { setGeneratingWrong(false); }
                    }}
                    disabled={generatingWrong}
                    className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30 text-amber-700 dark:text-amber-300 rounded-lg text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-900/30 disabled:opacity-50 transition-colors"
                  >
                    {generatingWrong ? <Loader2 className="w-3 h-3 animate-spin" /> : <AlertCircle className="w-3 h-3" />}
                    {generatingWrong ? "生成中..." : "错题补强出题"}
                  </button>
                )}
                {wrongQuestions.map((q, i) => (
                  <div key={q.id || i} className="rounded-lg p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30">
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        q.type === "single" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" :
                        q.type === "multiple" ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300" :
                        q.type === "truefalse" ? "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300" :
                        "bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-400"}`}>
                        {getTypeLabel(qt, q.type)}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-[var(--text-primary)] mb-1">{i + 1}. {q.question}</p>
                    {q.options?.length ? <div className="mt-1 space-y-0.5">{q.options.map((opt, j) => (
                      <p key={j} className="text-xs text-[var(--text-secondary)] pl-4">{OPTION_LETTERS[j]}. {opt}</p>
                    ))}</div> : null}
                    {q.user_answer && <p className="text-xs text-red-600 dark:text-red-400 mt-1">✗ {qt.yourAnswer}: {q.user_answer}</p>}
                    {q.answer && <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">✓ {qt.correctAnswer}: {q.answer}</p>}
                    {q.explanation && <p className="mt-0.5 text-xs text-[var(--text-muted)] italic">{q.explanation}</p>}
                    <button onClick={() => handleRemoveWrong(q)}
                      className="mt-2 text-xs text-[var(--accent-text)] hover:underline">{qt.removeWrong}</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ──

function getTypeLabel(qt: ReturnType<typeof useCopy<typeof quizCopy>>, type: string): string {
  const map: Record<string, string> = {
    single: qt.typeSingle, multiple: qt.typeMultiple,
    truefalse: qt.typeTrueFalse, open: qt.typeOpen,
  };
  return map[type] || type;
}

// ── Interactive Answer Card ──

function AnswerQuestionCard({
  q, index, state, qt,
  onSingle, onMultiToggle, onMultiSubmit, onTrueFalse, onOpenSubmit,
}: {
  q: HistoryQuestion; index: number;
  state: { submitted: boolean; selected: string | string[]; correct: boolean };
  qt: ReturnType<typeof useCopy<typeof quizCopy>>;
  onSingle: (letter: string) => void; onMultiToggle: (letter: string) => void;
  onMultiSubmit: () => void; onTrueFalse: (val: string) => void;
  onOpenSubmit: (text: string) => void;
}) {
  const { submitted, selected, correct } = state;
  const [openText, setOpenText] = useState("");

  function optionClass(letter: string) {
    const isSelected = Array.isArray(selected) ? selected.includes(letter) : selected === letter;
    if (!submitted) {
      return isSelected ? "bg-[var(--accent-soft)] text-[var(--accent-text)] border-[var(--accent)]" : "border-[var(--border-subtle)] hover:bg-[var(--bg-secondary)]";
    }
    const isCorrectAnswer = q.answer?.includes(letter);
    if (isCorrectAnswer) return "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 border-emerald-400";
    if (isSelected && !correct) return "bg-red-50 dark:bg-red-900/20 text-red-600 border-red-300";
    return "border-[var(--border-subtle)] text-[var(--text-muted)]";
  }

  const tfOptions = [
    { val: "对", label: `✓ ${qt.correctLabel}` },
    { val: "错", label: `✗ ${qt.wrongLabel}` },
  ];

  return (
    <div className={`rounded-lg p-4 border ${correct ? "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-900/5" : submitted && !correct ? "border-red-300 bg-red-50/50 dark:bg-red-900/5" : "bg-[var(--bg-secondary)] dark:bg-[var(--bg-elevated)] border-[var(--border-subtle)]"}`}>
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
          q.type === "single" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" :
          q.type === "multiple" ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300" :
          q.type === "truefalse" ? "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300" :
          "bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-400"}`}>
          {getTypeLabel(qt, q.type)}
        </span>
        {submitted && (correct ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-red-500" />)}
      </div>
      <p className="text-sm font-medium text-[var(--text-primary)] mb-2">{index + 1}. {q.question}</p>

      {q.options?.length && q.type !== "truefalse" && (
        <div className="space-y-1.5">
          {q.options.map((opt, j) => {
            const letter = OPTION_LETTERS[j];
            return (
              <button key={j}
                onClick={() => {
                  if (submitted) return;
                  if (q.type === "single") onSingle(letter);
                  else onMultiToggle(letter);
                }}
                disabled={submitted}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition-colors ${optionClass(letter)} ${!submitted ? "cursor-pointer" : "cursor-default"}`}
              >
                <span className="font-medium mr-2">{letter}.</span>{opt}
              </button>
            );
          })}
          {q.type === "multiple" && !submitted && (
            <button onClick={onMultiSubmit}
              disabled={(Array.isArray(selected) ? selected : []).length === 0}
              className="mt-2 flex items-center gap-1.5 px-4 py-2 bg-[var(--accent)] text-white rounded-lg text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors">
              <Send className="w-3.5 h-3.5" />{qt.confirmSubmit}
            </button>
          )}
        </div>
      )}

      {q.type === "truefalse" && !submitted && (
        <div className="flex gap-2 mt-2">
          {tfOptions.map(({ val, label }) => (
            <button key={val} onClick={() => onTrueFalse(val)}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                selected === val ? "bg-[var(--accent-soft)] text-[var(--accent-text)] border-[var(--accent)]" : "border-[var(--border-subtle)] hover:bg-[var(--bg-secondary)]"
              }`}>{label}</button>
          ))}
        </div>
      )}

      {q.type === "open" && !submitted && (
        <div className="flex gap-2 mt-2">
          <input type="text" value={openText} onChange={e => setOpenText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") onOpenSubmit(openText); }}
            placeholder={qt.inputAnswer}
            className="flex-1 px-3 py-2 text-sm border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-primary)] dark:bg-[var(--bg-elevated)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]" />
          <button onClick={() => onOpenSubmit(openText)}
            disabled={!openText.trim()}
            className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors">{qt.submitBtn}</button>
        </div>
      )}

      {submitted && (
        <div className="mt-3 p-3 rounded-lg bg-[var(--bg-primary)] dark:bg-zinc-800/50">
          {correct ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle className="w-4 h-4" /> {qt.answerCorrect}
            </p>
          ) : (
            <div>
              <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                <XCircle className="w-4 h-4" /> {qt.answerWrong}
              </p>
              {q.answer && <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">{qt.correctAnswer}: {q.answer}</p>}
            </div>
          )}
          {q.explanation && <p className="mt-1 text-xs text-[var(--text-muted)] italic">{q.explanation}</p>}
        </div>
      )}
    </div>
  );
}
