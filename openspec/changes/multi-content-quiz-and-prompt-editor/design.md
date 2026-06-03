## Context

当前出题功能（`rag-quiz-generation` change）已实现单书 RAG 出题，但存在两个局限：
1. 只能对单本书出题（`content_ids` 数组只取第一个元素）
2. Prompt 硬编码在 `ai.py` 的 `QUIZ_SYSTEM_PROMPT` 常量中，不可编辑

用户需求扩展：按「分类」「合集」作为出题范围，跨多本书的内容 chunk 出题；并能自定义出题 Prompt 指令。

### 当前架构回顾
- 出题入口：`POST /api/ai/quiz`，前端在内容详情页 AI 面板
- 检索：`_get_text_chunks_for_content` → 单内容随机/向量检索 → `_find_similar_chunks` 找干扰项
- Prompt 组装：`_build_quiz_prompt` + 硬编码 `QUIZ_SYSTEM_PROMPT`
- 题目存储：`questions` 表

## Goals / Non-Goals

**Goals:**
- 出题范围从"当前书"扩展到"多本书"：支持按分类 ID、合集 ID、多个 content_id 检索
- Prompt 模板可编辑：存储在数据库，前端提供编辑界面，后端读取模板生成 Prompt
- 保持现有单书出题作为默认行为（向后兼容）

**Non-Goals:**
- 不改变题目数据结构（questions 表不变）
- 不引入新的 AI 模型或 embedding
- 不改变工作区/Brain 的数据隔离规则
- 不做题目批改/评分功能

## Decisions

### 1. 出题范围：支持 content_ids 数组 + scope_type 参数

**方案**：在原 `QuizRequest` 基础上新增 `scope_type`（`"manual"` | `"category"` | `"collection"`）和 `scope_id`，后端负责展开 scope_id 为其下所有 content_id。

**替代方案**：
- 前端展开所有 content_id 再传：前端需要知道分类/合集成员 → 额外 API 调用，且 content_ids 可能很长
- **选择 scope_type + scope_id**：后端直接 JOIN 查询，一次 SQL 展开，减少网络传输

### 2. Prompt 模板存储：通用 prompt_templates 表

**方案**：新建 `prompt_templates` 表，通过 `template_type` 字段区分用途（`"quiz"` / `"summarize"` / `"recommend"` 等），未来其他 AI 功能可复用同一张表。

字段：id, brain_id, template_type, name, description, system_prompt, user_prompt_template（变量按 template_type 不同而不同，quiz 的变量：`{{sources}}`, `{{distractors}}`, `{{question_count}}`, `{{question_types}}`, `{{mode_desc}}`, `{{topic}}`），is_default, created_at, updated_at。

**替代方案**：
- 各功能各自建表（quiz_templates、summary_templates...）：表太多，重复结构
- 存在 `provider_configs` 的 `extra_config` JSON 中：不够结构化，难以版本管理
- **选择通用 prompt_templates + template_type**：一张表管理所有 AI Prompt，扩展性好

### 3. 前端 UI：出题面板 → 标签页模式

**方案**：在 AI 面板出题区域，新增"范围"标签页，默认当前书；用户可切换到"分类"/"合集"/"自定义"范围。Prompt 编辑在单独的设置入口（如 Brain 设置页）。

**替代方案**：
- 出题面板塞所有选项：过于拥挤
- Prompt 编辑器放在出题面板内：每次出题都改 Prompt 很繁琐
- **选择**：出题面板只改范围，Prompt 编辑放在设置页（低频操作）

### 4. 跨内容向量检索：UNION ALL 方式

**方案**：对范围内的所有 content_id，UNION ALL 查询所有 text chunk，统一排序取 Top-K。

SQL 模式：
```sql
SELECT cc.*, 1 - (cc.embedding <=> :query_vec) AS score
FROM content_chunks cc
WHERE cc.content_id IN (:content_ids)
  AND cc.chunk_type = 'text'
  AND cc.chunk_text IS NOT NULL
  AND cc.embedding IS NOT NULL
ORDER BY cc.embedding <=> :query_vec
LIMIT :top_k
```

## Risks / Trade-offs

- **跨内容出题可能选出大量 chunk**：如果一个分类下有 100 本书，text chunk 可能有上万个。需要限制随机/检索的 chunk 数量（上限 source_count + 干扰项 count）
  - Mitigation：随机模式 `random.sample(chunks, source_count)` 自然截断；向量检索 `LIMIT top_k` 截断
- **Prompt 模板包含用户输入变量**：需做 XSS 防护，避免用户输入破坏 Prompt 结构
  - Mitigation：变量用 Jinja2 风格 `{{variable}}` 或 Python `str.replace` 安全替换
- **模板错误导致出题失败**：用户编辑 Prompt 后格式不对，AI 无法理解
  - Mitigation：提供"恢复默认"按钮；后端在调用前做基本校验（变量完整性检查）
