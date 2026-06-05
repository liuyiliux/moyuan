## ADDED Requirements

### Requirement: 题目文本向量化
系统 SHALL 在题目入库前对题目文本（`question` 字段）调用 embedding API 生成 4096 维向量。

#### Scenario: 新题目向量化成功
- **WHEN** LLM 返回题目且解析成功
- **THEN** 系统 MUST 对每题调用 `embed_texts([q.question])` 得到 4096 维向量

#### Scenario: 向量化失败不影响出题
- **WHEN** 嵌入 API 调用失败（超时、配额不足等）
- **THEN** 系统 SHALL 跳过查重，题目正常入库（embedding 字段为 NULL），记录 warning 日志

### Requirement: 向量相似度查重
系统 SHALL 在题目入库前，在 `questions` 表同内容范围内查询是否存在余弦相似度 > 0.9 的已有题目，如存在则丢弃该题目不落库。

#### Scenario: 检测到重复题目
- **WHEN** 新题目的向量与 questions 表中某已有题目的余弦相似度 > 0.9
- **THEN** 系统 SHALL 丢弃该题目，不写入 questions 表，记录 info 日志

#### Scenario: 未检测到重复
- **WHEN** 新题目的向量与所有已有题目的相似度均 ≤ 0.9
- **THEN** 系统 SHALL 正常写入 questions 表，附带 embedding 向量

#### Scenario: 已有题目无向量
- **WHEN** questions 表中已有题目 embedding 为 NULL（旧数据）
- **THEN** 系统 SHALL 跳过这些题目，不与新题目比对

### Requirement: 查重范围
查重搜索范围 SHALL 限定在本次出题涉及的 content_id 列表中（即 `source_content_ids`），不跨库查重。

#### Scenario: 跨内容出题的查重范围
- **WHEN** 出题范围为分类/合集（多个 content_id）
- **THEN** 系统 SHALL 在所有这些 content_id 的已有题目中查重

### Requirement: questions 表 embedding 字段
系统 SHALL 在 `questions` 表新增 `embedding` 字段（Vector 4096, nullable），用于存储题目文本向量。

#### Scenario: 旧数据兼容
- **WHEN** 现有 questions 表中题目无 embedding 值
- **THEN** 系统 SHALL 不为其补充生成向量，正常读取展示
