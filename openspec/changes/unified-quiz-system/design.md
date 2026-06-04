## Context

当前项目已有完整的 RAG 出题后端能力（`POST /api/ai/quiz`），支持随机（random）和主题（topic）两种模式，题目已持久化到 `questions` 表。但前端出题入口分散，缺乏统一的测验体验（答题交互、错题收集、历史回顾）。

参考《向量知识库——智能出题系统设计文档》的四大出题模式（随机刷题、专项知识点、错题补强、自动组卷），本阶段优先实现：统一出题入口 + 答题交互 + 错题收集（为错题补强打基础）。

## Goals / Non-Goals

**Goals:**
- 提供统一的公共出题组件 `QuizGenerator`，一处实现、多处复用
- 提供独立的 `/quiz` 测验页面，支持范围筛选
- 支持答题交互（逐题作答、即时判断对错）
- 支持错题收集与回顾
- 组件接受灵活的 scope 参数，自动适配不同来源

**Non-Goals:**
- 错题向量补强出题（阶段 4：需修改后端 RAG 流程，从错题向量召回相似 chunk）
- 自动综合组卷（阶段 5：需跨知识点聚类）
- 题目向量化查重（阶段 2：需 pgvector 扩展）
- 难度自适应（阶段 3）

## Decisions

### D1: 统一组件 vs 各自实现

**选择**：统一 `QuizGenerator` 组件，通过 props 区分行为

```tsx
interface QuizGeneratorProps {
  scopeType: "category" | "collection" | "content";
  scopeId: string;
  scopeName: string;
  embedded?: boolean;  // true=内嵌模式（如详情页），false=全功能模式
}
```

**理由**：
- 当前合集/分类/内容三处出题逻辑 80% 相同（调用同一 API），仅 UI 包装不同
- 统一组件保证模式切换（随机/主题）、题型选择、数量选择等交互一致
- `embedded` 参数控制是全屏弹窗还是内嵌面板

**替代方案**：保持三处各自实现但抽取公共 hook → 仍有 UI 重复、维护成本高

### D2: 测验页面架构 — Tab 式布局

**选择**：三个 Tab — 出题、答题、错题

```
┌─────────────────────────────────────────┐
│  [范围: ▾全部道藏]  [分类▾]  [合集▾]    │
├─────────────────────────────────────────┤
│  [ 出题 ]    [ 答题 ]    [ 错题 ]       │
├─────────────────────────────────────────┤
│                                         │
│   出题: QuizGenerator 组件               │
│   答题: AnswerPanel 组件                  │
│   错题: WrongAnswers 组件                 │
│                                         │
└─────────────────────────────────────────┘
```

**理由**：
- 出题→答题→错题 是自然的用户流
- 顶部范围筛选器在三个 Tab 间共享，切换 Tab 时保持筛选条件
- 答题 Tab 从历史题目库中加载（已持久化，不实时生成）
- 错题 Tab 展示用户答错的题目，支持重新出题

### D3: 错题存储 — 新增 QuestionRecord 表

**选择**：新建独立的 `question_records` 表记录答题结果

```sql
question_records:
  id: UUID
  question_id: UUID (FK → questions.id)
  user_answer: text       -- 用户提交的答案
  is_correct: boolean     -- 是否正确
  answered_at: timestamp
```

**理由**：
- `questions` 表存储题目内容（不变量），`question_records` 存储用户的作答记录（变量）
- 一个题目可以被多次作答（如错题重做），需要多条记录
- 通过 `is_correct=false` 筛选即可得到错题列表
- 分离存储符合单一职责原则

**替代方案**：在 questions 表直接加 `is_wrong` 字段 → 无法区分多次作答、无法追溯答题历史

### D4: QuizGenerator 嵌入策略

**选择**：QuizGenerator 在详情页以内嵌面板形式显示，在其他位置（合集卡片菜单、分类树）以弹窗形式显示

```tsx
// 内嵌模式（详情页）
<QuizGenerator scopeType="content" scopeId={contentId} scopeName={name} embedded />

// 弹窗模式（合集/分类）
<QuizGenerator scopeType="collection" scopeId={id} scopeName={name} />
```

两种模式的行为一致（相同的出题逻辑），仅视觉效果不同：
- 弹窗模式：全屏遮罩 + 居中卡片，有关闭按钮
- 内嵌模式：融入页面布局，无遮罩

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                   App.tsx                             │
│  + <Route path="/quiz" element={<QuizPage />} />     │
└──────────────────────┬───────────────────────────────┘
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
   QuizGenerator   collections   categories   contents/detail
   (路由 /quiz)    (弹窗嵌入)     (弹窗嵌入)    (内嵌面板)

         └─────────────────────────────┘
                   共享组件 QuizGenerator
                        │
            ┌───────────┼───────────┐
            ▼           ▼           ▼
        QuizHeader   QuizBody   QuizResults
        (模式/数量)  (题目列表)  (操作按钮)
```

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|---------|
| 答题交互需在前端存储作答状态，页面刷新丢失 | 答题状态仅保存在 React state，设计为短期交互；未来可加 save session 功能 |
| question_records 表缺少 user_id（目前无用户系统） | 先按全局记录，后续加 user 系统时迁移 |
| 大量历史题目时前端渲染性能 | 后端分页返回，前端虚拟列表（如需） |
