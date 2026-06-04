## Why

当前出题功能存在三个核心问题：

1. **出题入口分散、体验不一致**：合集页面用 QuizModal 弹窗、分类页面用另一个弹窗、内容详情页（道藏）内置独立出题面板，三处代码各自实现，逻辑重复且 UI 风格不统一
2. **缺少独立测验页面**：没有统一的题库入口，无法浏览所有历史题目、查看错题、按范围筛选题目（分类/道藏/合集）
3. **缺乏答题和错题本功能**：按《向量知识库——智能出题系统设计文档》，系统应支持"随机刷题 → 错题向量补强"闭环，目前只有生成题目，没有答题交互和错题收集

需要构建**统一的出题系统**：一个公共出题组件 + 独立测验页面（答题/错题/历史），所有入口复用同一组件。

## What Changes

### 前端
- **新增公共出题组件 `QuizGenerator`**：接受 `scopeType` / `scopeId` / `scopeName` 参数，统一随机/主题两种出题模式，取代零散的 QuizModal 和详情页内嵌逻辑
- **新增 `/quiz` 测验页面**：包含三个 Tab — 出题（生成新题）、答题（逐题作答）、错题（错题本）+ 范围筛选器（分类/道藏/合集）
- **改造现有入口**：合集详情出题、分类树出题、道藏详情出题的 UI 统一使用 `QuizGenerator` 组件
- **新增错题收集**：答题模式中用户作答后，错误题目自动标记为错题，支持在错题 Tab 中回顾和重新出题补强

### 后端
- **新增错题相关接口**：
  - `POST /api/ai/quiz/wrong`：标记某题答错
  - `GET /api/ai/quiz/wrong`：查询错题列表（支持按 scope_type/scope_id 过滤）
  - `DELETE /api/ai/quiz/wrong/{question_id}`：移除某题的错题标记
- **新增用户答题记录**：`question_records` 表（question_id, user_answer, is_correct, answered_at）
- **扩展历史题目查询**：`GET /api/ai/quiz/history` 支持按 scope_type + scope_id 过滤

### 不改变
- 底层 RAG 出题流程（`generate_quiz`）不变
- Prompt 模板系统不变
- Question 表结构不变（仅增加关联的答题记录表）

## Capabilities

### New Capabilities
- `quiz-page`: 独立的测验页面，统一的出题/答题/错题入口
- `quiz-generator`: 公共出题组件，可嵌入任意页面，支持随机和主题两种模式
- `wrong-answers`: 错题收集与回顾功能，为未来的错题向量补强出题打基础

### Modified Capabilities
- `rag-quiz`: 扩展范围过滤和历史查询能力

## Impact

- **前端新增**：
  - `frontend/src/components/QuizGenerator.tsx`（公共出题组件）
  - `frontend/src/pages/quiz/index.tsx`（测验页面 + 子组件）
  - `frontend/src/lib/copywriting.ts`（新增 quizCopy 文案）
  - `frontend/src/App.tsx`（新增 `/quiz` 路由）
  - `frontend/src/components/Sidebar.tsx`（新增"考校"导航项）
- **前端修改**：
  - `frontend/src/pages/collections/index.tsx`（用 QuizGenerator 替换 QuizModal）
  - `frontend/src/pages/categories/index.tsx`（同上）
  - `frontend/src/pages/contents/detail.tsx`（同上）
- **后端新增**：
  - `backend/app/models/models.py`（新增 QuestionRecord 模型）
  - `backend/app/api/ai.py`（新增错题标记/查询接口）
