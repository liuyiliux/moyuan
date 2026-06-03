## Context

当前系统有两层向量存储：
- `contents.embedding`：内容表级向量（文本类内容如笔记、网页等使用）
- `content_chunks.embedding`：分块级向量（PDF 图片页、音频片段等使用）

处理管道 `ContentProcessService` 对图片 PDF 的流程是：提取文字 → 提取图片 → 生成图片 chunk → 对图片 chunk 调用 `embed_images` 写入 `content_chunks.embedding`。但当前 `/api/ai/related` 只查 `contents.embedding`，导致图片 PDF 有向量却无法使用相关推荐功能。

详情页 `detail.tsx` 的"嵌入状态"卡片也只看 `contents.embedding`，显示不准确。

题目生成 `/api/ai/quiz` 只接受 `content_ids` 列表，从 `text_content[:2000]` 取文本，对图片 PDF 完全不可用。

## Goals / Non-Goals

**Goals:**
- 相关内容接口支持分块级向量检索，图片 PDF 能正常使用
- 详情页嵌入状态准确反映实际向量情况
- 题目生成支持按范围选择（文档/页码/分块），图片 PDF 可基于图片出题
- 回答用户问题：相关内容不使用平均向量，而是 chunk 检索后按 content_id 聚合取最高分

**Non-Goals:**
- 不做 OCR 预处理（留作后续独立功能）
- 不修改 `contents.embedding` 的写入逻辑
- 不做向量降维或索引优化（当前数据量 <10 万条，全量扫描可接受）
- 不修改 chunk/embed 处理管道本身

## Decisions

### Decision 1：相关内容检索策略 — chunk 检索 + content_id 聚合

**选择**：对当前内容的所有 chunk 向量，分别去 `content_chunks` 表做余弦相似度搜索，然后按目标 `content_id` 取最大相似度作为该内容的得分。

**为什么不使用平均向量**：
- 平均向量会模糊图片页和文字页的语义差异
- 聚合取 max 能保留最强匹配信号，更适合"找到相关内容"的场景
- 实现简单，无需额外计算平均向量

**具体流程**：
1. 查询当前内容的所有 chunk（`content_chunks WHERE content_id = ?`）
2. 如果当前内容有 `contents.embedding`，优先用内容级向量走现有逻辑
3. 否则，取当前内容的 chunk 向量（最多取 5 个，避免查询过大）
4. 对每个 chunk 向量，查 `content_chunks` 表找 Top-20 相似 chunk（排除自身内容）
5. 按目标 `content_id` 聚合：取 `max(similarity)` 作为该内容的综合得分
6. 排序后返回 Top-K 内容，并附带命中的 chunk 信息（页码/图片路径）

### Decision 2：题目生成范围选择

**选择**：扩展 `/api/ai/quiz` 请求体，添加 `scope` 字段。

**范围类型**：
- `document`（默认）：整个文档，现有行为
- `pages`：指定页码范围，从 chunks 表查对应 chunk
- `chunks`：指定 chunk ID 列表

**对图片 PDF**：
- 当 scope 为 `pages` 且 chunk_type 为 `image` 时，将图片 base64 传给多模态大模型
- 使用现有 AI provider 配置（summarize 模型），如果是多模态模型则直接看图出题
- 如果模型不支持图片，返回提示"当前 AI 模型不支持图片出题，请配置多模态模型"

### Decision 3：详情页嵌入状态显示

**选择**：基于 `/api/contents/{id}/status` 返回的 `embedded_chunks` 和 `chunk_count` 显示。

**显示逻辑**：
- 如果 `contents.embedding` 不为空 → 显示"内容向量 ✅"
- 如果 `embedded_chunks > 0` → 显示"分块向量 X/Y"
- 两者都有则都显示
- 都没有才显示"未生成"

## Risks / Trade-offs

- **[chunk 检索性能]** 多个 chunk 向量分别查询会增加数据库压力 → 缓解：限制最多取 5 个 chunk 向量，当前数据量下可接受
- **[图片出题质量]** 依赖多模态模型能力，纯 OCR-free 出题可能质量不稳定 → 缓解：后续可加 OCR 预处理作为补充
- **[API 兼容性]** quiz 接口新增 scope 字段是可选的，不传则走现有默认行为，向后兼容
