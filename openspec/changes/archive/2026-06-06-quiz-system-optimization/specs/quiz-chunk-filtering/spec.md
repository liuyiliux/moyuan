## ADDED Requirements

### Requirement: 切块禁出标记
系统 SHALL 在 `content_chunks` 表支持 `disable_quiz` 布尔字段（默认 false），标记为 true 的切块不参与出题。

#### Scenario: 禁出切块被过滤
- **WHEN** 出题系统选取源块或检索干扰项时
- **THEN** 系统 MUST 排除 `disable_quiz = true` 的切块

#### Scenario: 默认不参与出题
- **WHEN** 新创建的切块未显式设置 `disable_quiz`
- **THEN** 系统 SHALL 默认 `disable_quiz = false`，正常参与出题

### Requirement: 切块难度等级
系统 SHALL 在 `content_chunks` 表支持 `difficulty` 整数字段（1-5，可空），1 为最易，5 为最难。

#### Scenario: 按难度范围过滤
- **WHEN** 用户指定出题难度范围 [min_diff, max_diff]（如 2-4）
- **THEN** 系统 SHALL 仅选取 `difficulty` 在范围内的切块，`difficulty` 为 NULL 的切块不参与难度过滤（视为不限难度）

#### Scenario: 未指定难度范围
- **WHEN** 用户未指定难度范围
- **THEN** 系统 SHALL 不按 difficulty 过滤，所有非禁出切块均可参与

### Requirement: 通用过滤条件
出题系统的所有切块选取（随机模式、主题模式、干扰项检索）SHALL 统一应用以下过滤条件：`chunk_type = 'text'`、`chunk_text IS NOT NULL`、`disable_quiz = false`、`difficulty` 在指定范围内（如有）。

#### Scenario: 随机出题应用过滤
- **WHEN** 随机出题模式选取源块
- **THEN** 系统 MUST 在 SQL 中应用所有通用过滤条件

#### Scenario: 主题出题应用过滤
- **WHEN** 主题检索模式向量搜索切块
- **THEN** 系统 MUST 在向量搜索的 WHERE 子句中应用所有通用过滤条件，`difficulty` 为 NULL 的切块在未指定难度时正常返回
