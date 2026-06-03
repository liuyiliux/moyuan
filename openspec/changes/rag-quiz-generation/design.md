## Context

当前出题功能直接将 `text_content[:2000]` 发给 AI，对于 8 万字的书既不经济也不精准。项目已有完整的分块向量基础设施（`content_chunks` 表 + pgvector），但出题功能未利用这些向量数据。

参考《向量知识库——智能出题系统设计文档》和港大 DeepTutor 的 RAG 出题方案，核心思路是：**向量召回知识点切片 → 召回相似切片做干扰项 → AI 基于原文出题**。

## Goals / Non-Goals

**Goals:**
- 支持两种出题模式：随机出题（从 chunk 中随机抽取）和按主题出题（用户输入关键词，向量召回相关 chunk）
- 干扰项从向量召回的相似 chunk 中提取，而非 AI 编造
- 题目可溯源（返回 chunk_id、page_number）
- 题目持久化到 `questions` 表，刷新不丢失
- 支持 4 种题型：单选、多选、判断、简答

**Non-Goals:**
- 题目向量化查重（阶段 2）
- 错题薄弱点补强出题（阶段 3）
- 自动组卷（阶段 3）
- 难度自适应（阶段 2）
- 图片 chunk 多模态出题（需 OCR 或多模态模型支持，暂不实现）

## Decisions

### D1: 出题素材来源 — 从 content_chunks 检索，而非 text_content

**选择**：从 `content_chunks` 表检索相关 chunk 作为出题素材

**理由**：
- chunk 已经是 150-500 字的知识点粒度，适合出题
- chunk 有向量，可以语义检索
- chunk 有 page_number，可以溯源
- 避免全书 8 万字发给 AI

**替代方案**：
- 全量发送 text_content[:6000]：Token 浪费、考点随机、质量差
- 对 text_content 重新分块：重复计算，已有 chunk 可复用

### D2: 两种出题模式的检索策略

**随机出题**：从当前内容的 `content_chunks` 中随机抽取 5-10 个有文本的 chunk

**按主题出题**：
1. 用户输入主题（如"人像摄影"）
2. 调用嵌入模型将主题向量化
3. 在当前内容的 chunk 中向量检索 Top-10 相关 chunk
4. 同时对每个命中的 chunk，检索 2-3 个相似 chunk 作为干扰项素材

**理由**：按主题出题是核心差异化功能，让用户能精准练习薄弱知识点。

### D3: 干扰项生成策略

**选择**：对每个出题 chunk，向量检索 2-3 个相似 chunk，将相似 chunk 的内容作为干扰项素材传给 AI

**理由**：
- 设计文档核心思想：干扰项来自相似语义切片，模拟真实易错点
- 比 AI 自由编造的干扰项质量高得多
- 相似 chunk 来自同一本书，保证不超纲

### D4: Prompt 设计 — 使用设计文档的四种模板

**选择**：单选/填空/判断/简答四种 Prompt，严格约束 AI 只使用给定原文

**理由**：
- 设计文档的 Prompt 经过验证，干扰项提取规则明确
- 严格约束"无原文不出题、无相似素材不编造干扰项"

### D5: 题目持久化 — 新建 questions 表

**选择**：新建 `questions` 表存储生成的题目

```sql
CREATE TABLE questions (
    id UUID PRIMARY KEY,
    content_id UUID REFERENCES contents(id),
    q_type VARCHAR(20),        -- single/multiple/truefalse/open
    question TEXT NOT NULL,
    options JSONB,             -- 选项（选择题）
    answer TEXT NOT NULL,
    explanation TEXT,          -- 解析
    source_chunk_id UUID,      -- 溯源 chunk
    page_number INT,           -- 溯源页码
    difficulty VARCHAR(10),    -- easy/medium/hard
    created_at TIMESTAMP
);
```

**理由**：
- 题目刷新不丢失
- 后续可扩展错题收集、组卷等功能
- 可统计每道题的答对率

### D6: 前端交互 — AI 面板增加出题模式选择

**选择**：在 AI 面板的出题区域添加：
- 模式切换：随机出题 / 按主题出题
- 主题输入框（按主题模式时显示）
- 题型选择（默认全部）
- 题目数量（默认 5）

## Risks / Trade-offs

- **[主题向量化需要嵌入 API 调用]** → 复用现有 `embed_texts` 函数，成本极低（一句话的 embedding）
- **[图片 PDF 没有 text chunk]** → 随机出题模式下提示"暂无文本分块"，按主题模式下同理；图片出题需 OCR 支持，暂不实现
- **[相似 chunk 可能来自同一页]** → 检索时加 `chunk_id != :current` 排除自身，但同页不同 chunk 可能语义相似，这是可接受的
- **[AI 可能不严格遵循 Prompt 约束]** → Prompt 中反复强调"只能使用给定原文"，并在解析返回时校验格式
