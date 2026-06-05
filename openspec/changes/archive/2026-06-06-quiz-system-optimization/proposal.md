## Why

当前出题系统虽已具备 RAG 检索出题、模板化 Prompt、答题记录等核心能力，但缺少关键质量控制的几项机制：切块缺乏"是否禁出"和"难度"标记导致低质量内容混入出题池；干扰项检索无相似度阈值可能导致无关内容被引入；无 Token 总量上限可能超出 LLM 上下文窗口；题目入库前无向量查重导致重复题目不断生成；缺少错题专项出题接口无法实现薄弱知识点精准补强。此外，出题范围展开每次全量查库无缓存、Prompt 格式不够规范、向量检索失败时无降级策略等问题也影响系统稳定性和体验。本次优化旨在系统性补齐这些短板，提升出题质量、可控性和健壮性。

## What Changes

- **切块新增字段**：`content_chunks` 表增加 `disable_quiz`（禁出标记）和 `difficulty`（1-5 难度等级）字段，源块选取时统一过滤
- **题目表新增字段**：`questions` 表增加 `embedding`（向量查重）、`source_chunk_ids`（多来源切块）和 `source_content_ids`（多来源知识库）字段
- **干扰项相似度阈值**：`_find_similar_chunks` 增加 `SIM_THRESHOLD=0.75`，仅召回相似度≥75%的切块作为干扰项
- **Token 总量控制**：单次出题源块上限 10、总切块上限 40，防止 LLM 上下文超限，附 Token 预估对照表
- **题目向量查重**：新题目入库前对其文本做向量化，与已有题目比较余弦相似度，>0.9 判定重复舍弃
- **Prompt 规范升级**：`system_prompt` 改为三段固定格式（出题质量规范、素材强制约束、输出格式约束），`user_prompt` 增加 chunk_id/page/content_id 溯源标注
- **出题范围缓存**：分类树和合集绑定列表 Redis 缓存（60min TTL），减少重复查库
- **新增错题专项出题接口**：`POST /api/ai/wrong_quiz`，基于错题文本向量检索相似切块重新出题，实现薄弱知识点精准补强
- **异常降级策略**：向量检索无结果→自动降级同范围随机抽块；LLM 返回 JSON 格式异常→重试 1 次
- **合集启用检查**：`_expand_scope` 对合集类型增加 `coll.enable` 开关判断
- **向量聚合聚类组卷**（未来阶段）：关键词向量聚合出题 + 跨 PDF 聚类综合组卷（KMeans/HDBSCAN + 难度配比 6:3:1）

## Capabilities

### New Capabilities
- `quiz-chunk-filtering`: 切块筛选（disable_quiz + difficulty 等级过滤）
- `quiz-deduplication`: 题目入库前向量查重（余弦相似度 > 0.9 丢弃）
- `quiz-token-control`: Token 总量管控（源块≤10，总切块≤40）
- `quiz-scope-cache`: 出题范围 Redis 缓存（分类树/合集列表 60min TTL）
- `wrong-quiz`: 错题专项出题接口（POST /api/ai/wrong_quiz）
- `quiz-clustering`: 向量聚合聚类组卷（关键词聚合 + KMeans/HDBSCAN 跨 PDF 综合组卷）

### Modified Capabilities
- `rag-quiz`: 出题流程全面升级——源块选取增加 disable_quiz/difficulty 过滤、干扰项增加相似度阈值 0.75、Prompt 格式三段规范化、增加向量搜索失败降级策略、增加 LLM 输出格式异常重试
- `quiz-prompt-editor`: 默认 Prompt 模板升级为三段规范格式（质量规范/素材约束/输出格式）

## Impact

- **数据表变更**：
  - `content_chunks` 新增 `disable_quiz` (boolean) 和 `difficulty` (int) 字段
  - `questions` 新增 `embedding` (vector 4096)、`source_chunk_ids` (bigint[]) 和 `source_content_ids` (bigint[]) 字段
- **后端修改**：
  - `backend/app/models/models.py`：ContentChunk 和 Question 模型新增字段
  - `backend/app/api/ai.py`：_expand_scope（加缓存+合集启用检查）、_random_pick_chunks（加过滤）、_topic_search_chunks（加冗余召回）、_find_similar_chunks（加阈值）、_save_questions（加查重）、新增 /wrong_quiz 接口、新增降级和重试逻辑
  - `backend/app/api/brains.py`：DEFAULT_PROMPT_TEMPLATES["quiz"] 升级为三段规范格式
  - `backend/app/services/embedding.py`：题目文本向量化调用
- **前端修改**（后续）：
  - `frontend/src/components/QuizGenerator.tsx`：支持出题难度筛选选项、新增错题专项出题入口
  - `frontend/src/pages/quiz/index.tsx`：错题 Tab 增加"错题补强"按钮
- **数据库迁移**：需要 Alembic migration 脚本
- **依赖**：Redis 需可用（属于可选依赖，无 Redis 时空走 DB 查询作为降级）
- **无 BREAKING 变更**：所有新增字段均为可选或有默认值，现有 API 响应格式向后兼容
