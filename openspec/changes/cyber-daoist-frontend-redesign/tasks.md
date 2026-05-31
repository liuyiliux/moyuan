## 1. 全局设计系统基座（彻底重构）

- [ ] 1.1 重写 index.css 全部 CSS 变量，定义四色主调（墨/玄/翠玉/丹金）
- [ ] 1.2 导入 Noto Serif SC + Geist + Geist Mono 字体，抛弃 Inter
- [ ] 1.3 创建全新 `.dao-*` 组件体系（dao-card, dao-btn-primary, dao-btn-secondary, dao-btn-ghost, dao-btn-danger, dao-input, dao-badge, dao-dialog, dao-divider）
- [ ] 1.4 添加墨绿网格背景（60px 网格线，rgba jade 0.03）作为电子经络
- [ ] 1.5 添加 `.dao-glow` / `.dao-ring` 灵气感应光晕样式
- [ ] 1.6 添加 `.dao-nav-glass` 侧边栏样式（玄青背景 + blur）
- [ ] 1.7 添加页面渐显动画（.dao-page-enter）和交错动画（.dao-stagger）
- [ ] 1.8 更新滚动条样式（翠玉色 thumb）
- [ ] 1.9 清理所有 `.taste-*` 类名（废弃旧命名空间）

## 2. 布局架构重构（侧边栏道观经络式布局）

- [ ] 2.1 创建全新 Sidebar 组件（64px/200px 展开收起）
- [ ] 2.2 在侧边栏添加太极八卦 SVG 装饰
- [ ] 2.3 按八卦方位划分三大模块：道藏（乾位）、丹室（坤位）、玄台（中位）
- [ ] 2.4 实现侧边栏 hover 展开/点击收起交互
- [ ] 2.5 重写 App.tsx，采用侧边栏布局（左侧导航 + 右侧内容区）
- [ ] 2.6 添加侧边栏激活项灵气光晕指示
- [ ] 2.7 在 App 根节点注入 Canvas 粒子气机背景层

## 3. 组件体系重构（废弃 taste-*，全新 dao-*）

- [ ] 3.1 创建新 Button.tsx：主按钮翠玉色 + 金晕 hover，ghost 按钮翠玉文字
- [ ] 3.2 创建新 Input.tsx：玄青背景 + jade focus 边框 + 四角八卦装饰
- [ ] 3.3 创建新 Badge.tsx：道符样式（深背景 + 翠玉文字）
- [ ] 3.4 创建新 Dialog.tsx：结界样式（八卦边框 + 丹金分隔线）
- [ ] 3.5 更新 BrainSwitcher.tsx：气机状态指示，活跃状态 jade 脉冲动画
- [ ] 3.6 更新 SearchBar.tsx：符纹输入框样式
- [ ] 3.7 更新 Toast.tsx：墨色背景 + jade/gold 状态色
- [ ] 3.8 更新 ConfirmDialog.tsx：结界样式对话框
- [ ] 3.9 删除所有 `.taste-*` 类名引用

## 4. 页面架构重组（三大模块）

### 道藏模块（知识之道）
- [ ] 4.1 重构 search/index.tsx：问玄页，符纹搜索框 + 八卦装饰
- [ ] 4.2 重构 contents/index.tsx：道藏页，八卦装饰 + 灵气卡片列表
- [ ] 4.3 重构 contents/detail.tsx：道藏详情页，乾坤布局
- [ ] 4.4 重构 notes/index.tsx：墨宝页，笔记编辑器
- [ ] 4.5 重构 tags/index.tsx：符印页，道符标签云
- [ ] 4.6 重构 categories/index.tsx：坤舆页，树形结构玄青样式
- [ ] 4.7 重构 favorites/index.tsx：珍藏页，收藏列表
- [ ] 4.8 重构 collections/index.tsx：藏经页，合集封面

### 丹室模块（修炼之道）
- [ ] 4.9 重构 brains/index.tsx：丹室页，气机状态流散动画
- [ ] 4.10 重构 analytics/index.tsx：卦象页，卦象图表装饰
- [ ] 4.11 重构 backup/index.tsx：封魔页，备份列表

### 玄台模块（调控之道）
- [ ] 4.12 重构 settings/index.tsx：玄台页，设置项分组
- [ ] 4.13 重构 recycle/index.tsx：归墟页，回收站样式

## 5. 动效系统集成

- [ ] 5.1 实现粒子气机 Canvas 系统（100-150 个粒子，翠玉色随机漂移）
- [ ] 5.2 实现性能降级（hardwareConcurrency < 4 时减少至 30 粒子）
- [ ] 5.3 实现 IntersectionObserver 滚动渐显
- [ ] 5.4 添加全局 hover 灵气感应系统
- [ ] 5.5 添加页面路由切换动画
- [ ] 5.6 添加 prefers-reduced-motion 支持

## 6. 术语替换与文案风格化

- [ ] 6.1 替换所有导航链接文案为道家术语（搜索→问玄等）
- [ ] 6.2 替换所有页面标题文案
- [ ] 6.3 替换所有按钮文案
- [ ] 6.4 添加 tooltip 显示原功能名
- [ ] 6.5 页面副标题融入偈语式表达（如「三步入道」「万象归藏」）
