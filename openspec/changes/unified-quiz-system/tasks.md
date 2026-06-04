## 1. 后端 — 答题记录模型与接口

- [x] 1.1 在 `models.py` 中新增 `QuestionRecord` 模型：id(UUID)、question_id(FK→questions)、user_answer(text)、is_correct(boolean)、answered_at(timestamp)
- [x] 1.2 创建 Alembic 迁移脚本生成 `question_records` 表
- [x] 1.3 新增 `POST /api/ai/quiz/record` 接口：记录用户答题结果（question_id, user_answer, is_correct）
- [x] 1.4 新增 `GET /api/ai/quiz/wrong` 接口：查询错题列表，支持 scope_type + scope_id 过滤，分页返回
- [x] 1.5 新增 `DELETE /api/ai/quiz/wrong/{question_id}` 接口：移除错题标记（用户确认学会了）
- [x] 1.6 扩展 `GET /api/ai/quiz/history` 接口：支持 scope_type + scope_id 过滤，分页返回

## 2. 前端 — QuizGenerator 公共出题组件

- [x] 2.1 创建 `components/QuizGenerator.tsx`：统一的出题组件
- [x] 2.2 实现 props 接口：scopeType、scopeId、scopeName、embedded（控制弹窗/内嵌模式）
- [x] 2.3 实现模式切换 UI：随机出题 / 主题出题（主题模式时显示主题输入框）
- [x] 2.4 实现题数选择器（3/5/8/10 题）
- [x] 2.5 实现题型选择器（单选/多选/判断/简答，可多选）
- [x] 2.6 实现生成按钮 + 加载状态 + 题目结果渲染（题型标签、题干、选项、答案揭示）
- [x] 2.7 复用现有 API 路径 `POST /api/ai/quiz`
- [x] 2.8 弹窗模式：全屏遮罩 + 居中卡片 + 关闭按钮
- [x] 2.9 内嵌模式：inline 布局，无遮罩

## 3. 前端 — 新增测验页面 (/quiz)

- [x] 3.1 创建 `pages/quiz/index.tsx`：测验页面主框架
- [x] 3.2 实现三个 Tab 切换：出题、答题、错题
- [x] 3.3 实现顶部范围筛选器：分类下拉、合集下拉（可选"全部"）
- [x] 3.4 出题 Tab：嵌入 `QuizGenerator` 组件
- [x] 3.5 答题 Tab：从历史题目加载，逐题作答，即时判断对错，记录到 question_records
- [x] 3.6 错题 Tab：从 `GET /api/ai/quiz/wrong` 加载，展示错题列表 + 答案与解析

## 4. 前端 — 改造现有出题入口

- [x] 4.1 合集页面（collections/index.tsx）：用 `QuizGenerator` 替换 `QuizModal`，保持弹窗模式
- [x] 4.2 分类页面（categories/index.tsx）：用 `QuizGenerator` 替换 `QuizModal`，保持弹窗模式
- [x] 4.3 内容详情页（contents/detail.tsx）：用 `QuizGenerator` 替换内嵌出题面板，使用 `embedded` 模式

## 5. 前端 — 路由与导航

- [x] 5.1 在 `App.tsx` 新增 `/quiz` 路由，指向 QuizPage
- [x] 5.2 在 `Sidebar.tsx` 新增"考校"导航项（用 GraduationCap 图标），放在"道藏"模块下
- [x] 5.3 在 `lib/copywriting.ts` 新增 quiz/quizTip 文案（道/常/萌三主题）

## 6. 前端 — 清理旧代码

- [x] 6.1 删除不再使用的 `QuizModal.tsx` 组件（确认合集/分类/详情均已迁移后）
