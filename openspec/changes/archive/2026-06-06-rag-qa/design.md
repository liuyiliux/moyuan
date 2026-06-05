## Context

当前系统已有完整的语义检索链路（`content_chunks` 表 + pgvector + `embed_texts`）和 AI 调用能力（provider-config + LLM API），题库生成（`POST /api/ai/quiz`）已验证了"检索→组 Prompt→调 LLM→解析"的流程可行。RAG 问答可最大化复用这些现有能力。

`prompt_templates` 表已支持 quiz/summarize/recommend 三种 `template_type`，新增 `qa` 类型即可，无需新建表。

## Goals / Non-Goals

**Goals:**
- 用户输入自然语言问题，系统返回基于知识库内容的 AI 生成答案
- 答案附带引用来源（content title + page + chunk snippet），可溯源
- 问答 Prompt 可通过 `prompt_templates` 编辑，沿用已有模板管理 UI
- 优先在搜索页面集成（问答/搜索双模式），后续可扩展内容详情页

**Non-Goals:**
- 不做多轮对话（本轮只做单轮问答）
- 不做流式输出（统一下一版本考虑 SSE）
- 不做 MCP Server 等外部接口

## Decisions

### 1. API 设计：复用向量检索，新增 ask 端点

`POST /api/ai/ask` 请求体：
```json
{
  "question": "阴天公园怎么拍照",
  "top_k": 5,
  "scope_type": "category",    // 可选，限定检索范围
  "scope_id": "xxx"            // 可选
}
```

流程：
1. `embed_texts(db, [question])` → 获取问题向量
2. pgvector cosine 检索 Top-K 个 text chunk
3. 组装 Prompt：system_prompt（从 `prompt_templates` 读取）+ user_prompt_template（替换 `{{question}}`、`{{context}}` 变量）
4. 调用 LLM（复用 `_get_ai_provider(db, "qa")`）
5. 返回 `{ answer, sources: [{content_title, page_number, snippet}] }`

**为什么不用现有 `/api/search`？**
搜索接口返回的是片段列表，问答需要在此基础上做 LLM 合成，是两个不同的用户场景，分开更清晰。

### 2. Prompt 模板：复用 prompt_templates 表

新增 `template_type="qa"` 默认模板，变量：
- `{{question}}` — 用户问题
- `{{context}}` — 检索到的 chunk 拼接（含来源标注）
- `{{top_k}}` — 检索数量

默认 system_prompt 示例：
```
你是一个知识库助手。基于以下检索到的内容回答用户问题。
如果内容不足以回答，请明确说明"知识库中暂无相关信息"。
回答时引用来源（书名+页码）。

【检索到的相关内容】
{{context}}
```

### 3. 前端：搜索页双模式切换

搜索页顶部新增 Toggle：🔍 搜索 | 💬 问答
- 搜索模式：现有行为不变
- 问答模式：输入问题 → 显示 AI 答案卡片（含引用链接）

复用现有搜索结果组件，新增 AnswerCard 组件展示 LLM 回答。

### 4. AI Provider：新增 qa 功能绑定

在 provider-config 的 `ai_features` 中新增 `"qa"` 选项，允许用户为问答单独指定模型。

## Risks / Trade-offs

- [R] LLM 响应延迟（5-15秒）影响体验 → 先做非流式，后续加 SSE 流式输出
- [R] 检索质量差导致答案不相关 → 使用 RRF 混合检索（向量+关键词），可配置 top_k
- [R] LLM 幻觉编造不存在的内容 → Prompt 明确约束"只基于给定内容回答"
- [R] 问答成本高于搜索 → 按需调用，用户主动触发不是自动
