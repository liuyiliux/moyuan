## Why

用户积累了大量摄影/学习资料后，需要基于知识库内容直接提问获取答案，而非仅靠关键词搜索列出相关片段让用户自己阅读。当前系统有语义检索和题库生成能力，但缺少 RAG 对话问答——这是知识库的核心使用场景。

## What Changes

- **新增 RAG 问答接口** `POST /api/ai/ask`：接收用户问题，向量检索相关 chunk，调用 LLM 基于检索内容生成答案，返回答案+引用来源
- **新增问答 Prompt 模板** `template_type="qa"`：沿用现有 `prompt_templates` 表，用户可编辑问答 Prompt
- **前端问答 UI**：搜索页面新增「问答」模式切换；内容详情页新增「问本篇」快捷提问
- **可选扩展**：支持按分类/合集限定检索范围，支持多轮对话上下文

## Capabilities

### New Capabilities
- `rag-qa`: 基于 RAG 检索+LLM 的知识库问答能力，支持自然语言提问、答案溯源、Prompt 模板可编辑

### Modified Capabilities
（无，为新增功能）

## Impact

- **后端**: `app/api/ai.py` 新增 ask 端点；复用现有 `embeddings` 服务做向量检索、`prompt_templates` 表做模板管理
- **数据库**: 无需新增表，新增 `template_type="qa"` 默认模板记录
- **前端**: 搜索页（`pages/search/`）新增问答模式；内容详情页新增快捷提问
- **依赖**: 无新增外部依赖
