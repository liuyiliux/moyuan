import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  analyticsApi,
  type AnalyticsOverview,
  type TagStat,
  type SearchTrend,
  type GrowthStat,
} from "../../api/analytics";
import {
  Loader2,
  BarChart3,
  FileText,
  HardDrive,
  Layers,
  Clock,
  RefreshCw,
  TrendingUp,
  Search,
  Tag,
} from "lucide-react";

// ─── Design Tokens (use CSS variables) ───

const CARD =
  "taste-card hover:shadow-[var(--shadow-sm)] transition-shadow duration-200";
const BTN_SEC =
  "taste-btn-secondary text-xs px-3 py-1.5";
const TEXT_PRIMARY = "text-[var(--text-primary)]";
const TEXT_SECONDARY = "text-[var(--text-secondary)]";
const TEXT_MUTED = "text-[var(--text-muted)]";
const BADGE =
  "taste-badge bg-[var(--bg-secondary)] text-[var(--text-secondary)]";

// Content type color palette
const TYPE_COLORS: Record<string, string> = {
  note: "#0075de",
  text: "#0075de",
  image: "#10b981",
  video: "#8b5cf6",
  audio: "#f59e0b",
  pdf: "#ef4444",
  web: "#06b6d4",
  document: "#6366f1",
};

const TYPE_LABELS: Record<string, string> = {
  note: "笔记",
  text: "文本",
  image: "图片",
  video: "视频",
  audio: "音频",
  pdf: "PDF",
  web: "网页",
  document: "文档",
};

// ─── Helpers ───

function formatStorage(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(mb * 1024).toFixed(0)} KB`;
}

// ─── Sub-components ───

/** Overview stat card */
function StatCard({
  icon,
  label,
  value,
  accentColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accentColor: string;
}) {
  return (
    <div className={CARD}>
      <div className="p-5">
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${accentColor}12` }}
          >
            <div style={{ color: accentColor }}>{icon}</div>
          </div>
          <span className={`text-xs font-semibold uppercase tracking-wider ${TEXT_MUTED}`}>
            {label}
          </span>
        </div>
        <p className={`text-3xl font-bold tracking-tight ${TEXT_PRIMARY}`}>
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
      </div>
    </div>
  );
}

