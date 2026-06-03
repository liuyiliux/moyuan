## Why

当前出题功能直接将 `text_content[:2000]` 发给 AI，存在三个核心问题：
1. **8万字全书无法全量发送**：Token 消耗大、质量差、考点随机
2. **干扰项由 AI 编造**：不基于知识库原文，质量低、易出错
3. **不支持按主题出题**：用户想针对"人像摄影"出题，无法精准召回相关知识点

需要改为 RAG 检索出题：向量召回知识点切片 → 召回相似切片做干扰项 → AI 基于原文出题，支持按主题/关键词精准出题。

## What Changes

- 修改 `/api/ai/quiz` 接口：从全量文本发送改为 RAG 检索出题
- 新增出题模式：`random`（随机抽取 chunk）/ `topic`（用户输入主题，向量召回相关 chunk）
- 出题素材从 `content_chunks` 表检索，而非 `text_content` 字段
- 干扰项从向量召回的相似 chunk 中提取，而非 AI 编造
- 使用设计文档中的四种 Prompt 模板（单选/填空/判断/简答）
- 题目结果返回 `sources` 信息（chunk_id, page_number），可溯源
- 题目落库到 `questions` 表，持久化存储
- 前端 AI 面板增加出题模式选择（随机/按主题）和主题输入框

## Capabilities

### New Capabilities
- `rag-quiz`: 基于 RAG 检索的智能出题能力，支持随机出题和按主题出题，干扰项来自向量召回的相似知识点，题目可溯源

### Modified Capabilities

## Impact

- **后端**：`app/api/ai.py`（quiz 接口重写）、`app/models/models.py`（新增 Question 表）、`app/api/admin.py` 或新建 `app/api/quiz.py`（题目 CRUD）
- **前端**：`frontend/src/pages/contents/detail.tsx`（AI 面板出题区域改造）
- **数据库**：新增 `questions` 表（题目持久化）
- **依赖**：复用现有 pgvector 向量检索能力，无需新增依赖
