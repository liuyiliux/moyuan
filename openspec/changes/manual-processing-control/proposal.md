## Why

当前上传文件后会自动开始内容解析和向量嵌入处理，用户无法控制处理时机。这可能导致：1) 上传大量文件时资源占用过高；2) 用户想先预览文件再决定是否处理；3) 无法批量选择文件处理。需要改为手动触发处理模式。

## What Changes

- 修改文件上传逻辑：上传后不再自动加入处理队列，状态保持为 `pending`
- 新增单个内容处理 API：触发单个内容的解析和嵌入处理
- 新增批量处理 API：支持同时选择多个内容进行处理
- 前端：在内容列表页面添加复选框和「批量处理」按钮
- 前端：在内容卡片上添加「处理」按钮（未处理状态时显示）
- **BREAKING**：上传行为从"自动处理"改为"手动处理"

## Capabilities

### New Capabilities
- `manual-processing-trigger`: 手动触发单个或批量内容的解析和嵌入处理
- `content-batch-actions`: 内容列表的批量选择和操作功能

### Modified Capabilities
- `content-ingestion`: 修改内容上传行为，默认不自动处理，需要手动触发

## Impact

- **Affected Code**:
  - `backend/app/services/file.py`: 移除自动入队逻辑
  - `backend/app/api/file.py`: 新增处理 API
  - `backend/app/services/task_queue.py`: 可能需要调整
  - `frontend/src/pages/contents/`: 列表页面添加批量操作
  - `frontend/src/api/content.ts`: 新增处理 API 调用

- **Affected APIs**:
  - `POST /api/contents/{id}/process`: 单个处理
  - `POST /api/contents/batch-process`: 批量处理
  - `POST /api/files/upload`: 行为变更（不再自动处理）

- **Data Model**:
  - 无需修改，现有 `processing_status` 字段已支持