/** Content type distribution — pure CSS horizontal bar chart */
function ContentTypeChart({ byType }: { byType: Record<string, number> }) {
  const entries = Object.entries(byType).sort(([, a], [, b]) => b - a);
  const maxCount = entries.length > 0 ? Math.max(...entries.map(([, c]) => c), 1) : 1;

  return (
    <div className={CARD}>
      <div className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <BarChart3 className={`w-5 h-5 ${TEXT_MUTED}`} />
          <h2 className={`text-base font-bold tracking-tight ${TEXT_PRIMARY}`} style={{ letterSpacing: "-0.01em" }}>
            内容类型分布
          </h2>
        </div>
        {entries.length > 0 ? (
          <div className="space-y-4">
            {entries.map(([type, count]) => {
              const pct = (count / maxCount) * 100;
              const color = TYPE_COLORS[type] || "#6b7280";
              return (
                <div key={type}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-sm font-medium ${TEXT_PRIMARY}`}>
                      {TYPE_LABELS[type] || type}
                    </span>
                    <span className={`text-sm font-semibold tabular-nums ${TEXT_SECONDARY}`}>
                      {count}
                    </span>
                  </div>
                  <div className={`w-full h-2 rounded-full overflow-hidden bg-[var(--bg-secondary)]`}>
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: color,
                        minWidth: count > 0 ? "8px" : "0",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState text="暂无内容数据" />
        )}
      </div>
    </div>
  );
}

/** Tag ranking list */
function TagRanking({ tags }: { tags: TagStat[] }) {
  const navigate = useNavigate();

  return (
    <div className={CARD}>
      <div className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <Tag className={`w-5 h-5 ${TEXT_MUTED}`} />
          <h2 className={`text-base font-bold tracking-tight ${TEXT_PRIMARY}`} style={{ letterSpacing: "-0.01em" }}>
            标签使用排行
          </h2>
          <span className={`text-xs ml-auto ${TEXT_MUTED}`}>
            Top {tags.length}
          </span>
        </div>
        {tags.length > 0 ? (
          <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
            {tags.map((tag) => (
              <button
                key={tag.name}
                onClick={() => navigate(`/search?q=${encodeURIComponent(tag.name)}`)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-[var(--bg-secondary)] transition-colors text-left group`}
              >
                <span
                  className="w-5 h-5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: tag.color || "#d1d5db" }}
                />
                <span className="flex-1 text-sm font-medium truncate group-hover:text-[#0075de] dark:group-hover:text-[var(--accent-text)] transition-colors text-[rgba(0,0,0,0.95)] dark:text-[rgba(255,255,255,0.95)]">
                  {tag.name}
                </span>
                <span className={`text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full ${BADGE}`}>
                  {tag.count}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState text="暂无标签数据" />
        )}
      </div>
    </div>
  );
}

/** Search trends ranking */
function SearchTrendsRanking({ trends }: { trends: SearchTrend[] }) {
  const top10 = trends.slice(0, 10);

  return (
    <div className={CARD}>
      <div className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <Search className={`w-5 h-5 ${TEXT_MUTED}`} />
          <h2 className={`text-base font-bold tracking-tight ${TEXT_PRIMARY}`} style={{ letterSpacing: "-0.01em" }}>
            检索热度排行
          </h2>
          <span className={`text-xs ml-auto ${TEXT_MUTED}`}>
            Top {top10.length}
          </span>
        </div>
        {top10.length > 0 ? (
          <div className="space-y-1">
            {top10.map((trend, index) => (
              <div
                key={trend.query}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-[var(--bg-secondary)] transition-colors`}
              >
                <span
                  className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    index < 3 ? "text-[var(--text-inverse)]" : `${TEXT_SECONDARY}`
                  }`}
                  style={{
                    backgroundColor:
                      index === 0 ? "var(--accent)"
                      : index === 1 ? "var(--accent-hover)"
                      : index === 2 ? "var(--accent-text)"
                      : undefined,
                  }}
                >
                  {index >= 3 && (index + 1)}
                  {index < 3 && (index + 1)}
                </span>
                <span className={`flex-1 text-sm truncate ${TEXT_PRIMARY}`}>
                  {trend.query}
                </span>
                <span className={`text-xs tabular-nums ${TEXT_MUTED}`}>
                  {trend.count} 次
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState text="暂无搜索记录" />
        )}
      </div>
    </div>
  );
}

/** Growth trend — pure CSS vertical bar chart */
function GrowthTrendChart({ growth }: { growth: GrowthStat[] }) {
  const recent = growth.slice(-12);
  const maxCount = recent.length > 0 ? Math.max(...recent.map((g) => g.count), 1) : 1;
  const chartHeight = 180;

  return (
    <div className={CARD}>
      <div className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className={`w-5 h-5 ${TEXT_MUTED}`} />
          <h2 className={`text-base font-bold tracking-tight ${TEXT_PRIMARY}`} style={{ letterSpacing: "-0.01em" }}>
            内容增长趋势
          </h2>
          <span className={`text-xs ml-auto ${TEXT_MUTED}`}>
            最近 {recent.length} 周
          </span>
        </div>
        {recent.length > 0 ? (
          <div>
            {/* Bar chart area */}
            <div className="flex items-end gap-1.5" style={{ height: `${chartHeight}px` }}>
              {recent.map((item) => {
                const barH = Math.max(
                  (item.count / maxCount) * chartHeight,
                  item.count > 0 ? 4 : 0
                );
                return (
                  <div
                    key={item.week}
                    className="flex-1 flex flex-col items-center justify-end h-full group relative"
                  >
                    {/* Tooltip on hover */}
                    <div className="absolute bottom-full mb-2 hidden group-hover:block z-10 pointer-events-none">
                      <div
                        className="px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap text-[var(--text-inverse)]"
                        style={{ backgroundColor: "rgba(0,0,0,0.85)" }}
                      >
                        {item.week.slice(5)} - {item.count} 条
                      </div>
                    </div>
                    <div
                      className="w-full rounded-t-md transition-all duration-300 hover:opacity-70"
                      style={{
                        height: `${barH}px`,
                        backgroundColor: "#0075de",
                        opacity: 0.85,
                        minWidth: "4px",
                      }}
                    />
                  </div>
                );
              })}
            </div>
            {/* X-axis labels */}
            <div className="flex gap-1.5 mt-2">
              {recent.map((item) => (
                <div key={`label-${item.week}`} className="flex-1 text-center">
                  <span className={`text-[10px] tabular-nums ${TEXT_MUTED}`}>
                    {item.week.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState text="暂无增长数据" />
        )}
      </div>
    </div>
  );
}

/** Empty state placeholder */
function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <BarChart3 className="w-10 h-10 mb-3 text-[var(--text-muted)] dark:text-[var(--text-secondary)]" />
      <p className={`text-sm ${TEXT_MUTED}`}>{text}</p>
    </div>
  );
}

/** Error state with retry button */
function ErrorState({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
      <div className="taste-card border-[var(--danger-soft)] border-opacity-50 p-8 text-center">
        <p className="text-sm font-medium text-[var(--danger)]">{error}</p>
        <button
          onClick={onRetry}
          className="mt-4 px-5 py-2 rounded-md text-sm font-medium text-[var(--text-inverse)] bg-[#0075de] hover:bg-[#005eb8] transition-colors"
        >
          重试
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ───

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [tags, setTags] = useState<TagStat[]>([]);
  const [trends, setTrends] = useState<SearchTrend[]>([]);
  const [growth, setGrowth] = useState<GrowthStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewData, tagsData, trendsData, growthData] =
        await Promise.all([
          analyticsApi.overview(),
          analyticsApi.tags(20),
          analyticsApi.searchTrends(10),
          analyticsApi.growth(),
        ]);
      setOverview(overviewData);
      setTags(tagsData.tags);
      setTrends(trendsData.trends);
      // Sort growth data chronologically (oldest first)
      const sorted = [...growthData.growth].sort((a, b) =>
        a.week.localeCompare(b.week)
      );
      setGrowth(sorted);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-7 h-7 animate-spin text-[var(--text-muted)] dark:text-[var(--text-muted)]" />
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return <ErrorState error={error} onRetry={fetchData} />;
  }

  // ── Derived data ──
  const pending = overview ? overview.total_contents - overview.embedded : 0;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className={`text-2xl font-bold tracking-tight ${TEXT_PRIMARY}`} style={{ letterSpacing: "-0.02em" }}>
              统计概览
            </h1>
            <p className={`text-sm mt-1 ${TEXT_SECONDARY}`}>知识库数据分析与可视化</p>
          </div>
          <button
            onClick={fetchData}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${BTN_SEC}`}
          >
            <RefreshCw className="w-4 h-4" />
            刷新
          </button>
        </div>

        {/* Overview Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={<FileText className="w-5 h-5" />}
            label="内容总数"
            value={overview?.total_contents ?? 0}
            accentColor="#0075de"
          />
          <StatCard
            icon={<HardDrive className="w-5 h-5" />}
            label="存储空间"
            value={formatStorage(overview?.total_storage_mb ?? 0)}
            accentColor="#10b981"
          />
          <StatCard
            icon={<Layers className="w-5 h-5" />}
            label="已嵌入"
            value={overview?.embedded ?? 0}
            accentColor="#8b5cf6"
          />
          <StatCard
            icon={<Clock className="w-5 h-5" />}
            label="待处理"
            value={pending}
            accentColor="#f59e0b"
          />
        </div>

        {/* Row 1: Content Distribution + Tag Ranking */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ContentTypeChart byType={overview?.by_type ?? {}} />
          <TagRanking tags={tags} />
        </div>

        {/* Row 2: Search Trends + Growth Trend */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SearchTrendsRanking trends={trends} />
          <GrowthTrendChart growth={growth} />
        </div>
      </div>
    </div>
  );
}
