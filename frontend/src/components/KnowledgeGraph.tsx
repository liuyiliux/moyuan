import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import * as d3 from "d3";
import { Plus, X, Search, Loader2 } from "lucide-react";
import {
  relationApi,
  type RelationWithContent,
  type RelationSuggestion,
  type GraphNode,
  type GraphLink,
} from "../api/relations";
import { api } from "../api/provider";

/** 关系类型标签映射 */
const RELATION_LABELS: Record<string, string> = {
  reference: "引用",
  series: "系列",
  similar: "相似",
};

const RELATION_COLORS: Record<string, string> = {
  reference: "#3b82f6",
  series: "#22c55e",
  similar: "#f97316",
};

const TYPE_COLORS: Record<string, string> = {
  note: "#3b82f6",
  video: "#a855f7",
  image: "#22c55e",
  pdf: "#ef4444",
  audio: "#f97316",
  doc: "#6366f1",
  web: "#06b6d4",
};

interface KnowledgeGraphProps {
  /** 当前内容 ID */
  contentId: string;
  /** 当前内容标题 */
  contentTitle: string;
  /** 当前内容类型 */
  contentType: string;
}

export default function KnowledgeGraph({
  contentId,
  contentTitle,
  contentType,
}: KnowledgeGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [relations, setRelations] = useState<RelationWithContent[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    { id: string; title: string; content_type: string }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [selectedType, setSelectedType] = useState<string>("reference");
  const [suggestions, setSuggestions] = useState<RelationSuggestion[]>([]);
  const [ignoredSuggestions, setIgnoredSuggestions] = useState<Set<string>>(new Set());
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  // 加载关系数据
  const loadRelations = useCallback(async () => {
    try {
      setLoading(true);
      const data = await relationApi.list(contentId);
      setRelations(data);
    } catch (err) {
      console.error("Failed to load relations:", err);
    } finally {
      setLoading(false);
    }
  }, [contentId]);

  const loadSuggestions = useCallback(async () => {
    try {
      setSuggestionsLoading(true);
      const data = await relationApi.suggestions(contentId, 5);
      setSuggestions(data);
    } catch (err) {
      console.error("Failed to load relation suggestions:", err);
      setSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  }, [contentId]);

  useEffect(() => {
    loadRelations();
    loadSuggestions();
    setIgnoredSuggestions(new Set());
  }, [loadRelations, loadSuggestions]);

  // 搜索内容
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        const data = await api.get<{ items?: { id: string; title: string; content_type: string }[] }>(
          `/contents?keyword=${encodeURIComponent(searchQuery)}&page_size=10`
        );
        setSearchResults(
          (data.items || [])
            .filter((item: { id: string }) => item.id !== contentId)
            .map((item: { id: string; title: string; content_type: string }) => ({
              id: item.id,
              title: item.title,
              content_type: item.content_type,
            }))
        );
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, contentId]);

  // 创建关系
  async function handleCreateRelation(targetId: string) {
    try {
      await relationApi.create({
        source_id: contentId,
        target_id: targetId,
        relation_type: selectedType,
      });
      setShowAddDialog(false);
      setSearchQuery("");
      loadRelations();
      loadSuggestions();
    } catch (err) {
      console.error("Failed to create relation:", err);
    }
  }

  async function handleConfirmSuggestion(suggestion: RelationSuggestion) {
    try {
      await relationApi.create({
        source_id: contentId,
        target_id: suggestion.id,
        relation_type: "similar",
        metadata: {
          source: "auto_suggestion",
          similarity: suggestion.similarity,
          reason: suggestion.reason,
        },
      });
      setSuggestions((prev) => prev.filter((item) => item.id !== suggestion.id));
      await loadRelations();
      await loadSuggestions();
    } catch (err) {
      console.error("Failed to confirm relation suggestion:", err);
    }
  }

  function handleIgnoreSuggestion(id: string) {
    setIgnoredSuggestions((prev) => new Set(prev).add(id));
  }

  // 渲染 D3 力导向图
  useEffect(() => {
    if (!svgRef.current || loading) return;

    const svg = d3.select(svgRef.current);
    const width = 400;
    const height = 400;

    // 清空
    svg.selectAll("*").remove();

    // 构建图数据
    const nodes: GraphNode[] = [
      {
        id: contentId,
        title: contentTitle,
        content_type: contentType,
        isCenter: true,
      },
      ...relations.map((r) => ({
        id: r.target_id,
        title: r.target_title,
        content_type: r.target_type,
        isCenter: false,
      })),
    ];

    const links: GraphLink[] = relations.map((r) => ({
      source: contentId,
      target: r.target_id,
      relation_type: r.relation_type,
      label: RELATION_LABELS[r.relation_type] || r.relation_type,
    }));

    // 去重节点
    const uniqueNodes = Array.from(
      new Map(nodes.map((n) => [n.id, n])).values()
    );

    // 计算节点大小（按关联数量）
    const linkCount: Record<string, number> = {};
    links.forEach((l) => {
      const srcId = typeof l.source === "object" ? (l.source as unknown as GraphNode).id : l.source;
      const tgtId = typeof l.target === "object" ? (l.target as unknown as GraphNode).id : l.target;
      linkCount[srcId] = (linkCount[srcId] || 0) + 1;
      linkCount[tgtId] = (linkCount[tgtId] || 0) + 1;
    });

    // 创建 SVG
    const g = svg.append("g");

    // 缩放
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 3])
      .on("zoom", (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        g.attr("transform", event.transform.toString());
      });

    svg.call(zoom);

    // 初始居中
    svg.call(
      zoom.transform,
      d3.zoomIdentity.translate(width / 2, height / 2)
    );

    // 箭头定义
    const defs = svg.append("defs");

    Object.entries(RELATION_COLORS).forEach(([type, color]) => {
      defs
        .append("marker")
        .attr("id", `arrow-${type}`)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 20)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", color);
    });

    // 力模拟
    const simulation = d3
      .forceSimulation<GraphNode>(uniqueNodes)
      .force(
        "link",
        d3
          .forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance(120)
      )
      .force("charge", d3.forceManyBody<GraphNode>().strength(-300))
      .force("center", d3.forceCenter(0, 0))
      .force("collision", d3.forceCollide<GraphNode>().radius(40));

    // 连线
    const link = g
      .append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(links)
      .enter()
      .append("line")
      .attr("stroke", (d) => RELATION_COLORS[d.relation_type] || "#999")
      .attr("stroke-width", 2)
      .attr("stroke-opacity", 0.6)
      .attr("marker-end", (d) => `url(#arrow-${d.relation_type})`);

    // 连线标签
    const linkLabel = g
      .append("g")
      .attr("class", "link-labels")
      .selectAll("text")
      .data(links)
      .enter()
      .append("text")
      .attr("text-anchor", "middle")
      .attr("font-size", 10)
      .attr("fill", "#9ca3af")
      .text((d) => d.label);

    // 节点组
    const node = g
      .append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(uniqueNodes)
      .enter()
      .append("g")
      .call(
        d3.drag<SVGGElement, GraphNode>()
          .on("start", (event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    // 节点圆
    node
      .append("circle")
      .attr("r", (d) => {
        const count = linkCount[d.id] || 0;
        return d.isCenter ? 22 : 12 + Math.min(count * 3, 10);
      })
      .attr("fill", (d) => TYPE_COLORS[d.content_type] || "var(--type-default, #6b7280)")
      .attr("stroke", (d) => (d.isCenter ? "var(--center-stroke, #1e293b)" : "transparent"))
      .attr("stroke-width", (d) => (d.isCenter ? 3 : 0))
      .style("cursor", "pointer")
      .on("click", (_event: MouseEvent, d: GraphNode) => {
        if (!d.isCenter) {
          navigate(`/contents/${d.id}`);
        }
      });

    // 节点文本
    node
      .append("text")
      .attr("dy", (d) => (d.isCenter ? 32 : 22))
      .attr("text-anchor", "middle")
      .attr("font-size", (d) => (d.isCenter ? 12 : 10))
      .attr("font-weight", (d) => (d.isCenter ? 600 : 400))
      .attr("fill", "var(--text-primary, rgba(0,0,0,0.85))")
      .text((d) => {
        const maxLen = d.isCenter ? 12 : 8;
        return d.title.length > maxLen
          ? d.title.slice(0, maxLen) + "..."
          : d.title;
      })
      .style("cursor", "pointer")
      .on("click", (_event: MouseEvent, d: GraphNode) => {
        if (!d.isCenter) {
          navigate(`/contents/${d.id}`);
        }
      });

    // 节点类型指示
    node
      .append("circle")
      .attr("r", 4)
      .attr("cx", (d) => (d.isCenter ? 18 : 10))
      .attr("cy", (d) => (d.isCenter ? -18 : -10))
        .attr("fill", (d) => TYPE_COLORS[d.content_type] || "var(--type-default, #6b7280)")
        .attr("stroke", "var(--text-inverse, white)")
      .attr("stroke-width", 1.5);

    // Tick 更新位置
    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as unknown as GraphNode).x ?? 0)
        .attr("y1", (d) => (d.source as unknown as GraphNode).y ?? 0)
        .attr("x2", (d) => (d.target as unknown as GraphNode).x ?? 0)
        .attr("y2", (d) => (d.target as unknown as GraphNode).y ?? 0);

      linkLabel
        .attr("x", (d) => {
          const s = d.source as unknown as GraphNode;
          const t = d.target as unknown as GraphNode;
          return ((s.x ?? 0) + (t.x ?? 0)) / 2;
        })
        .attr("y", (d) => {
          const s = d.source as unknown as GraphNode;
          const t = d.target as unknown as GraphNode;
          return ((s.y ?? 0) + (t.y ?? 0)) / 2 - 8;
        });

      node.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => {
      simulation.stop();
    };
  }, [contentId, contentTitle, contentType, relations, loading, navigate]);

  return (
    <div className="bg-[var(--bg-card)] dark:bg-[var(--bg-card)] border border-[var(--border-subtle)] dark:border-[var(--border-subtle)] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(0,0,0,0.06)] dark:border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <svg
            className="w-4 h-4 text-[var(--accent-text)]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="3" />
            <circle cx="4" cy="6" r="2" />
            <circle cx="20" cy="6" r="2" />
            <circle cx="4" cy="18" r="2" />
            <circle cx="20" cy="18" r="2" />
            <line x1="9.5" y1="10.5" x2="5.5" y2="7.5" />
            <line x1="14.5" y1="10.5" x2="18.5" y2="7.5" />
            <line x1="9.5" y1="13.5" x2="5.5" y2="16.5" />
            <line x1="14.5" y1="13.5" x2="18.5" y2="16.5" />
          </svg>
          <h3 className="text-sm font-semibold text-[rgba(0,0,0,0.95)] dark:text-[var(--text-primary)]">
            关联图谱
          </h3>
          <span className="text-xs text-[#615d59] dark:text-[var(--text-muted)]">
            {relations.length} 个关联
          </span>
        </div>
        <button
          onClick={() => setShowAddDialog(true)}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-[#0075de] text-[var(--text-inverse)] rounded-lg hover:bg-[var(--accent)] transition-colors"
        >
          <Plus className="w-3 h-3" />
          添加关联
        </button>
      </div>

      {(() => {
        const visibleSuggestions = suggestions.filter((item) => !ignoredSuggestions.has(item.id));
        if (visibleSuggestions.length === 0 && !suggestionsLoading) return null;
        return (
          <div className="border-b border-[rgba(0,0,0,0.06)] dark:border-[var(--border-subtle)] bg-[var(--bg-secondary)]/60 dark:bg-[var(--bg-elevated)]/40 px-4 py-3">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div>
                <h4 className="text-xs font-semibold text-[var(--text-primary)]">待确认相似关联</h4>
                <p className="text-[10px] text-[var(--text-muted)]">根据向量相似度推荐，可确认加入图谱或忽略。</p>
              </div>
              {suggestionsLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-muted)]" />}
            </div>
            <div className="space-y-2">
              {visibleSuggestions.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-[var(--text-primary)]">{item.title}</p>
                    <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                      {item.content_type} · {(item.similarity * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => handleConfirmSuggestion(item)}
                      className="px-2 py-1 text-[10px] font-medium rounded-md bg-[var(--accent)] text-[var(--text-inverse)] hover:opacity-90 transition-opacity"
                    >
                      确认
                    </button>
                    <button
                      onClick={() => handleIgnoreSuggestion(item.id)}
                      className="px-2 py-1 text-[10px] font-medium rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                    >
                      忽略
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Graph */}
      <div className="relative">
        {loading ? (
          <div className="flex items-center justify-center h-[400px] text-[#615d59]">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            加载中...
          </div>
        ) : relations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[400px] text-[#615d59]">
            <svg
              className="w-12 h-12 mb-3 text-[var(--text-muted)]/40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="12" cy="12" r="3" />
              <circle cx="4" cy="6" r="2" />
              <circle cx="20" cy="6" r="2" />
              <circle cx="4" cy="18" r="2" />
              <circle cx="20" cy="18" r="2" />
            </svg>
            <p className="text-sm">暂无关联内容</p>
            <p className="text-xs mt-1">点击「添加关联」开始构建知识图谱</p>
          </div>
        ) : (
          <>
            <svg
              ref={svgRef}
              width="400"
              height="400"
              className="w-full bg-[var(--bg-elevated)] dark:bg-[var(--bg-elevated)]"
            />
            {/* 图例 */}
            <div className="absolute bottom-2 left-2 flex flex-wrap gap-2 p-2 bg-[var(--bg-card)]/80 dark:bg-[var(--bg-card)]/80 rounded-lg backdrop-blur-sm text-[10px]">
              {Object.entries(RELATION_LABELS).map(([type, label]) => (
                <div key={type} className="flex items-center gap-1">
                  <span
                    className="w-3 h-0.5 rounded"
                    style={{ backgroundColor: RELATION_COLORS[type] }}
                  />
                  <span className="text-[#615d59] dark:text-[var(--text-muted)]">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Add Dialog */}
      {showAddDialog && (
        <div className="border-t border-[rgba(0,0,0,0.06)] dark:border-[var(--border-subtle)] bg-[#f6f5f4] dark:bg-[var(--bg-elevated)]/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-[rgba(0,0,0,0.95)] dark:text-[var(--text-primary)]">
              添加关联
            </h4>
            <button
              onClick={() => {
                setShowAddDialog(false);
                setSearchQuery("");
              }}
              className="text-[#615d59] hover:text-[rgba(0,0,0,0.95)] dark:text-[var(--text-muted)] dark:hover:text-[var(--text-primary)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 关系类型选择 */}
          <div className="flex gap-2 mb-3">
            {(["reference", "series", "similar"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  selectedType === type
                        ? "bg-[var(--accent)] text-[var(--text-inverse)]"
                        : "bg-[var(--bg-card)] dark:bg-[var(--bg-elevated)] text-[var(--text-muted)] dark:text-[var(--text-muted)] border border-[var(--border-subtle)] dark:border-[var(--border-subtle)]"
                }`}
              >
                {RELATION_LABELS[type]}
              </button>
            ))}
          </div>

          {/* 搜索框 */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#615d59]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索要关联的内容..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-[var(--bg-card)] dark:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] dark:border-[var(--border-subtle)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)] text-[var(--text-primary)] dark:text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </div>

          {/* 搜索结果 */}
          <div className="max-h-40 overflow-y-auto space-y-1">
            {searching ? (
              <div className="flex items-center justify-center py-4 text-[#615d59]">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                搜索中...
              </div>
            ) : searchResults.length > 0 ? (
              searchResults.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleCreateRelation(item.id)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm bg-[var(--bg-card)] dark:bg-zinc-700 rounded-lg hover:bg-[#f6f5f4] dark:hover:bg-zinc-600 transition-colors"
                >
                  <span className="text-[rgba(0,0,0,0.95)] dark:text-[var(--text-primary)] truncate">
                    {item.title}
                  </span>
                  <span className="text-xs text-[#615d59] dark:text-[var(--text-muted)] ml-2 shrink-0">
                    {item.content_type}
                  </span>
                </button>
              ))
            ) : searchQuery.trim() ? (
              <p className="text-center py-4 text-sm text-[#615d59]">
                未找到匹配内容
              </p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
