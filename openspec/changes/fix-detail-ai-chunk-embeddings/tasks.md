## 1. 详情页嵌入状态修复

- [ ] 1.1 修改 `detail.tsx` 嵌入状态卡片：用 `statusInfo.embedded_chunks` 和 `statusInfo.chunk_count` 替代 `item.embedding` 判断
- [ ] 1.2 显示逻辑：内容向量有则显示"内容向量 ✅"，分块向量有则显示"分块向量 X/Y"，都没有才显示"未生成"

## 2. 相关内容分块级向量检索

- [ ] 2.1 修改 `ai.py` 的 `/api/ai/related` 接口：当 `contents.embedding` 为空时，回退到 chunk 级向量检索
- [ ] 2.2 实现 chunk 向量检索逻辑：查询当前内容的 chunk（最多 5 个），对每个 chunk 向量查 `content_chunks` 表找 Top-20 相似 chunk
- [ ] 2.3 实现 content_id 聚合：按目标 content_id 取 `max(similarity)` 作为综合得分
- [ ] 2.4 返回结果附带 `matched_chunk` 信息（chunk_id、chunk_index、page_number、image_path）
- [ ] 2.5 排除当前内容自身的 chunk

## 3. 题目生成范围选择 — 后端

- [ ] 3.1 扩展 `QuizRequest` 模型：添加可选字段 `scope`（document/pages/chunks）、`page_start`、`page_end`、`chunk_ids`
- [ ] 3.2 修改 quiz 逻辑：当 `scope = "pages"` 时，从 `content_chunks` 表查 `page_number` 在范围内的 chunk，组合文本
- [ ] 3.3 修改 quiz 逻辑：当 `scope = "chunks"` 时，查询指定 chunk ID 的文本内容
- [ ] 3.4 图片 chunk 出题：当 chunk_type 为 image 时，将图片路径传给多模态模型；模型不支持时返回明确提示
- [ ] 3.5 返回的题目附带 `sources` 字段（chunk_id、page_number）

## 4. 题目生成范围选择 — 前端

- [ ] 4.1 AI 面板添加出题范围选择 UI：下拉选择"当前文档 / 指定页码范围"
- [ ] 4.2 当选择"指定页码范围"时，显示起止页码输入框
- [ ] 4.3 修改 `handleQuiz` 函数：根据选择的 scope 构造请求体
- [ ] 4.4 题目结果显示 sources 信息（如有）
