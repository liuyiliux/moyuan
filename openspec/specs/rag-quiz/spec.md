## MODIFIED Requirements

### Requirement: 干扰项来自相似语义切片
系统 SHALL 从向量召回的相似 chunk 中提取干扰项素材，而非让 AI 自由编造。Prompt 中 MUST 明确约束 AI 只能从给定的相似文本中提取干扰项内容。**新增约束：干扰项检索增加相似度阈值 `SIM_THRESHOLD=0.75`（余弦距离 ≤ 0.25），仅召回相似度≥75%的切块。**

#### Scenario: 单选题干扰项
- **WHEN** AI 生成单选题
- **THEN** 干扰项 MUST 取自向量召回的相似 chunk 中的同类名词或概念，且相似度 ≥ 0.75，保证易混淆、有区分度

#### Scenario: 判断题错误选项
- **WHEN** AI 生成判断题
- **THEN** 错误题目的修改细节 MUST 来自相似 chunk 中的易混知识点，且相似度 ≥ 0.75

#### Scenario: 某源块无满足阈值的干扰块
- **WHEN** 某源块的向量检索结果中所有候选干扰块相似度 < 0.75
- **THEN** 系统 SHALL 不为其添加干扰块（允许为空），其他源块的干扰块正常获取

### Requirement: 源块选取（随机模式）
随机出题模式下，源块选取 SHALL 统一应用以下过滤条件：`chunk_type='text'`、`chunk_text IS NOT NULL`、`disable_quiz=false`、`difficulty` 在指定范围内（如有指定）。

#### Scenario: 随机出题应用过滤
- **WHEN** 用户选择"随机出题"模式并指定内容范围和难度
- **THEN** 系统 SHALL 从范围内满足所有过滤条件的 text chunk 中随机抽取 `source_count = min(question_count, 10)` 个

#### Scenario: 有效切块不足时同范围补齐
- **WHEN** 范围内满足过滤条件的切块少于 `source_count`
- **THEN** 系统 SHALL 以实际可用数量为源块数，不补齐（如实告知）

### Requirement: 源块选取（主题模式）
主题出题模式 SHALL 增加冗余召回策略 `top_k = max(source_count * 2, 12)`，前 `source_count` 个最相关切块作为源块，其余作为备选。

#### Scenario: 主题检索冗余召回
- **WHEN** 用户选择"关键词主题出题"模式
- **THEN** 系统 SHALL 向量检索 `top_k = max(source_count * 2, 12)` 个候选，取前 `source_count` 作为源块

#### Scenario: 向量检索无结果降级
- **WHEN** 主题向量检索在范围内返回 0 条结果
- **THEN** 系统 SHALL 自动降级为随机抽取 `source_count` 个源块，并记录 info 日志说明降级原因

### Requirement: 异常降级策略
出题系统 SHALL 在所有向量检索失败时实施自动降级，不中断出题流程。

#### Scenario: 向量检索无结果（降级）
- **WHEN** `_topic_search_chunks` 或 `_find_similar_chunks` 返回 0 条结果
- **THEN** 系统 SHALL 记录 info 日志说明降级原因，主题模式降级为随机抽取，干扰项为空继续出题

#### Scenario: LLM 返回 JSON 解析失败（重试）
- **WHEN** LLM 返回内容无法解析为有效 JSON
- **THEN** 系统 SHALL 重试 1 次（重新调用 LLM），若仍失败则返回错误信息 `{"questions": [], "error": "AI 返回格式异常，已重试失败"}`

#### Scenario: 源块无 embedding（跳过）
- **WHEN** 某源块的 embedding 字段为 NULL
- **THEN** 系统 SHALL 跳过该源块的干扰项检索，按正常流程继续，不中断整轮出题

## ADDED Requirements

### Requirement: 合集启用检查
`_expand_scope` 在 scope_type="collection" 时 SHALL 检查合集的 `enable` 状态（通过 collection 表字段），若 `enable=false` 则返回空的 content_id 列表。

#### Scenario: 合集已禁用
- **WHEN** 出题请求 scope_type="collection"，scope_id 对应合集的 enable=false
- **THEN** 系统 SHALL 返回空 content_ids，最终返回 `{"questions": [], "note": "所选合集已禁用"}`

#### Scenario: 合集已启用
- **WHEN** 出题请求 scope_type="collection"，scope_id 对应合集的 enable=true
- **THEN** 系统 SHALL 正常展开合集内所有 content_id

### Requirement: 题目多来源溯源
`questions` 表 SHALL 支持 `source_chunk_ids`（JSONB array）和 `source_content_ids`（JSONB array）字段，替代单一 `source_chunk_id`，支持一道题关联多个来源切块和多个来源知识库。

#### Scenario: 跨内容出题溯源
- **WHEN** 一道题引用了来自 content_A 的 chunk_X 和 content_B 的 chunk_Y
- **THEN** 系统 SHALL 在 `source_chunk_ids` 中存储 `[chunk_X_id, chunk_Y_id]`，在 `source_content_ids` 中存储 `[content_A_id, content_B_id]`

#### Scenario: 单来源向后兼容
- **WHEN** 题目仅引用单一 chunk 和单一 content
- **THEN** 系统 SHALL 同时在 `source_chunk_id`（旧字段）和 `source_chunk_ids`（新字段）中存储，保证兼容性
