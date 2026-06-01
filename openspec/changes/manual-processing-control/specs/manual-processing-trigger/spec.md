## ADDED Requirements

### Requirement: 手动触发单个内容智能分块
系统 SHALL 允许用户手动触发单个未处理内容的智能分块流程。

#### Scenario: 点击单个内容分块按钮
- **WHEN** 用户在内容列表或详情页点击「智能分块」按钮（内容状态为 pending）
- **THEN** 内容状态变为 chunking，系统异步开始解析和分块处理

#### Scenario: 分块中状态显示
- **WHEN** 内容正在分块中
- **THEN** 用户界面显示处理进度状态（chunking）

#### Scenario: 分块完成状态更新
- **WHEN** 内容分块完成（成功或失败）
- **THEN** 状态自动更新为 chunked 或 failed，失败时显示错误信息

### Requirement: 手动触发单个内容生成嵌入
系统 SHALL 允许用户手动触发已分块内容的向量嵌入生成。

#### Scenario: 点击单个内容嵌入按钮
- **WHEN** 用户在内容列表或详情页点击「生成嵌入」按钮（内容状态为 chunked）
- **THEN** 内容状态变为 embedding，系统异步开始生成向量嵌入

#### Scenario: 嵌入中状态显示
- **WHEN** 内容正在生成嵌入中
- **THEN** 用户界面显示处理进度状态（embedding）

#### Scenario: 嵌入完成状态更新
- **WHEN** 内容嵌入完成（成功或失败）
- **THEN** 状态自动更新为 completed 或 failed，失败时显示错误信息

### Requirement: 批量触发智能分块
系统 SHALL 允许用户同时选择多个内容进行批量智能分块。

#### Scenario: 选择多个内容并批量分块
- **WHEN** 用户在列表页勾选多个内容（状态为 pending）并点击「批量分块」按钮
- **THEN** 所有选中内容的状态变为 chunking，系统异步处理所有选中内容

#### Scenario: 批量分块后状态更新
- **WHEN** 批量分块的内容逐个完成处理
- **THEN** 每个内容的状态独立更新为 chunked，用户无需等待全部完成

### Requirement: 批量触发生成嵌入
系统 SHALL 允许用户同时选择多个已分块内容进行批量生成嵌入。

#### Scenario: 选择多个内容并批量嵌入
- **WHEN** 用户在列表页勾选多个内容（状态为 chunked）并点击「批量嵌入」按钮
- **THEN** 所有选中内容的状态变为 embedding，系统异步处理所有选中内容

#### Scenario: 批量嵌入后状态更新
- **WHEN** 批量嵌入的内容逐个完成处理
- **THEN** 每个内容的状态独立更新为 completed，用户无需等待全部完成

### Requirement: 列表页复选框选择
系统 SHALL 在内容列表页提供复选框，允许用户选择多个内容进行批量操作。

#### Scenario: 勾选单个内容
- **WHEN** 用户点击内容卡片上的复选框
- **THEN** 该内容被标记为选中，顶部出现相应的批量操作按钮

#### Scenario: 取消选择
- **WHEN** 用户再次点击已勾选内容的复选框
- **THEN** 该内容从选中列表中移除

#### Scenario: 全选/取消全选
- **WHEN** 用户点击顶部的「全选」复选框
- **THEN** 当前页所有内容被选中或取消选中
