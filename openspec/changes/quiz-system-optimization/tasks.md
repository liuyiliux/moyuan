## 1. 数据模型扩展（Alembic 迁移 + 模型定义）

- [x] 1.1 `content_chunks` 表新增 `disable_quiz` 字段（boolean, default=false）
- [x] 1.2 `content_chunks` 表新增 `difficulty` 字段（int 1-5, nullable）
- [x] 1.3 `questions` 表新增 `embedding` 字段（vector 4096, nullable）
- [x] 1.4 `questions` 表新增 `source_chunk_ids` 字段（JSONB, nullable）
- [x] 1.5 `questions` 表新增 `source_content_ids` 字段（JSONB, nullable）
- [x] 1.6 更新 `ContentChunk` 和 `Question` SQLAlchemy 模型定义
- [x] 1.7 生成并应用 Alembic migration 脚本

## 2. 切块筛选机制（quiz-chunk-filtering）

- [x] 2.1 `_get_text_chunks_for_contents` 增加 `disable_quiz=false` 过滤条件
- [x] 2.2 `_get_text_chunks_for_contents` 增加 `difficulty` 范围过滤参数
- [x] 2.3 `_random_pick_chunks` SQL 增加 `disable_quiz=false` 和 difficulty 过滤
- [x] 2.4 `_topic_search_chunks` SQL 增加同等过滤条件
- [x] 2.5 `QuizRequest` schema 增加 `min_difficulty` 和 `max_difficulty` 可选字段
- [x] 2.6 统计可用切块数量逻辑改为 `usable_count = count(满足过滤条件的chunks)`

## 3. 干扰项相似度阈值（quiz-chunk-filtering + rag-quiz delta）

- [x] 3.1 添加常量 `SIM_THRESHOLD = 0.75`（余弦距离 ≤ 0.25）
- [x] 3.2 `_find_similar_chunks` SQL WHERE 增加 `(embedding <=> query_vec) <= 0.25` 条件
- [x] 3.3 `_find_similar_chunks` 增加 `min_similar` 参数并传入

## 4. Token 总量控制（quiz-token-control）

- [x] 4.1 确保 `source_count = min(question_count, 10)` 逻辑无误（当前已有，需确认）
- [x] 4.2 添加总切块数检查：`total_chunks = len(source_chunks) + len(distractor_chunks)`
- [x] 4.3 实现剪裁逻辑：`total_chunks > 40` 时按相似度均匀削减干扰块
- [x] 4.4 出题日志中输出 total_chunks、source_count、distractor_count 和预估 Token

## 5. 题目向量查重（quiz-deduplication）

- [x] 5.1 在 `_save_questions` 入库前增加打标循环
- [x] 5.2 对每题题目文本调用 `embed_texts()` 生成向量
- [x] 5.3 执行向量查重 SQL：在 source_content_ids 范围内查询余弦相似度 > 0.9 的已有题目
- [x] 5.4 重复题目跳过（不写入），记录 info 日志
- [x] 5.5 非重复题目写入 questions 表时附带 embedding、source_chunk_ids、source_content_ids
- [x] 5.6 embedding 调用失败时降级（题目正常入库，embedding 为 NULL）

## 6. Prompt 模板规范化（quiz-prompt-editor delta）

- [x] 6.1 升级 `DEFAULT_PROMPT_TEMPLATES["quiz"]["system_prompt"]` 为三段固定格式
- [x] 6.2 升级 `user_prompt_template` 增加标注格式
- [x] 6.3 Prompt 构建逻辑已更新（_build_quiz_prompt 和 generate_quiz 内联构建）
- [x] 6.4 `_get_or_create_quiz_template` 中自动将 name="默认quiz模板" 的旧模板升级为新格式
- [x] 6.5 同步更新 `QUIZ_SYSTEM_PROMPT` 硬编码回退值为三段格式

## 7. 出题范围缓存 + 合集检查（quiz-scope-cache + rag-quiz delta）

- [x] 7.1 在 `_expand_scope` 中实现 Redis 缓存读取逻辑（分类树 + 合集列表）
- [x] 7.2 缓存 key 格式：`quiz:scope:category:<id>` 和 `quiz:scope:collection:<id>`
- [x] 7.3 缓存 value 为 JSON 数组，TTL 60 分钟
- [x] 7.4 Redis 不可用时降级为数据库直查
- [x] 7.5 合集 `enable=false` 时 `_expand_scope` 返回空 content_id 列表
- [x] 7.6 在分类/合集增删改接口中添加缓存失效逻辑（删除对应 key）

## 8. 错题专项出题接口（wrong-quiz）

- [x] 8.1 新增 `WrongQuizRequest` Pydantic schema
- [x] 8.2 实现 `POST /api/ai/wrong_quiz` 端点
- [x] 8.3 每段错题文本向量化 → 范围检索 → 合并去重 → 生成 source_chunks
- [x] 8.4 复用 `_find_similar_chunks`、模板加载、LLM 调用、`_save_questions` 全链路
- [x] 8.5 向量检索无结果时降级为范围随机抽取
- [x] 8.6 入参校验：wrong_question_texts 为空时返回提示

## 9. 异常降级与重试（rag-quiz delta）

- [x] 9.1 主题向量检索无结果 → 自动降级为 `_random_pick_chunks`
- [x] 9.2 LLM JSON 解析失败 → 重试 1 次（重新调用 LLM）
- [x] 9.3 源块 embedding 为 NULL → 跳过该源块的干扰项检索，继续出题
- [x] 9.4 所有降级事件记录 info/warning 日志，包含降级原因

## 10. 题目多来源追踪（rag-quiz delta）

- [x] 10.1 `_save_questions` 从 AI 返回的 sources 数组中提取所有 chunk_id 和 content_id
- [x] 10.2 将多来源写入 `source_chunk_ids`（JSONB array）和 `source_content_ids`（JSONB array）
- [x] 10.3 向后兼容：单一来源同时写入旧的 `source_chunk_id` 字段
- [x] 10.4 `_question_to_dict` 返回时同时输出新旧字段

## 11. 前端适配

- [x] 11.1 `QuizGenerator` 组件增加难度等级筛选（min/max 下拉框）
- [x] 11.2 `QuizGenerator` 的 API 请求中传入 `min_difficulty` 和 `max_difficulty`
- [x] 11.3 Quiz 页面错题 Tab 增加"错题补强"按钮，调用 `POST /api/ai/wrong_quiz`
- [x] 11.4 题目卡片显示多来源溯源信息（source_chunk_ids 和 page_number）

## 12. 测试与验证

- [ ] 12.1 验证 disable_quiz=true 的切块不出现于出题结果
- [ ] 12.2 验证 difficulty 范围过滤正确
- [ ] 12.3 验证相似度阈值 0.75 生效（干扰项均 ≥ 0.75 相似度）
- [ ] 12.4 验证 Token 控制（总切块 ≤ 40）
- [ ] 12.5 验证题目查重功能（生成相同知识点题目时第二次跳过）
- [ ] 12.6 验证 Redis 缓存命中与失效
- [ ] 12.7 验证错题出题接口端到端流程
- [ ] 12.8 验证降级策略（Redis 宕机、向量检索无结果、LLM JSON 异常）
- [ ] 12.9 验证旧模板自动升级为新三段格式
- [ ] 12.10 验证合集 enable=false 时无法出题
