## ADDED Requirements

### Requirement: Prompt 模板存储
系统 SHALL 在数据库中存储可编辑的通用 Prompt 模板，通过 `template_type` 区分用途（如 `"quiz"`），支持 system prompt 和 user prompt 两部分。

#### Scenario: 模板表结构
- **WHEN** 系统初始化数据库
- **THEN** 系统 MUST 创建 prompt_templates 表，包含字段：id, brain_id, template_type, name, description, system_prompt, user_prompt_template, is_default, created_at, updated_at

#### Scenario: 默认模板
- **WHEN** 创建新工作区（Brain）
- **THEN** 系统 SHALL 自动为该工作区创建各 template_type 的默认 Prompt 模板记录（quiz、summarize 等）

#### Scenario: 多模板支持
- **WHEN** 用户在同一工作区创建自定义模板
- **THEN** 系统 SHALL 允许一个工作区拥有多条模板记录，其中只有一个为默认模板

### Requirement: Prompt 模板变量替换
系统 SHALL 在生成出题 Prompt 时，将模板中的变量替换为实际数据。

#### Scenario: 变量替换
- **WHEN** 系统从模板构建出题 Prompt
- **THEN** 系统 SHALL 替换以下变量：`{{sources}}` → 知识点原文, `{{distractors}}` → 干扰项素材, `{{question_count}}` → 题目数量, `{{question_types}}` → 题型描述, `{{mode_desc}}` → 出题模式描述, `{{topic}}` → 主题关键词

#### Scenario: 变量缺失时填充空值
- **WHEN** 模板中的变量没有对应数据（如 topic 为空）
- **THEN** 系统 SHALL 将该变量替换为空字符串，不报错

### Requirement: Prompt 模板 API
系统 SHALL 提供 Prompt 模板的 CRUD API。

#### Scenario: 获取当前模板
- **WHEN** 前端调用 `GET /api/ai/quiz-template`
- **THEN** 系统 SHALL 返回当前工作区的默认模板内容

#### Scenario: 更新模板
- **WHEN** 前端调用 `PUT /api/ai/quiz-template` 提交新的模板内容
- **THEN** 系统 SHALL 更新当前工作区的默认模板并返回更新后的模板

#### Scenario: 恢复默认模板
- **WHEN** 前端调用 `POST /api/ai/quiz-template/reset`
- **THEN** 系统 SHALL 将当前工作区的模板恢复为系统默认模板

#### Scenario: 列出所有模板
- **WHEN** 前端调用 `GET /api/ai/quiz-templates`
- **THEN** 系统 SHALL 返回当前工作区所有模板列表

### Requirement: 出题接口使用模板
系统 SHALL 在出题时使用数据库中的 Prompt 模板，而非硬编码的 Prompt。

#### Scenario: 使用自定义模板出题
- **WHEN** 用户使用自定义模板出题
- **THEN** 系统 SHALL 读取当前工作区默认模板，替换变量后作为 AI Prompt

#### Scenario: 模板为空时回退
- **WHEN** 工作区没有模板记录
- **THEN** 系统 SHALL 使用系统内置的默认 Prompt（等同于当前硬编码版本）

### Requirement: 前端 Prompt 编辑界面
前端 SHALL 提供 Prompt 模板编辑界面，允许用户自定义 system prompt 和 user prompt template。

#### Scenario: 编辑模板入口
- **WHEN** 用户在工作区设置页面或 AI 面板出题区域
- **THEN** 界面 MUST 提供"编辑出题 Prompt"入口

#### Scenario: 编辑模板
- **WHEN** 用户打开模板编辑器
- **THEN** 界面 MUST 显示 system prompt 和 user prompt template 两个文本编辑区，并提供可用变量提示

#### Scenario: 保存模板
- **WHEN** 用户编辑模板后点击保存
- **THEN** 系统 SHALL 调用 `PUT /api/ai/quiz-template` 保存模板

#### Scenario: 恢复默认
- **WHEN** 用户点击"恢复默认"
- **THEN** 系统 SHALL 调用 `POST /api/ai/quiz-template/reset` 恢复默认模板并刷新编辑区
