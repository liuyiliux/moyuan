## ADDED Requirements

### Requirement: 源块数量限制
单次出题的源块数量 SHALL 硬性上限为 `min(question_count, 10)`，确保上下文精炼可控。

#### Scenario: 出题 5 道
- **WHEN** 用户请求出 5 道题
- **THEN** 系统 SHALL 选取源块数 `source_count = min(5, 10) = 5`

#### Scenario: 出题超过 10 道
- **WHEN** 用户请求出 20 道题
- **THEN** 系统 SHALL 选取源块数 `source_count = min(20, 10) = 10`

### Requirement: 总切块数量硬性限制
单次出题拼装 Prompt 的切块总数（源块 + 干扰块）SHALL 不超过 40 个，防止 LLM 上下文窗口溢出。

#### Scenario: 干扰块过多时按相似度剪裁
- **WHEN** 源块数量 × 每个源块召回 3 个干扰块 导致总切块数超过 40
- **THEN** 系统 SHALL 对每个源块保留相似度最高的前 N 个干扰块，使总切块数 ≤ 40

#### Scenario: 正常范围内不限制
- **WHEN** 10 个源块 × 3 个干扰 = 30 个干扰 + 10 个源 = 40 个总切块
- **THEN** 系统 SHALL 不触发剪裁，全部使用

### Requirement: Token 预估
系统 SHALL 在出题日志中输出切块数对应的预估 Token 上限，供运维监控参考。

#### Scenario: 出题日志记录 Token 预估
- **WHEN** 出题流程完成切块拼装
- **THEN** 系统 SHALL 在日志中记录 `total_chunks`、`source_count`、`distractor_count` 和预估 Token 上限（按 字符数 × 1.5 估算）
