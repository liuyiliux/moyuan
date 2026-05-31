## ADDED Requirements

### Requirement: 四色主调系统
全局 CSS 变量 SHALL 定义四色主调：墨色（`--ink: #08080c`）、虚空色（`--void: #0d1117`）、翠玉色（`--jade: #10b981`）、丹金色（`--gold: #c9a84c`），并以 `--jade` 为 accent 色。

#### Scenario: 深色模式下色彩正确渲染
- **WHEN** 用户在深色模式下访问任意页面
- **THEN** 背景为 `#08080c`，主调 accent 为 `#10b981`，点缀金色为 `#c9a84c`

### Requirement: 道家字体系统
页面 SHALL 使用 Noto Serif SC 作为中文正文/标题字体，Geist 作为英文正文/UI 字体，Geist Mono 作为代码字体。

#### Scenario: 字体正确加载
- **WHEN** 页面首次加载
- **THEN** 中文显示 Noto Serif SC，英文/UI 显示 Geist，代码显示 Geist Mono

### Requirement: 墨绿网格背景
深色模式下页面背景 SHALL 显示微透明墨绿网格（60px 网格，rgba(16,185,129,0.03)线条），作为电子经络意象。

#### Scenario: 背景网格可见
- **WHEN** 深色模式页面加载
- **THEN** 背景可见淡绿色网格线，opacity 约 0.25

### Requirement: 道家术语导航标签
顶部导航链接 SHALL 使用以下术语：搜索→「问玄」、知识库→「道藏」、笔记→「墨宝」、标签→「符印」、分类→「坤舆」、收藏→「珍藏」、合集→「藏经」。

#### Scenario: 术语标签正确显示
- **WHEN** 导航栏渲染
- **THEN** 各导航项显示对应道家术语而非原功能名

### Requirement: 组件 CSS 类命名
全局样式 SHALL 使用 `.daoist-*` 前缀命名（如 `.daoist-card`、`.daoist-btn-primary`、`.daoist-input`），以区别于原有 `.taste-*` 命名空间。

#### Scenario: 类名不冲突
- **WHEN** 开发者使用 `.daoist-card` 样式
- **THEN** 该样式与原有 `.taste-card` 完全独立，无冲突
