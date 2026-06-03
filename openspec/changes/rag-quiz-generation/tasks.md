## 1. 数据模型 — Question 表

- [ ] 1.1 在 `models.py` 中新增 `Question` 模型：id(UUID)、content_id(FK)、q_type(str)、question(text)、options(JSONB)、answer(text)、explanation(text)、source_chunk_id(UUID)、page_number(int)、difficulty(str)、created_at(timestamp)
- [ ] 1.2 创建 Alembic 迁移脚本生成 `questions` 表
- [ ] 1.3 在 `models.py` 中注册 Question 到导出列表

## 2. 后端 — RAG 出题接口重写

- [ ] 2.1 修改 `QuizRequest` 模型：新增 `mode`（random/topic）、`topic`（str|None）、`question_types`（list[str]，默认全部）
- [ ] 2.2 实现随机出题检索逻辑：从 `content_chunks` 随机抽取 5-10 个 text chunk
- [ ] 2.3 实现按主题出题检索逻辑：将 topic 向量化 → 在当前内容 chunk 中向量检索 Top-10
- [ ] 2.4 实现干扰项召回：对每个出题 chunk，向量检索 2-3 个相似 chunk 作为干扰项素材
- [ ] 2.5 编写四种题型 Prompt 模板（单选/多选/判断/简答），约束 AI 只使用给定原文和干扰项素材
- [ ] 2.6 组装出题请求：知识点原文 + 干扰项素材 + Prompt 模板 → 调用 AI
- [ ] 2.7 解析 AI 返回结果，提取 sources 信息（chunk_id, page_number）
- [ ] 2.8 题目落库：将生成的题目写入 `questions` 表
- [ ] 2.9 新增 `GET /api/ai/quiz/{content_id}` 接口：查询该内容已有的历史题目
- [ ] 2.10 无 text chunk 时返回友好提示"暂无文本分块可供出题"

## 3. 前端 — AI 面板出题区域改造

- [ ] 3.1 AI 面板出题区域添加模式切换（随机出题 / 按主题出题）
- [ ] 3.2 按主题出题模式时显示主题输入框
- [ ] 3.3 修改 `handleQuiz` 函数：根据模式构造请求体（mode, topic, question_types）
- [ ] 3.4 页面加载时查询历史题目，如有则直接展示
- [ ] 3.5 题目卡片显示来源页码信息（如有 page_number）
- [ ] 3.6 题目卡片显示题型标签（单选/多选/判断/简答）
