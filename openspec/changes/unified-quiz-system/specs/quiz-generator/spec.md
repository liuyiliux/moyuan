## quiz-generator Specification

公共出题组件 `QuizGenerator`，可嵌入任意页面使用。

### ADDED Requirements

#### Requirement: 组件接口
QuizGenerator SHALL 接受标准的 scope 参数，自动适配不同来源的出题请求。

##### Scenario: 合集出题
- **WHEN** 传入 `scopeType="collection"`、`scopeId="col-123"`、`scopeName="道经合集"`
- **THEN** 生成题目时调用 API 携带 `scope_type: "collection"`、`scope_id: "col-123"`
- **AND** 标题显示"合集「道经合集」出题"

##### Scenario: 分类出题
- **WHEN** 传入 `scopeType="category"`、`scopeId="cat-456"`、`scopeName="修炼心法"`
- **THEN** 生成题目时调用 API 携带 `scope_type: "category"`、`scope_id: "cat-456"`
- **AND** 标题显示"分类「修炼心法」出题"

##### Scenario: 道藏/内容出题
- **WHEN** 传入 `scopeType="content"`、`scopeId="content-789"`、`scopeName="道德经"`
- **THEN** 生成题目时调用 API 携带对应的 content_ids

#### Requirement: 出题模式切换
QuizGenerator SHALL 支持随机出题和主题出题两种模式。

##### Scenario: 默认随机模式
- **WHEN** 组件加载
- **THEN** 出题模式默认选中"随机出题"
- **AND** 不显示主题输入框

##### Scenario: 切换到主题模式
- **WHEN** 用户点击"主题出题"标签
- **THEN** 显示主题输入框（placeholder: "输入出题主题，如：人像摄影、机器学习..."）
- **AND** 生成题目时携带 `mode: "topic"` 和 `topic` 字段

##### Scenario: 主题模式未输入主题
- **WHEN** 用户在主题模式下未输入主题就点击生成
- **THEN** 显示提示"请输入出题主题"
- **AND** 不发起 API 请求

#### Requirement: 题数和题型选择
QuizGenerator SHALL 允许用户选择题数和题型。

##### Scenario: 选择题数
- **WHEN** 用户从下拉菜单中选择题数
- **THEN** 可选项为 3/5/8/10 题
- **AND** 默认选中 5 题

##### Scenario: 默认题型
- **WHEN** 组件加载
- **THEN** 默认选中全部题型：单选、多选、判断、简答

##### Scenario: 取消部分题型
- **WHEN** 用户取消选中"简答"
- **THEN** 生成题目时 `question_types` 不包含 `open`

#### Requirement: 嵌入模式 vs 弹窗模式
QuizGenerator SHALL 通过 `embedded` 参数控制显示形态。

##### Scenario: 弹窗模式（默认）
- **WHEN** 未传 `embedded` 或 `embedded=false`
- **THEN** 组件以全屏遮罩 + 居中卡片形式显示
- **AND** 右上有 X 关闭按钮
- **AND** 点击遮罩可关闭

##### Scenario: 内嵌模式
- **WHEN** 传入 `embedded=true`
- **THEN** 组件以内嵌面板形式显示
- **AND** 无遮罩、无关闭按钮（由父页面控制显示/隐藏）

#### Requirement: 题目渲染
QuizGenerator SHALL 以统一格式渲染生成后的题目。

##### Scenario: 展示单选/多选题
- **WHEN** 题目的 type 为 "single" 或 "multiple"
- **THEN** 显示题干和选项列表（A/B/C/D）
- **AND** 显示答案揭示按钮
- **AND** 如有关联页码信息，显示页码标签

##### Scenario: 展示判断/简答题
- **WHEN** 题目的 type 为 "truefalse" 或 "open"
- **THEN** 显示题面（判断题无选项列表）
- **AND** 显示答案揭示按钮
