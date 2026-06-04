## Why

当前出题功能只能针对单本书，且出题 Prompt 硬编码在代码中不可编辑。用户需要：1）跨书/跨分类/跨合集出题（按知识领域出题）；2）自定义出题 Prompt 以调整出题风格和难度。

## What Changes

- **新增出题范围选择器**：支持选择整个分类、合集或手动勾选多本书作为出题范围，从范围内所有内容的 chunk 中检索出题
- **新增 Prompt 编辑器**：后端存储 Prompt 模板，前端提供编辑界面，用户可自定义出题指令
- **扩展 RAG 出题接口**：`POST /api/ai/quiz` 支持多 content_id，跨内容向量检索出题所需的知识点和干扰项
- 前端出题面板：出题范围从"当前书"扩展到"可选范围"，增加"范围切换"和"选择范围"UI

## Capabilities

### New Capabilities
- `quiz-scope-selector`: 出题范围选择，支持按分类、合集、手动多选内容作为出题的知识来源范围
- `quiz-prompt-editor`: 出题 Prompt 编辑，后端存储模板，前端提供编辑界面

### Modified Capabilities
- `rag-quiz`: 出题接口从只处理单个 content_id 扩展为支持多个；出题 Prompt 从硬编码改为从可编辑的模板读取

## Impact

- **后端**: `app/api/ai.py` quiz 端点；新增 `prompt_templates` 表及 CRUD API
- **前端**: `pages/contents/detail.tsx` 出题面板；新增 Prompt 编辑组件
- **数据库**: 新建 `prompt_templates` 表（`template_type="quiz"`），可复用于其他 AI 功能的 Prompt 编辑
- **依赖**: 无新增外部依赖
