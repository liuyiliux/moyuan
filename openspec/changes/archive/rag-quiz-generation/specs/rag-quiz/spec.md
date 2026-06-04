## ADDED Requirements

### Requirement: RAG 检索出题
系统 SHALL 支持基于 RAG 检索的智能出题，从 content_chunks 表检索知识点切片作为出题素材，而非直接发送 text_content 全文。

#### Scenario: 随机出题模式
- **WHEN** 用户选择"随机出题"模式并指定内容 ID 和题目数量
- **THEN** 系统从该内容的 text chunk 中随机抽取 5-10 个，对每个 chunk 向量检索 2-3 个相似 chunk 作为干扰项素材，将知识点原文和干扰项素材一并发给 AI 出题

#### Scenario: 按主题出题模式
- **WHEN** 用户选择"按主题出题"模式，输入主题关键词（如"人像摄影"）
- **THEN** 系统将主题关键词向量化，在当前内容的 chunk 中检索 Top-10 相关 chunk，对每个命中 chunk 检索 2-3 个相似 chunk 作为干扰项素材，将知识点原文和干扰项素材一并发给 AI 出题

#### Scenario: 内容无文本 chunk
- **WHEN** 用户请求出题但该内容没有 text chunk（如纯图片 PDF）
- **THEN** 系统返回空题目列表和提示"暂无文本分块可供出题，图片 PDF 需要 OCR 支持"

### Requirement: 干扰项来自相似语义切片
系统 SHALL 从向量召回的相似 chunk 中提取干扰项素材，而非让 AI 自由编造。Prompt 中 MUST 明确约束 AI 只能从给定的相似文本中提取干扰项内容。

#### Scenario: 单选题干扰项
- **WHEN** AI 生成单选题
- **THEN** 干扰项 MUST 取自向量召回的相似 chunk 中的同类名词或概念，保证易混淆、有区分度

#### Scenario: 判断题错误选项
- **WHEN** AI 生成判断题
- **THEN** 错误题目的修改细节 MUST 来自相似 chunk 中的易混知识点

### Requirement: 题目可溯源
系统 SHALL 在每道题目中返回 source 信息，包含 chunk_id 和 page_number，用户可追溯题目来源。

#### Scenario: 题目返回溯源信息
- **WHEN** AI 生成题目成功
- **THEN** 每道题目 MUST 包含 sources 字段，含 chunk_id 和 page_number

### Requirement: 题目持久化
系统 SHALL 将生成的题目持久化到 questions 表，刷新页面后题目不丢失。

#### Scenario: 题目落库
- **WHEN** AI 生成题目成功
- **THEN** 系统 MUST 将题目写入 questions 表，关联 content_id 和 source_chunk_id

#### Scenario: 查询历史题目
- **WHEN** 用户打开 AI 面板的出题区域
- **THEN** 系统 SHALL 先查询 questions 表中该内容的已有题目，如有则直接展示，无需重新生成

### Requirement: 四种题型支持
系统 SHALL 支持单选题、多选题、判断题、简答题四种题型，每种题型使用专用 Prompt 模板。

#### Scenario: 生成单选题
- **WHEN** 用户请求生成单选题
- **THEN** 系统 MUST 使用单选题专用 Prompt，干扰项从相似 chunk 提取，只有一个正确答案

#### Scenario: 生成判断题
- **WHEN** 用户请求生成判断题
- **THEN** 系统 MUST 使用判断题专用 Prompt，错误题目修改细节来自相似知识点，对错比例均衡

#### Scenario: 生成简答题
- **WHEN** 用户请求生成简答题
- **THEN** 系统 MUST 使用简答题专用 Prompt，答案严格限定原文内容，禁止课外拓展

### Requirement: 前端出题模式选择
前端 AI 面板 SHALL 提供出题模式选择 UI，支持随机出题和按主题出题两种模式。

#### Scenario: 切换到按主题出题
- **WHEN** 用户在 AI 面板选择"按主题出题"模式
- **THEN** 界面 MUST 显示主题输入框，用户可输入关键词

#### Scenario: 按主题出题请求
- **WHEN** 用户输入主题关键词并点击生成
- **THEN** 前端 MUST 将 mode="topic" 和 topic=用户输入 传给后端接口

#### Scenario: 题目显示溯源信息
- **WHEN** 题目生成成功并展示
- **THEN** 每道题目 MUST 显示来源页码（如有）
