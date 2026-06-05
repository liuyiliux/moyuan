## Context

当前出题系统（`backend/app/api/ai.py` 的 `generate_quiz`）已实现基本的 RAG 出题流程：范围展开→源块选取→干扰项检索→Prompt 拼装→LLM 调用→题目入库。但系统存在若干质量控制机制的缺失，参考《AI智能出题系统优化设计文档》进行系统性升级。

**当前痛点**:
- 切块无 `disable_quiz` 和 `difficulty` 标记，低质量/过难/过易内容无法排除
- 干扰项检索无相似度阈值，可能引入无关内容
- 无 Token 总量控制，多切块可能超出 LLM 上下文
- 题目入库前无查重，重复题目浪费存储和 LLM 费用
- 无错题专项出题，无法实现薄弱知识精准补强
- 出题范围每次全量查库，分类树递归查询无缓存
- 向量检索失败无降级策略，直接返回空结果

**现有技术基础**:
- PostgreSQL 16 + pgvector 0.3.6，4096 维向量（Qwen3-VL-Embedding-8B）
- Redis 7 已部署但仅在 WebSocket 进度推送中使用
- FastAPI + SQLAlchemy async，Alembic 管理迁移
- OpenAI 兼容 API（DeepSeek 等）用于 LLM 调用和嵌入生成

## Goals / Non-Goals

**Goals:**
- 切块支持"禁出"和"难度"标记，出题时自动过滤
- 题目入库前向量查重，避免重复题目
- 干扰项检索增加相似度阈值 0.75
- Token 总量硬性限制（源块≤10，总切块≤40）
- 出题范围 Redis 缓存减少重复查库
- 新增错题专项出题接口
- Prompt 格式规范化（三段式 system_prompt）
- 异常降级与重试策略

**Non-Goals:**
- 向量聚合聚类组卷（KMeans/HDBSCAN）—— 属于未来阶段，本次仅做数据模型预留
- 难度自适应出题算法
- 图片/音频内容出题（当前仅 text chunk）
- 多用户/权限系统（单用户系统）

## Decisions

### D1: 切块控制字段设计

**选择**：在 `content_chunks` 表直接增加 `disable_quiz` (boolean, default=false) 和 `difficulty` (int 1-5, nullable)。

**理由**：
- 不需要独立的"出题规则表"，减少 JOIN 开销
- `disable_quiz` 是简单开关，`difficulty` 可在上传时自动评估或手动设置
- 字段默认值向后兼容，不影响现有切块
- 过滤条件统一在 `_random_pick_chunks` / `_topic_search_chunks` 中应用

**替代方案**：独立 `chunk_quiz_config` 关联表 → 增加 JOIN，对高频出题查询不友好

### D2: 题目查重策略

**选择**：在 `_save_questions` 入库前，对每题文本做向量化，在 `questions` 表同 content 范围内余弦检索，相似度 > 0.9 判定重复并丢弃。

**向量存储**: 新增 `questions.embedding` 字段 (vector 4096)，必须可 NULL（兼容旧数据）。

**去重流程**:
```
对每题:
  q_vec = embed_texts([q.question])[0]
  SELECT * FROM questions WHERE content_id IN(:source_content_ids) 
    AND embedding IS NOT NULL 
    AND (embedding <=> q_vec) < 0.1  -- 余弦距离 < 0.1 即相似度 > 0.9
    LIMIT 1
  IF exists: skip (重复)
  ELSE: INSERT with embedding
```

**理由**：
- 语义级别查重，比文本编辑距离更准确（同一概念不同措辞仍可识别）
- 在入库时同步做向量化，不增加前端等待时间
- 复用现有 embedding provider 配置

**替代方案**：文本 hash 去重 → 无法识别同义改写；入库后异步去重 → 存储浪费

### D3: 干扰项相似度阈值

**选择**：在 `_find_similar_chunks` SQL 中增加 `min_similar` 参数，WHERE 条件增加 `(embedding <=> query_vec) <= 0.25`（余弦距离 ≤ 0.25 即相似度 ≥ 0.75）。

**SQL 变化**:
```sql
-- 旧: ORDER BY embedding <=> query_vec LIMIT 3
-- 新: WHERE (embedding <=> query_vec) <= 0.25 ORDER BY embedding <=> query_vec LIMIT 3
```

**理由**：
- 直接在向量检索层面过滤，不产生无效 recall
- 0.75 是文本语义相似度的合理阈值（同主题、不同角度）
- 如果某源块无满足阈值的干扰块，允许为空（不影响该源块出题）

### D4: Token 总量控制

**选择**：硬性约束 `source_count = min(question_count, 10)`，`total_chunks ≤ 40`。当干扰块数量过多时，按源块均匀削减。

