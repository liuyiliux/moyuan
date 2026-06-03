## ADDED Requirements

### Requirement: 分块级向量相关内容检索

当内容没有 `contents.embedding`（内容级向量）时，系统 SHALL 使用该内容的 `content_chunks.embedding`（分块级向量）进行相关内容检索。

系统 SHALL 按以下优先级选择检索策略：
1. 如果内容有 `contents.embedding`，使用内容级向量检索（现有逻辑）
2. 否则，查询该内容的所有 chunk 向量，分别检索 `content_chunks` 表，按目标 `content_id` 取 `max(similarity)` 聚合

检索 chunk 向量时，系统 SHALL 限制最多取 5 个 chunk 向量以控制查询开销。

系统 SHALL 排除当前内容自身的 chunk，只返回其他内容的匹配结果。

#### Scenario: 图片 PDF 有分块向量时返回相关内容
- **WHEN** 请求 `/api/ai/related/{content_id}`，该内容无 `contents.embedding`，但有 `content_chunks.embedding`
- **THEN** 系统使用分块级向量检索，返回按相似度排序的相关内容列表

#### Scenario: 有内容级向量时优先使用
- **WHEN** 请求 `/api/ai/related/{content_id}`，该内容有 `contents.embedding`
- **THEN** 系统使用内容级向量检索，不查询分块表

#### Scenario: 两种向量都没有时返回空
- **WHEN** 请求 `/api/ai/related/{content_id}`，该内容无任何向量
- **THEN** 返回 `{"related": [], "note": "No embedding available"}`

### Requirement: 相关内容返回命中分块信息

当使用分块级向量检索时，返回结果 SHALL 包含命中的分块信息（`chunk_id`、`chunk_index`、`page_number`、`image_path`），以便前端展示"匹配来源"。

#### Scenario: 返回结果包含分块命中信息
- **WHEN** 分块级检索返回一个相关内容
- **THEN** 该结果包含 `matched_chunk` 对象，包含 `chunk_id`、`chunk_index`、`page_number`、`image_path`

### Requirement: 详情页嵌入状态准确显示

详情页 SHALL 基于 `/api/contents/{id}/status` 返回的 `embedded_chunks` 和 `chunk_count` 显示嵌入状态，而非仅看 `contents.embedding`。

显示逻辑：
- 如果 `contents.embedding` 不为空 → 显示"内容向量 ✅"
- 如果 `embedded_chunks > 0` → 显示"分块向量 X/Y"
- 两者都有则都显示
- 都没有才显示"未生成"

#### Scenario: 图片 PDF 有分块向量时显示正确状态
- **WHEN** 内容无 `contents.embedding`，但 `embedded_chunks = 1`、`chunk_count = 1`
- **THEN** 详情页显示"分块向量 1/1"，不显示"未生成"

#### Scenario: 文本内容有内容级向量时显示正确状态
- **WHEN** 内容有 `contents.embedding`，`embedded_chunks = 0`
- **THEN** 详情页显示"内容向量 ✅"

#### Scenario: 两种向量都没有时显示未生成
- **WHEN** 内容无 `contents.embedding`，且 `embedded_chunks = 0`
- **THEN** 详情页显示"未生成"
