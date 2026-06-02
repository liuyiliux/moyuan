## Why

当前上传文件后会自动开始内容解析和向量嵌入处理，用户无法控制处理时机。这可能导致：1) 上传大量文件时资源占用过高；2) 用户想先预览文件再决定是否处理；3) 无法批量选择文件处理；4) 分块结果不理想时需要重新处理整个流程。需要改为手动触发处理模式，并将智能分块和向量嵌入分离为两个独立步骤。

## What Changes

- 修改文件上传逻辑：上传后不再自动加入处理队列，状态保持为 `pending`
- 将处理流程拆分为两个独立步骤：**智能分块**和**生成嵌入**
- 新增单个内容智能分块 API：触发解析和分块（不生成嵌入）
- 新增单个内容生成嵌入 API：对已分块内容生成向量嵌入
- 新增批量分块 API：支持同时选择多个内容进行分块
- 新增批量嵌入 API：支持同时选择多个内容生成嵌入
- 前端：在内容列表页面添加复选框和「批量分块」「批量嵌入」按钮
- 前端：在内容卡片上添加「分块」「嵌入」按钮（根据状态显示相应按钮）
- **BREAKING**：上传行为从"自动处理"改为"手动处理"

## Capabilities

### New Capabilities
- `manual-processing-trigger`: 手动触发单个或批量内容的分块和嵌入
- `content-batch-actions`: 内容列表的批量选择和操作功能
- `two-step-processing`: 将处理流程拆分为智能分块和生成嵌入两个独立步骤

### Modified Capabilities
- `content-ingestion`: 修改内容上传行为，默认不自动处理，需要手动触发

## Impact

- **Affected Code**:
  - `backend/app/services/file.py`: 移除自动入队逻辑
  - `backend/app/api/file.py`: 新增分块和嵌入 API
  - `backend/app/services/process.py`: 拆分为分块和嵌入两个独立函数
  - `backend/app/services/task_queue.py`: 支持分块和嵌入两种任务类型
  - `frontend/src/pages/contents/`: 列表页面添加批量操作
  - `frontend/src/api/content.ts`: 新增分块和嵌入 API 调用

- **Affected APIs**:
  - `POST /api/contents/{id}/chunk`: 单个智能分块
  - `POST /api/contents/{id}/embed`: 单个生成嵌入
  - `POST /api/contents/batch-chunk`: 批量智能分块
  - `POST /api/contents/batch-embed`: 批量生成嵌入
  - `POST /api/files/upload`: 行为变更（不再自动处理）

- **Data Model**:
  - 无需修改，可能需要扩展 `processing_status` 来区分分块完成和嵌入完成
