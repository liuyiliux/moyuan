## Why

详情页的 AI 功能（相关内容、摘要、出题）存在三个核心问题：
1. **相关内容对图片 PDF 不可用**：当前只查 `contents.embedding`，但图片 PDF 的向量实际存储在 `content_chunks.embedding`（分块级），导致有向量却显示"暂无相关内容"。
2. **详情页"嵌入状态"显示错误**：只看 `contents.embedding` 是否为空，不看分块级向量，导致图片 PDF 虽然已生成图片向量却显示"未生成"。
3. **题目生成不支持范围选择**：当前只能基于整个文档的 `text_content[:2000]` 生成，图片 PDF 无文本则完全不可用，且不支持按页码/分块选择出题范围。

## What Changes

- 重构 `/api/ai/related` 接口，支持分块级向量检索（优先 `contents.embedding`，回退到 `content_chunks.embedding` 聚合）
- 详情页"嵌入状态"改为基于 `statusInfo.embedded_chunks` 和 `statusInfo.chunk_count` 显示
- 重构 `/api/ai/quiz` 接口，支持按 `scope`（document / page / pages / chunks）选择出题范围
- 详情页 AI 面板添加出题范围选择 UI（当前文档 / 指定页码范围 / 选中分块）
- 图片 PDF 出题支持多模态路线（传图片给大模型生成题目）

## Capabilities

### New Capabilities
- `chunk-level-related`: 分块级向量检索相关内容，支持图片 PDF 和多模态内容
- `scoped-quiz-generation`: 支持按范围（文档/页码/分块）选择出题内容

### Modified Capabilities
- 无（本次不修改现有 spec）

## Impact

- 后端：`app/api/ai.py`（相关推荐 + 题目生成接口）
- 前端：`src/pages/contents/detail.tsx`（嵌入状态显示 + AI 面板 UI）
- 无需新增依赖，复用现有 pgvector 和 embedding 服务
