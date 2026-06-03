## ADDED Requirements

### Requirement: dao-card 灵气卡片
卡片组件 SHALL 使用墨色背景（`--ink: #08080c`）、翠玉色细边框、毛玻璃效果（`backdrop-filter: blur(16px)`），hover 时边框变为翠玉色并显示气晕。

#### Scenario: 卡片悬停效果
- **WHEN** 用户悬停于 `.dao-card`
- **THEN** 边框变为 `--jade`，显示 `box-shadow: 0 0 16px var(--jade-glow)`

### Requirement: dao-btn 道符按钮
按钮组件 SHALL 有三种变体：
- `dao-btn-primary`：翠玉色背景，hover 丹金色气晕
- `dao-btn-secondary`：玄青背景，翠玉边框
- `dao-btn-ghost`：透明背景，翠玉文字

#### Scenario: 主按钮样式
- **WHEN** 用户渲染 `<button class="dao-btn-primary">`
- **THEN** 显示翠玉色背景，hover 时有丹金色光晕

### Requirement: dao-input 符纹输入框
输入框 SHALL 使用玄青色背景（`--void: #0d1117`）、翠玉色 focus 边框及光晕，placeholder 使用暗灰色文字，边框四角有微小八卦装饰。

#### Scenario: 输入框聚焦动效
- **WHEN** 用户聚焦 `.dao-input`
- **THEN** 边框变为 `--jade`，显示灵气光晕，四角八卦装饰变亮

### Requirement: dao-dialog 结界对话框
对话框 SHALL 以道观结界形式呈现：墨色背景、八卦边框装饰、顶部丹金色分隔线、底部按钮区玄青背景。

#### Scenario: 对话框渲染
- **WHEN** 对话框打开
- **THEN** 显示结界样式（八卦边框、丹金分隔线）

### Requirement: dao-badge 符印徽章
徽章 SHALL 显示为道符样式：深色背景、翠玉色文字、圆角 `var(--radius-full)`，可选丹金色边框，用于标签/分类显示。

#### Scenario: 徽章渲染
- **WHEN** 用户渲染 `<span class="dao-badge">符印</span>`
- **THEN** 显示深色背景 + 翠玉色文字的道符样式

### Requirement: 废弃 taste-* 命名空间
所有 `.taste-*` 类名 SHALL 被废弃，不再使用于任何组件或页面。

#### Scenario: 无 taste-* 引用
- **WHEN** 代码审查
- **THEN** 项目中不存在 `.taste-*` 类名引用
