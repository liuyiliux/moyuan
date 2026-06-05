## ADDED Requirements

### Requirement: RAG 知识库问答
系统 SHALL 支持用户输入自然语言问题，基于向量检索召回相关 chunk，调用 LLM 生成基于知识库内容的答案。

#### Scenario: 提问并获取答案
- **WHEN** 用户提交问题"阴天公园怎么拍照"
- **THEN** 系统向量化问题 → 检索 Top-5 相关 chunk → 组装 Prompt → 调用 LLM → 返回答案及引用来源（内容标题、页码、片段）

#### Scenario: 知识库无相关内容
- **WHEN** 用户提问的内容在知识库中找不到相关 chunk
- **THEN** 系统 SHALL 返回 LLM 生成的明确提示"知识库中暂无相关信息"，而非编造答案

#### Scenario: 限定范围提问
- **WHEN** 用户指定提问范围为某个分类或合集（scope_type + scope_id）
- **THEN** 系统 SHALL 只在范围内进行向量检索，返回基于限定范围的答案

### Requirement: 问答 Prompt 模板可编辑
系统 SHALL 通过 `prompt_templates` 表（`template_type="qa"`）管理问答 Prompt 模板，用户可通过界面编辑 system_prompt 和 user_prompt_template。

#### Scenario: 使用自定义模板
- **WHEN** 当前工作区存在 `template_type="qa"` 的默认模板
- **THEN** 系统 SHALL 读取模板内容，替换 `{{question}}`、`{{context}}` 变量后作为问答 Prompt

#### Scenario: 模板不存在时回退
- **WHEN** 当前工作区没有 `template_type="qa"` 的模板记录
- **THEN** 系统 SHALL 使用内置默认 Prompt

#### Scenario: 模板管理 API
- **WHEN** 用户需要编辑或重置问答模板
- **THEN** 系统 SHALL 提供 `GET/PUT /api/ai/qa-template` 和 `POST /api/ai/qa-template/reset` 端点，与题库模板管理保持一致

### Requirement: 答案可溯源
系统 SHALL 在回答中标注引用的来源内容，用户可追溯答案依据。

#### Scenario: 答案附带来源
- **WHEN** LLM 生成答案成功
- **THEN** 返回结果 MUST 包含 `sources` 数组，每项含 `content_id`、`content_title`、`page_number`（如有）、`chunk_text` 片段

### Requirement: 前端问答入口
前端搜索页面 SHALL 提供问答和搜索双模式切换，用户可选择以自然语言提问获取综合答案。

#### Scenario: 切换到问答模式
- **WHEN** 用户在搜索页面点击"问答"模式
- **THEN** 界面 MUST 切换为问答输入框，提示"输入问题，AI 基于知识库回答"

#### Scenario: 问答结果展示
- **WHEN** AI 生成问答结果
- **THEN** 前端 MUST 展示答案卡片，包含：答案正文、引用来源列表（可点击跳转）、置信度或来源标注

#### Scenario: 内容详情页快捷提问
- **WHEN** 用户在某篇内容的详情页
- **THEN** 系统 SHALL 提供"问本篇"快捷入口，自动将问题限定在该内容范围内检索
