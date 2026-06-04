## 1. 数据模型 — prompt_templates 表

- [x] 1.1 在 `models.py` 中新增 `PromptTemplate` 模型：id, brain_id(FK), template_type(str), name, description, system_prompt(Text), user_prompt_template(Text), is_default(bool), created_at, updated_at
- [x] 1.2 创建 Alembic 迁移脚本生成 `prompt_templates` 表
- [x] 1.3 新增 Brain 时自动创建各 template_type 的默认模板记录（quiz、summarize 等）

## 2. 后端 — 跨内容出题范围扩展

- [x] 2.1 修改 `QuizRequest` 模型：新增 `scope_type`（manual/category/collection）、`scope_id`（str|None）
- [x] 2.2 实现 `_expand_scope` 函数：根据 scope_type + scope_id 展开为 content_id 列表（分类需递归子分类）
- [x] 2.3 修改 `_get_text_chunks_for_content` 为 `_get_text_chunks_for_contents`，支持跨内容 UNION ALL 查询
- [x] 2.4 修改 `_random_pick_chunks` 和 `_topic_search_chunks` 支持跨内容检索
- [x] 2.5 修改 `_find_similar_chunks` 支持跨内容检索干扰项
- [x] 2.6 修改 `generate_quiz` 主函数：整合 scope 展开 + 跨内容检索 + 向后兼容单内容模式
- [x] 2.7 跨内容向量检索 SQL：使用 `content_id IN (...)` 替代 `= :content_id`

## 3. 后端 — Prompt 模板管理 API

- [x] 3.1 `GET /api/ai/quiz-template`：返回当前工作区默认模板
- [x] 3.2 `GET /api/ai/quiz-templates`：返回当前工作区所有模板列表
- [x] 3.3 `PUT /api/ai/quiz-template`：更新默认模板（system_prompt + user_prompt_template）
- [x] 3.4 `POST /api/ai/quiz-template/reset`：恢复为系统内置默认模板
- [x] 3.5 实现 `_render_template` 函数：将模板变量（`{{sources}}`, `{{distractors}}`, `{{question_count}}`, `{{question_types}}`, `{{mode_desc}}`, `{{topic}}`）替换为实际数据
- [x] 3.6 修改 `generate_quiz` 使用模板渲染替代硬编码 Prompt（模板不存在时回退到内置默认）

## 4. 前端 — 出题范围选择 UI

- [x] 4.1 AI 面板出题区域新增范围选择器：当前书 / 按分类 / 按合集
- [x] 4.2 按分类模式：加载分类树并选择分类节点
- [x] 4.3 按合集模式：加载合集列表并选择合集
- [x] 4.4 修改 `handleQuiz`：根据范围类型构造请求体（scope_type + scope_id）
- [x] 4.5 范围切换时清空旧题目（联动 quizQuestions）

## 5. 前端 — Prompt 模板编辑器

- [x] 5.1 在工作区设置页或 AI 面板添加入口"编辑出题 Prompt"
- [x] 5.2 创建 Prompt 编辑组件：system_prompt 和 user_prompt_template 两个文本编辑区
- [x] 5.3 显示可用变量列表及说明（`{{sources}}`, `{{distractors}}` 等）
- [x] 5.4 保存按钮调用 `PUT /api/ai/quiz-template`
- [x] 5.5 恢复默认按钮调用 `POST /api/ai/quiz-template/reset`