**预估对照表**:
| 出题数 | 源块 | 干扰块上限 | 总切块 | 预估 Token |
|--------|------|------------|--------|------------|
| 3      | 3    | 9          | 12     | ~3000      |
| 5      | 5    | 15         | 20     | ~5500      |
| 8      | 8    | 24         | 32     | ~9500      |
| 10     | 10   | 30         | 40     | ~13000     |

**剪裁策略**: 若 `len(source_chunks) * 4 > 40`，对每个源块只保留相似度最高的前 `floor(40 / len(source_chunks)) - 1` 个干扰块（-1 为源块自身预留）。

### D5: 出题范围缓存策略

**选择**：分类树子分类 ID 列表和合集绑定 content_id 列表 Redis 缓存，TTL 60 分钟。缓存键格式：
- `quiz:scope:category:<category_id>` → JSON 数组 of content_ids
- `quiz:scope:collection:<collection_id>` → JSON 数组 of content_ids

**失效策略**:
- TTL 自然过期
- 分类/合集 增删改接口中主动删除对应 key（乐观失效）

**Redis 不可用时降级**: 直接查库，不报错。

### D6: Prompt 三段规范格式

**选择**：将 `DEFAULT_PROMPT_TEMPLATES["quiz"]["system_prompt"]` 重构为三段固定结构：

```
【一、出题质量规范】
优先依据原文生成概念、定义、原理、方法类考题...

【二、素材强制约束】
1. 题干和正确答案 100% 取自原文知识点
2. 单选/多选错误选项仅能从干扰项素材提取
3. 每题标注来源 chunk_id、页码...

【三、输出格式约束】
只返回标准 JSON，严格遵循约定 Schema...
```

**理由**：
- 三段结构使 LLM 更易理解和遵循
- 素材强制约束消除了"AI 编造知识点"的可能性
- 与设计文档规范一致

### D7: 异常降级与重试

**降级策略**:
1. **向量检索无结果** (`_topic_search_chunks` 返回空): 自动降级为 `_random_pick_chunks`，日志记录降级事件
2. **LLM JSON 解析失败**: 重试 1 次（重新调用 LLM），失败则返回错误信息而非空列表
3. **源块无 embedding**: 跳过该源块的干扰项检索，但不中断整轮出题

### D8: 错题专项出题接口

**选择**：新增 `POST /api/ai/wrong_quiz`，入参为 `{wrong_question_texts: string[], question_count: int, scope_type: string, scope_id: string}`。

**流程**:
```
wrong_texts 每段文本向量化
↓
每个向量在出题范围内检索 top_k 相似切块（合并去重）
↓
复用现有 _find_similar_chunks + Prompt 生成全链路
↓
题目入库（含向量查重）
```

### D9: 题目多来源追踪

**选择**：`questions` 表增加 `source_chunk_ids` (JSONB array) 和 `source_content_ids` (JSONB array)，替代当前单一 `source_chunk_id`。

**理由**：跨内容出题时一道题可能引用多个 content 的多个 chunk，当前只能存一个来源，溯源不完整。用 JSONB 存储灵活且查询方便（`@>` 运算符）。

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|---------|
| 题目向量化增加 embedding API 调用费用 | 仅对新增题目做一次向量化，批量调用（≤64 条/批）；旧题目不加向量 |
| Redis 缓存与数据不一致 | TTL 60min + 增删改主动失效，不一致窗口可控 |
| 相似度阈值 0.75 可能导致部分题目缺干扰项 | 干扰项非必需，Prompt 已覆盖"无干扰素材时从原文不同角度出题" |
| 题目查重阈值 0.9 可能漏掉部分重复 | 阈值可调；宁可漏过（允许少量重复）比误删（丢失有效题目）好 |
| LLM 重试增加延迟和费用 | 仅重试 1 次，JSON 解析失败概率低；重试前记录 warning 日志 |

## Migration Plan

1. **数据库迁移**（Alembic）:
   - 新增 `content_chunks.disable_quiz` 列 (default=false)
   - 新增 `content_chunks.difficulty` 列 (nullable)
   - 新增 `questions.embedding` 列 (nullable)
   - 新增 `questions.source_chunk_ids` 列 (nullable JSONB)
   - 新增 `questions.source_content_ids` 列 (nullable JSONB)
2. **后端部署**: 新版本直接运行，旧数据兼容（新字段为 nullable，默认值兼容）
3. **前端部署**: 无需特殊迁移，新增的难度筛选为可选功能
4. **回滚**: 删除新增列即可（无破坏性变更），旧代码兼容 NULL 字段

## Open Questions

- 难度等级由谁设置？建议初期由上传时 AI 自动评估，后续支持手动调整
- 聚类组卷（KMeans/HDBSCAN）的具体参数和训练频率待定
- 是否需要支持用户自定义相似度阈值？当前硬编码 0.75，后续可考虑加入前端配置项
