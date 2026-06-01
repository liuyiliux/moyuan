## ADDED Requirements

### Requirement: 手动触发单个内容处理
系统 SHALL 允许用户手动触发单个未处理内容的解析和嵌入流程。

#### Scenario: 点击单个内容处理按钮
- **WHEN** 用户在内容列表或详情页点击「处理」按钮（内容状态为 pending）
- **THEN** 内容状态变为 processing，系统异步开始解析和嵌入处理

#### Scenario: 处理中状态显示
- **WHEN** 内容正在处理中
- **THEN** 用户界面显示处理进度状态（processing）

#### Scenario: 处理完成状态更新
- **WHEN** 内容处理完成（成功或失败）
- **THEN** 状态自动更新为 completed 或 failed，失败时显示错误信息

### Requirement: 批量触发内容处理
系统 SHALL 允许用户同时选择多个内容进行批量处理。

#### Scenario: 选择多个内容并批量处理
- **WHEN** 用户在列表页勾选多个内容（状态为 pending）并点击「批量处理」按钮
- **THEN** 所有选中内容的状态变为 processing，系统异步处理所有选中内容

#### Scenario: 批量处理后状态更新
- **WHEN** 批量处理的内容逐个完成处理
- **THEN** 每个内容的状态独立更新，用户无需等待全部完成

### Requirement: 列表页复选框选择
系统 SHALL 在内容列表页提供复选框，允许用户选择多个内容进行批量操作。

#### Scenario: 勾选单个内容
- **WHEN** 用户点击内容卡片上的复选框
- **THEN** 该内容被标记为选中，顶部出现批量操作按钮

#### Scenario: 取消选择
- **WHEN** 用户再次点击已勾选内容的复选框
- **THEN** 该内容从选中列表中移除

#### Scenario: 全选/取消全选
- **WHEN** 用户点击顶部的「全选」复选框
- **THEN** 当前页所有内容被选中或取消选中
