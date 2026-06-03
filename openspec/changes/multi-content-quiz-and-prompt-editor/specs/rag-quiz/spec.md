## MODIFIED Requirements

### Requirement: RAG 检索出题
系统 SHALL 支持基于 RAG 检索的智能出题，从 content_chunks 表检索知识点切片作为出题素材，支持单内容和跨内容出题。

#### Scenario: 随机出题模式
- **WHEN** 用户选择"随机出题"模式并指定内容 ID 和题目数量
- **THEN** 系统从该内容的 text chunk 中随机抽取 5-10 个，对每个 chunk 向量检索 2-3 个相似 chunk 作为干扰项素材，将知识点原文和干扰项素材一并发给 AI 出题

#### Scenario: 按主题出题模式
- **WHEN** 用户选择"按主题出题"模式，输入主题关键词（如"人像摄影"）
- **THEN** 系统将主题关键词向量化，在当前内容的 chunk 中检索 Top-10 相关 chunk，对每个命中 chunk 检索 2-3 个相似 chunk 作为干扰项素材，将知识点原文和干扰项素材一并发给 AI 出题

#### Scenario: 内容无文本 chunk
- **WHEN** 用户请求出题但该内容没有 text chunk（如纯图片 PDF）
- **THEN** 系统返回空题目列表和提示"暂无文本分块可供出题，图片 PDF 需要 OCR 支持"

#### Scenario: 跨内容随机出题
- **WHEN** 用户选择跨内容范围（分类/合集/手动多选）并选择"随机出题"模式
- **THEN** 系统从范围内所有内容的 text chunk 中随机抽取 5-10 个，对每个 chunk 在范围内检索 2-3 个相似 chunk 作为干扰项素材，将知识点和干扰项一并发给 AI 出题

#### Scenario: 跨内容按主题出题
- **WHEN** 用户选择跨内容范围并选择"按主题出题"模式
- **THEN** 系统将主题关键词向量化，在范围内所有 chunk 中向量检索 Top-10 相关 chunk，对每个命中 chunk 检索 2-3 个相似 chunk 作为干扰项素材，将知识点和干扰项一并发给 AI 出题

### Requirement: 出题范围选择
出题接口 SHALL 支持 `scope_type` 参数（`"manual"` | `"category"` | `"collection"`）和对应的 `scope_id`，后端负责展开 scope 为其下所有 content_id。

#### Scenario: 按分类出题
- **WHEN** 请求参数 scope_type="category"，scope_id=<分类ID>
- **THEN** 系统 SHALL 查询该分类及其子分类下所有 content_id，纳入出题范围

#### Scenario: 按合集出题
- **WHEN** 请求参数 scope_type="collection"，scope_id=<合集ID>
- **THEN** 系统 SHALL 查询该合集内所有 content_id，纳入出题范围

#### Scenario: 手动指定多内容出题
- **WHEN** 请求参数 scope_type="manual"，content_ids 包含多个 ID
- **THEN** 系统 SHALL 将 content_ids 中所有 ID 纳入出题范围

#### Scenario: 向后兼容
- **WHEN** 请求参数不包含 scope_type（或 scope_type="manual" 且 content_ids 只有一个）
- **THEN** 系统 SHALL 按原有单内容出题逻辑处理，行为不变

### Requirement: Prompt 模板化
出题系统 SHALL 支持从 prompt_templates 表中（`template_type="quiz"`）读取可编辑的 Prompt 模板，替代硬编码的 QUIZ_SYSTEM_PROMPT 和 Prompt 拼装逻辑。

#### Scenario: 使用自定义模板
- **WHEN** 当前工作区存在自定义 Prompt 模板
- **THEN** 系统 SHALL 读取模板内容，替换变量后作为出题 Prompt

#### Scenario: 模板不存在时回退
- **WHEN** 当前工作区没有 Prompt 模板记录
- **THEN** 系统 SHALL 使用系统内置的默认 Prompt（行为不变）

#### Scenario: 模板变量替换
- **WHEN** 系统使用模板构建 Prompt
- **THEN** 系统 SHALL 将模板中的 `{{sources}}`, `{{distractors}}`, `{{question_count}}`, `{{question_types}}`, `{{mode_desc}}`, `{{topic}}` 变量替换为实际数据
