## ADDED Requirements

### Requirement: 粒子气机背景层
App 根节点 SHALL 渲染 Canvas 粒子系统，粒子以翠玉色小点呈现，缓慢随机漂移，作为全站「气机流散」背景。

#### Scenario: 粒子背景渲染
- **WHEN** App 首次加载
- **THEN** 全屏 Canvas 显示漂浮粒子，pointer-events: none

### Requirement: 滚动渐显揭示动效
页面内容 SHALL 实现滚动渐显：元素进入视口时从 `opacity: 0; transform: translateY(12px)` 过渡到 `opacity: 1; transform: translateY(0)`，duration 350ms ease-out。

#### Scenario: 滚动渐显正确
- **WHEN** 用户滚动页面，新元素进入视口
- **THEN** 元素以 fade-up 动效渐显

### Requirement: 灵气感应 hover 光晕
交互元素 hover SHALL 在 0.3s 内从元素边缘扩散翠玉色/丹金色气晕光圈，使用 `box-shadow` 动画。

#### Scenario: 灵气光晕正确
- **WHEN** 用户悬停于任意可交互组件
- **THEN** 0.3s 后出现气晕光圈，移开时 0.3s 消退

### Requirement: 页面进入渐显动画
每个页面路由切换 SHALL 触发 `taste-page-enter` 动画（`opacity: 0 → 1`, `translateY: 8px → 0`）。

#### Scenario: 页面切换动画
- **WHEN** 用户从 /contents 导航到 /search
- **THEN** 搜索页面以 fade-up 动效进入

### Requirement: 性能降级自适应
粒子系统 SHALL 在检测到设备性能较低时（通过 `navigator.hardwareConcurrency < 4`）自动减少粒子数量至 30%。

#### Scenario: 低配设备降级
- **WHEN** 用户设备 CPU 核心数 < 4
- **THEN** 粒子数量降至约 30 个，避免卡顿

### Requirement: 减少动画模式尊重
系统 SHALL 尊重 `prefers-reduced-motion` 媒体查询，启用时禁用所有粒子和滚动渐显动效。

#### Scenario: 尊重减少动画偏好
- **WHEN** 用户系统设置 prefers-reduced-motion: reduce
- **THEN** 粒子系统关闭，滚动渐显变为即时显示
