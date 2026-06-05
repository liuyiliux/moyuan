## 1. 问答 Prompt 模板 & Provider 配置

- [x] 1.1 在 `DEFAULT_PROMPT_TEMPLATES`（`brains.py`）中新增 `"qa"` 默认模板：system_prompt + user_prompt_template（含 `{{question}}`、`{{context}}` 变量）
- [x] 1.2 在 `app/api/ai.py` 中新增 `_get_or_create_qa_template()` 函数，仿照 quiz 模板逻辑
- [x] 1.3 在 provider-config 中新增 `"qa"` 功能绑定选项，`_get_ai_provider(db, "qa")` 可正常查找

## 2. 后端 — RAG 问答 API

- [x] 2.1 新增 `AskRequest` 模型：question(str), top_k(int=5), scope_type(str|None), scope_id(str|None)
- [x] 2.2 实现 `POST /api/ai/ask` 端点：问题向量化 → pgvector 检索 Top-K chunk → 组装 Prompt → 调用 LLM → 返回 `{ answer, sources }`
- [x] 2.3 检索逻辑复用现有 `embed_texts` 服务 + pgvector cosine 查询
- [x] 2.4 支持 `scope_type`/`scope_id` 限定检索范围（复用 `_expand_scope` 逻辑）
- [x] 2.5 答案来源标注：返回的 sources 含 `content_id`、`content_title`、`page_number`、`chunk_text` 片段
- [x] 2.6 无相关 chunk 或 LLM 调用失败时返回友好提示

## 3. 前端 — 搜索页问答模式

- [x] 3.1 搜索页顶部新增模式切换 Toggle：🔍 搜索 | 💬 问答
- [x] 3.2 问答模式：输入框替换为问答样式，placeholder "输入问题，AI 基于知识库回答"
- [x] 3.3 实现 `handleAsk()` 函数：调用 `POST /api/ai/ask`，展示加载状态
- [x] 3.4 新增 AnswerCard 组件：展示 AI 答案 + 引用来源列表（可点击跳转内容详情页）
- [x] 3.5 支持按分类/合集限定问答范围（复用范围选择器）

## 4. 内容详情页快捷提问（可选）

- [x] 4.1 内容详情页 AI 面板新增"问本篇"功能：自动限定 `scope_type="content"` + 当前 content_id
- [x] 4.2 展示问答结果（复用 AnswerCard 组件）
