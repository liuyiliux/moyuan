import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  List,
  X,
  Loader2,
} from "lucide-react";
import type { SeriesInfo } from "../api/relations";

interface SeriesNavigationProps {
  /** 系列信息数据 */
  series: SeriesInfo;
  /** 是否正在加载 */
  loading?: boolean;
}

export default function SeriesNavigation({
  series,
  loading = false,
}: SeriesNavigationProps) {
  const [showList, setShowList] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-3 bg-[var(--bg-secondary)] dark:bg-[var(--bg-secondary)]/50 rounded-xl border border-[var(--border-subtle)] dark:border-[var(--border-subtle)]">
        <Loader2 className="w-4 h-4 animate-spin text-[var(--text-muted)] mr-2" />
        <span className="text-sm text-[var(--text-muted)]">加载系列信息...</span>
      </div>
    );
  }

    return (
      <div className="bg-[var(--bg-card)] dark:bg-[var(--bg-card)] border border-[var(--border-subtle)] dark:border-[var(--border-subtle)] rounded-xl overflow-hidden">
      {/* 导航栏 */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <svg
            className="w-4 h-4 text-[var(--accent-text)] shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            <line x1="8" y1="7" x2="16" y2="7" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
          <span className="text-sm font-medium text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">
            {series.series_name}
          </span>
          <span className="text-xs text-[var(--text-muted)] dark:text-[var(--text-muted)] shrink-0">
            {series.current_index}/{series.total}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* 上一集 */}
          {series.prev ? (
            <Link
              to={`/contents/${series.prev.id}`}
              className="flex items-center gap-1 px-2 py-1 text-xs text-[var(--text-secondary)] dark:text-[var(--text-muted)] hover:text-[var(--accent-text)] hover:bg-[var(--accent-soft)] dark:hover:bg-blue-950/30 rounded-md transition-colors"
              title={series.prev.title}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">上一集</span>
            </Link>
          ) : (
            <span className="flex items-center gap-1 px-2 py-1 text-xs text-[var(--text-muted)] cursor-not-allowed opacity-40">
              <ChevronLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">上一集</span>
            </span>
          )}

          {/* 下一集 */}
          {series.next ? (
            <Link
              to={`/contents/${series.next.id}`}
              className="flex items-center gap-1 px-2 py-1 text-xs text-[var(--text-secondary)] dark:text-[var(--text-muted)] hover:text-[var(--accent-text)] hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-soft)] rounded-md transition-colors"
              title={series.next.title}
            >
              <span className="hidden sm:inline">下一集</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          ) : (
            <span className="flex items-center gap-1 px-2 py-1 text-xs text-[var(--text-muted)] cursor-not-allowed opacity-40">
              <span className="hidden sm:inline">下一集</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </span>
          )}

          {/* 查看全部按钮 */}
          <button
            onClick={() => setShowList((v) => !v)}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors ml-1 ${
              showList
                ? "bg-[var(--accent)] text-[var(--text-inverse)]"
                : "text-[var(--text-secondary)] dark:text-[var(--text-muted)] hover:text-[var(--accent-text)] hover:bg-[var(--accent-soft)]"
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">全部</span>
          </button>
        </div>
      </div>

      {/* 系列列表弹窗 */}
      {showList && (
        <div className="border-t border-[var(--border-subtle)] dark:border-[var(--border-subtle)] bg-[var(--bg-elevated)] dark:bg-[var(--bg-elevated)]/50">
          <div className="flex items-center justify-between px-4 py-2">
            <span className="text-xs font-medium text-[var(--text-muted)] dark:text-[var(--text-muted)]">
              系列内容 · 共 {series.total} 集
            </span>
            <button
              onClick={() => setShowList(false)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] dark:text-[var(--text-muted)] dark:hover:text-[var(--text-primary)]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="px-4 pb-3 max-h-60 overflow-y-auto">
            <div className="space-y-0.5">
              {series.items.map((item, idx) => {
                const isCurrent = idx + 1 === series.current_index;
                return (
                  <Link
                    key={item.id}
                    to={`/contents/${item.id}`}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      isCurrent
                        ? "bg-[var(--accent)] text-[var(--text-inverse)] font-medium"
                        : "text-[var(--text-primary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-card)] dark:hover:bg-[var(--bg-card)]"
                    }`}
                  >
                    <span
                      className={`w-5 h-5 flex items-center justify-center text-xs rounded-full shrink-0 ${
                        isCurrent
                          ? "bg-[var(--accent-soft)] text-[var(--accent-text)]"
                          : "bg-[var(--bg-secondary)] text-[var(--text-muted)]"
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <span className="truncate">{item.title}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
