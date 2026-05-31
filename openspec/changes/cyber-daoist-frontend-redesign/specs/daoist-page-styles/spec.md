## ADDED Requirements

### Requirement: 三大模块页面架构
页面 SHALL 按三大模块组织：
- 道藏模块：问玄（搜索）、道藏（知识库）、墨宝（笔记）、符印（标签）、坤舆（分类）、珍藏（收藏）、藏经（合集）
- 丹室模块：丹室（工作区）、卦象（统计）、封魔（备份）
- 玄台模块：玄台（设置）、归墟（回收站）

#### Scenario: 模块组织正确
- **WHEN** 用户查看侧边栏导航
- **THEN** 各页面按三大模块分组显示

### Requirement: 道藏页八卦装饰
道藏页面 SHALL 在页面标题区显示八卦 SVG 装饰，配以「道藏·万物归藏」副标题。

#### Scenario: 道藏页装饰
- **WHEN** 用户访问 /contents（道藏）
- **THEN** 页面顶部显示八卦 SVG 装饰

### Requirement: 问玄页符纹搜索框
问玄页面搜索框 SHALL 使用 `.dao-input` 样式，focus 时边框发出翠玉色柔光，placeholder 显示「输入玄机...」。

#### Scenario: 搜索框样式
- **WHEN** 用户访问 /search（问玄）
- **THEN** 搜索框显示符纹样式，placeholder 为「输入玄机...」

### Requirement: 符印页道符标签云
符印页面标签云 SHALL 以道符形式呈现：深色背景、翠玉色边框、hover 时发光，标签名称为道家术语。

#### Scenario: 标签云样式
- **WHEN** 用户访问 /tags（符印）
- **THEN** 标签显示为道符样式

### Requirement: 卦象页卦象图表
卦象页面图表 SHALL 使用翠玉+丹金色系，图表容器有八卦边框装饰。

#### Scenario: 图表样式
- **WHEN** 用户访问 /analytics（卦象）
- **THEN** 图表配色为翠玉/丹金，容器有八卦装饰

### Requirement: 丹室页气机状态指示
丹室页面 SHALL 以「气机」概念展示工作区状态：活跃状态显示翠玉色气机流散动画，非活跃显示暗灰色。

#### Scenario: 状态动画
- **WHEN** 用户访问 /brains（丹室）
- **THEN** 活跃项显示翠玉色脉冲动画

### Requirement: 所有页面道家术语文案
所有页面标题、按钮、标签 SHALL 使用道家术语，hover 时 tooltip 显示原功能名辅助理解。

#### Scenario: 术语文案
- **WHEN** 用户悬停导航链接「道藏」
- **THEN** tooltip 显示「知识库」
