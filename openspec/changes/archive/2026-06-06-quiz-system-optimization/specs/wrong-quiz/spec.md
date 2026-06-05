## ADDED Requirements

### Requirement: 错题专项出题接口
系统 SHALL 提供 `POST /api/ai/wrong_quiz` 接口，接受错题文本列表，在指定出题范围内向量检索最相似的切块，基于这些切块重新生成针对性题目。

#### Scenario: 基于错题文本出题
- **WHEN** 用户传入错题文本 `["什么是傅里叶变换？", ...]`、出题数量、出题范围
- **THEN** 系统 SHALL 对每段错题文本做向量化，在范围内检索 top_k 相似切块，合并去重后作为源块，走正常出题流程（干扰项检索→Prompt→LLM→入库）

#### Scenario: 错题文本为空
- **WHEN** 用户传入空的 wrong_question_texts 数组
- **THEN** 系统 SHALL 返回错误提示 "至少需要一条错题文本"

#### Scenario: 范围内无相似切块
- **WHEN** 错题向量在出题范围内检索无结果
- **THEN** 系统 SHALL 降级为随机抽取出题范围内的切块，记录 info 日志

### Requirement: 错题出题复用现有流程
错题出题 SHALL 复用现有的 `_find_similar_chunks`（含 0.75 阈值）、Prompt 模板加载、LLM 调用、题目入库（含向量查重）全链路。

#### Scenario: 干扰项按阈值过滤
- **WHEN** 错题出题调用 `_find_similar_chunks`
- **THEN** 系统 SHALL 应用 SIM_THRESHOLD=0.75，与普通出题一致

#### Scenario: 生成的题目入库并查重
- **WHEN** LLM 返回错题补强题目
- **THEN** 系统 SHALL 执行 `_save_questions`，包含向量查重逻辑

### Requirement: 入参格式
`POST /api/ai/wrong_quiz` SHALL 接受以下参数：`wrong_question_texts` (string[])、`question_count` (int)、`scope_type` (string)、`scope_id` (string)。

#### Scenario: 按分类范围出题
- **WHEN** scope_type="category"，scope_id=<分类ID>
- **THEN** 系统 SHALL 展开该分类及其子分类下所有 content 作为出题范围

#### Scenario: 按合集范围出题
- **WHEN** scope_type="collection"，scope_id=<合集ID>
- **THEN** 系统 SHALL 展开该合集内所有 content 作为出题范围，且需检查合集 `enable` 状态
