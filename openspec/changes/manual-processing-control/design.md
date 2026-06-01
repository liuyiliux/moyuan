## Context

当前系统在 `backend/app/services/file.py` 第 127-129 行，文件上传后会自动调用 `enqueue` 将内容加入处理队列。处理状态通过 `Content.processing_status` 字段管理，包含：`pending`、`processing`、`completed`、`failed`。

当前处理流程是**一步到位**的：智能分块和向量嵌入在同一个任务中完成，用户无法预览分块结果，分块不理想时需要重新处理整个流程。

前端内容列表页面目前没有批量操作功能，单个内容的处理需要进入详情页才能操作。

## Goals / Non-Goals

**Goals:**
- 上传文件后状态保持为 `pending`，不自动处理
- 将处理流程拆分为两个独立步骤：**智能分块**和**生成嵌入**
- 提供单个内容手动触发分块和嵌入的 API
- 提供批量触发分块和嵌入的 API
- 前端列表页支持复选框选择和批量操作
- 前端卡片根据状态显示相应按钮（分块/嵌入）
- 用户可以预览分块结果，确认满意后再生成嵌入

**Non-Goals:**
- 不修改处理队列内部逻辑
- 不添加自动处理的开关配置（本次先改为默认手动处理）
- 不修改数据模型结构（可能需要扩展状态字段）

## Decisions

### Decision 1: 上传后不自动入队
**Rationale**: 移除 `file.py` 中的 `enqueue` 调用，保持状态为 `pending`。
**Alternatives considered**:
- 添加配置开关控制自动/手动处理 → 本次先直接改为手动

### Decision 2: 拆分为两个独立步骤
**Rationale**: 将 `process.py` 中的处理逻辑拆分为 `chunk()` 和 `embed()` 两个独立函数，用户可以先分块预览，满意后再嵌入。
**Alternatives considered**:
- 保持单步处理 → 用户无法预览分块结果

### Decision 3: 新增分块和嵌入 API
**Rationale**: 新增 `/chunk` 和 `/embed` 端点，以及对应的批量端点 `/batch-chunk` 和 `/batch-embed`。
**Alternatives considered**:
- 复用现有 `/process` 端点并添加参数 → 不够清晰

### Decision 4: 扩展处理状态
**Rationale**: 将 `processing_status` 扩展为：`pending` → `chunking` → `chunked` → `embedding` → `completed`/`failed`。
**Alternatives considered**:
- 保持原有状态 → 无法区分分块完成和嵌入完成

### Decision 5: 前端批量选择实现
**Rationale**: 使用 React state 管理选中的 ID 数组，顶部显示「批量分块」和「批量嵌入」按钮（根据选中内容的状态显示相应按钮）。

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| 用户忘记手动处理导致内容无法检索 | 未处理状态在列表中明确显示，提醒用户处理 |
| 批量处理大量内容导致队列阻塞 | 保持队列现有优先级机制，处理队列是异步的 |
| 用户混淆分块和嵌入的区别 | 按钮文案清晰说明，Tooltip 补充解释 |
