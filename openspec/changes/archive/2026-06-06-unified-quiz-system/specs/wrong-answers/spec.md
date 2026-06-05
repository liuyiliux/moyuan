## wrong-answers Specification

错题收集与回顾功能。

### ADDED Requirements

#### Requirement: 答题记录存储
后端 SHALL 在用户作答后存储答题记录到 `question_records` 表。

##### Scenario: 答对记录
- **WHEN** 用户作答正确
- **THEN** 写入 question_records 表，`is_correct=true`
- **AND** 记录用户提交的答案和作答时间

##### Scenario: 答错记录
- **WHEN** 用户作答错误
- **THEN** 写入 question_records 表，`is_correct=false`
- **AND** 记录用户提交的错误答案和作答时间
- **AND** 该题目在 GET /api/ai/quiz/wrong 接口中可见

#### Requirement: 错题查询接口
`GET /api/ai/quiz/wrong` SHALL 返回用户答错的题目列表，支持范围过滤和分页。

##### Scenario: 查询所有错题
- **WHEN** 不传 scope_type/scope_id
- **THEN** 返回所有 `is_correct=false` 的答题记录对应的题目

##### Scenario: 按合集范围过滤
- **WHEN** 传入 `scope_type=collection&scope_id=col-123`
- **THEN** 返回该合集下所有内容中答错的题目
- **AND** 只返回最近一次答错的记录（同一题目多次答错不重复展示）

##### Scenario: 分页查询
- **WHEN** 传入 `page=1&page_size=10`
- **THEN** 返回第一页 10 条错题，并附带 total 总数

#### Requirement: 移出错题
`DELETE /api/ai/quiz/wrong/{question_id}` SHALL 清除某道题的错误标记。

##### Scenario: 用户确认掌握
- **WHEN** 用户点击"移出错题本"
- **THEN** 调用 DELETE 接口
- **AND** 该题目从错题列表中消失
- **AND** question_records 中的历史记录保留（不清除，仅标记为已纠正）

##### Scenario: 重复答错同一题
- **WHEN** 用户对一道已移出的题目再次答错
- **THEN** 该题重新出现在错题列表中
