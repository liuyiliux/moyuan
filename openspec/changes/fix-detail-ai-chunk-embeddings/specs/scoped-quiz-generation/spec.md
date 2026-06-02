## ADDED Requirements

### Requirement: 题目生成支持范围选择

`/api/ai/quiz` 接口 SHALL 支持 `scope` 字段来选择出题范围，取值为：
- `document`（默认）：整个文档的 `text_content`
- `pages`：指定页码范围，从 `content_chunks` 表查对应 chunk
- `chunks`：指定 chunk ID 列表

当 `scope` 为 `pages` 时，请求 SHALL 包含 `page_start` 和 `page_end` 字段。

当 `scope` 为 `chunks` 时，请求 SHALL 包含 `chunk_ids` 字段。

`scope` 为可选字段，不传时走现有 `document` 逻辑，保持向后兼容。

#### Scenario: 默认 scope 为 document
- **WHEN** 请求 `/api/ai/quiz` 不传 `scope` 字段
- **THEN** 系统使用 `text_content[:2000]` 生成题目，与现有行为一致

#### Scenario: scope 为 pages 时按页码取内容
- **WHEN** 请求 `/api/ai/quiz`，`scope = "pages"`，`page_start = 1`，`page_end = 3`
- **THEN** 系统从 `content_chunks` 表查询 `page_number` 在 1-3 范围内的 chunk，组合文本后生成题目

#### Scenario: scope 为 chunks 时按 chunk ID 取内容
- **WHEN** 请求 `/api/ai/quiz`，`scope = "chunks"`，`chunk_ids = ["id1", "id2"]`
- **THEN** 系统查询指定 chunk 的文本内容，组合后生成题目

### Requirement: 图片 PDF 按页码出题

当 `scope` 为 `pages` 且命中的 chunk 为图片类型（`chunk_type = "image"`）时，系统 SHALL 将图片路径传给多模态大模型生成题目。

如果当前 AI 模型不支持图片输入，系统 SHALL 返回明确提示，而非静默失败。

#### Scenario: 图片 PDF 按页码出题成功
- **WHEN** 请求 `/api/ai/quiz`，`scope = "pages"`，命中的 chunk 为图片类型，AI 模型支持图片
- **THEN** 系统将图片传给 AI 模型，返回基于图片内容生成的题目

#### Scenario: AI 模型不支持图片时返回提示
- **WHEN** 请求 `/api/ai/quiz`，`scope = "pages"`，命中的 chunk 为图片类型，AI 模型不支持图片
- **THEN** 返回 `{"questions": [], "note": "当前 AI 模型不支持图片出题，请配置多模态模型"}`

### Requirement: 详情页 AI 面板出题范围选择

详情页 AI 面板的"生成题目"按钮 SHALL 提供范围选择 UI：
- 当前文档（默认）
- 指定页码范围（输入起止页码）
- 已选分块（预留，暂不实现分块选择交互）

#### Scenario: 用户选择当前文档出题
- **WHEN** 用户在 AI 面板选择"当前文档"并点击"生成题目"
- **THEN** 系统以 `scope = "document"` 请求出题接口

#### Scenario: 用户选择页码范围出题
- **WHEN** 用户在 AI 面板输入起止页码（如 1-5）并点击"生成题目"
- **THEN** 系统以 `scope = "pages"`、`page_start = 1`、`page_end = 5` 请求出题接口

### Requirement: 题目返回包含来源信息

当使用 `pages` 或 `chunks` scope 出题时，返回的每道题 SHALL 包含 `sources` 字段，标明题目基于哪些分块生成。

#### Scenario: 题目返回附带来源分块信息
- **WHEN** 使用 `scope = "pages"` 生成题目
- **THEN** 每道题包含 `sources` 数组，每个 source 包含 `chunk_id`、`page_number`
