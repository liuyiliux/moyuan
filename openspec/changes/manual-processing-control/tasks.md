## 1. 后端修改 - 移除自动处理

- [ ] 1.1 修改 `backend/app/services/file.py`，移除第 127-129 行的 `enqueue` 调用
- [ ] 1.2 验证上传后状态保持为 `pending`

## 2. 后端模型 - 扩展处理状态

- [ ] 2.1 在 `backend/app/models/models.py` 扩展 `processing_status` 枚举
- [ ] 2.2 新增状态：`chunking`（分块中）、`chunked`（分块完成）、`embedding`（嵌入中）
- [ ] 2.3 更新状态流转：`pending` → `chunking` → `chunked` → `embedding` → `completed`/`failed`

## 3. 后端服务 - 拆分处理流程

- [ ] 3.1 在 `backend/app/services/process.py` 将 `process()` 拆分为 `chunk()` 和 `embed()`
- [ ] 3.2 `chunk()` 函数：负责解析文件、智能分块，不生成嵌入
- [ ] 3.3 `embed()` 函数：对已分块的内容生成向量嵌入
- [ ] 3.4 保留原有的 `process()` 作为完整流程（向后兼容）

## 4. 后端队列 - 支持分块和嵌入任务

- [ ] 4.1 在 `backend/app/services/task_queue.py` 支持 `task_type` 参数：`chunk` 和 `embed`
- [ ] 4.2 根据 `task_type` 调用相应的处理函数

## 5. 后端 API - 新增分块和嵌入端点

- [ ] 5.1 在 `backend/app/api/file.py` 新增 `POST /api/contents/{id}/chunk` 端点
- [ ] 5.2 在 `backend/app/api/file.py` 新增 `POST /api/contents/{id}/embed` 端点
- [ ] 5.3 在 `backend/app/api/file.py` 新增 `POST /api/contents/batch-chunk` 端点
- [ ] 5.4 在 `backend/app/api/file.py` 新增 `POST /api/contents/batch-embed` 端点

## 6. 前端 API - 新增分块和嵌入调用

- [ ] 6.1 在 `frontend/src/api/content.ts` 新增 `chunkContent` 方法
- [ ] 6.2 在 `frontend/src/api/content.ts` 新增 `embedContent` 方法
- [ ] 6.3 在 `frontend/src/api/content.ts` 新增 `batchChunk` 方法
- [ ] 6.4 在 `frontend/src/api/content.ts` 新增 `batchEmbed` 方法

## 7. 前端列表页 - 复选框选择

- [ ] 7.1 在内容列表页添加选中状态管理（useState 存储选中的 ID 数组）
- [ ] 7.2 在每个内容卡片上添加复选框
- [ ] 7.3 实现全选/取消全选功能
- [ ] 7.4 在顶部添加「批量分块」和「批量嵌入」按钮（根据选中内容的状态显示）

## 8. 前端列表页 - 分块和嵌入按钮

- [ ] 8.1 在内容卡片上添加「智能分块」按钮（仅当状态为 `pending` 时显示）
- [ ] 8.2 在内容卡片上添加「生成嵌入」按钮（仅当状态为 `chunked` 时显示）
- [ ] 8.3 点击按钮后，状态立即更新（`chunking` 或 `embedding`）
- [ ] 8.4 处理中状态显示为加载/禁用状态

## 9. 前端详情页 - 分块和嵌入按钮

- [ ] 9.1 更新详情页，根据状态显示「智能分块」或「生成嵌入」按钮
- [ ] 9.2 确保分块完成后可以预览分块结果
- [ ] 9.3 支持重新分块（如果分块结果不理想）

## 10. 测试验证

- [ ] 10.1 测试单文件上传：验证状态为 pending，不自动处理
- [ ] 10.2 测试单个内容分块：点击分块按钮后状态变为 chunking，完成后变为 chunked
- [ ] 10.3 测试单个内容嵌入：点击嵌入按钮后状态变为 embedding，完成后变为 completed
- [ ] 10.4 测试批量分块：选择多个 pending 内容后点击批量分块
- [ ] 10.5 测试批量嵌入：选择多个 chunked 内容后点击批量嵌入
- [ ] 10.6 测试分块预览：分块完成后可在详情页查看分块结果
- [ ] 10.7 测试重新分块：分块不理想时可重新分块
