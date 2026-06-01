## Context

当前系统在 `backend/app/services/file.py` 第 127-129 行，文件上传后会自动调用 `enqueue` 将内容加入处理队列。处理状态通过 `Content.processing_status` 字段管理，包含：`pending`、`processing`、`completed`、`failed`。

前端内容列表页面目前没有批量操作功能，单个内容的处理需要进入详情页才能操作。

## Goals / Non-Goals

**Goals:**
- 上传文件后状态保持为 `pending`，不自动处理
- 提供单个内容手动触发处理的 API
- 提供批量触发处理的 API
- 前端列表页支持复选框选择和批量操作
- 前端卡片显示「处理」按钮（仅未处理状态）

**Non-Goals:**
- 不修改处理队列内部逻辑
- 不添加自动处理的开关配置（本次先改为默认手动处理）
- 不修改数据模型结构

## Decisions

### Decision 1: 上传后不自动入队
**Rationale**: 移除 `file.py` 中的 `enqueue` 调用，保持状态为 `pending`。**
**Alternatives considered**:
- 添加配置开关控制自动/手动处理 → 本次先直接改为手动

### Decision 2: 复用现有处理 API
**Rationale**: 详情页已有 `/api/contents/{id}/process 已存在（之前已实现，直接复用，无需新建。**
**Alternatives considered**:
- 新建独立 API → 没必要

### Decision 3: 批量处理 API 设计
**Rationale**: 批量处理 API 接收 `content_ids` 数组，循环调用 `enqueue`，异步处理，返回接收后立即返回成功。**
**Alternatives considered**:
- 同步等待所有处理完成 → 用户体验差

### Decision 4: 前端批量选择实现
**Rationale**: 使用 React state 管理选中的 ID 数组，顶部显示「批量处理」按钮。**

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| 用户忘记手动处理导致内容无法检索 | 未处理状态在列表中明确显示，提醒用户处理 |
| 批量处理大量内容导致队列阻塞 | 保持队列现有优先级机制，处理队列是异步的 |
