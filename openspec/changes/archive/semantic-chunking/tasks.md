## 1. 数据库与模型

- [x] 1.1 在 `models.py` 中新增 `ContentChunk` 模型（content_id、chunk_index、chunk_type、chunk_text、embedding、page_number、start_offset、end_offset、time_start、time_end、image_path、extra_meta）
- [x] 1.2 创建数据库迁移 SQL（CREATE TABLE content_chunks + 索引）
- [x] 1.3 在 `main.py` 中注册新表（如需自动建表）

## 2. 语义切片服务

- [x] 2.1 新建 `services/chunking.py`，实现 `semantic_split_sentences()` 按句子初步拆分
- [x] 2.2 实现 `compute_sentence_embeddings()` 调用 BGE-M3 为句子生成向量
- [x] 2.3 实现 `find_semantic_boundaries()` 计算相邻句子相似度，返回切分点
- [x] 2.4 实现 `merge_chunks()` 合并过短块（<200字）、拆分过长块（>3000字）
- [x] 2.5 实现 `chunk_text()` 主入口：语义切片 → 合并优化 → 返回 chunks 列表
- [x] 2.6 实现 fallback 逻辑：语义切片失败时使用固定长度切分

## 3. PDF 图片提取

- [x] 3.1 在 `process.py` 中实现 `_extract_pdf_images()`，使用 PyMuPDF 提取 PDF 内嵌图片
- [x] 3.2 图片保存到存储目录，返回 (page_number, image_path) 列表

## 4. 处理管道改造

- [x] 4.1 修改 `process.py` 的 `process()` 方法，处理完成后执行分块
- [x] 4.2 实现 `_chunk_content()` 分发逻辑：根据 content_type 选择分块策略
- [x] 4.3 PDF 处理：文本语义分块 + 图片提取，生成 text chunks 和 image chunks
- [x] 4.4 Doc/Note/Web 处理：文本语义分块
- [x] 4.5 Image 处理：单块（chunk_type='image'，image_path 存路径）
- [x] 4.6 Audio/Video 处理：按字幕时间戳分块（time_start/time_end）
- [x] 4.7 实现 `_save_chunks()` 将分块结果写入 content_chunks 表
- [x] 4.8 实现 `_embed_chunks()` 为每个 chunk 调用入库模型生成 4096 维向量

## 5. 切片模型配置

- [x] 5.1 在 `embedding.py` 中新增 `_get_chunking_binding()` 读取 chunking 模型配置
- [x] 5.2 在 `services/chunking.py` 中支持从 provider-config 读取 BGE-M3 的 API 配置
- [x] 5.3 前端设置页 ProviderModal 中新增 chunking 功能选项

## 6. 搜索服务改造

- [x] 6.1 修改 `search.py` 的 `_vector_search()` 在 content_chunks 表上执行向量检索
- [x] 6.2 修改 `_keyword_search()` 在 chunk_text 上执行关键词检索
- [x] 6.3 修改 `_rrf_merge()` 融合 chunk 级结果
- [x] 6.4 实现文档级聚合：同一 content_id 的多块结果可折叠展示
- [x] 6.5 搜索结果返回 page_number / time_start 等跳转元数据
- [x] 6.6 修改 `embed_query()` 支持 chunk 级搜索的查询向量生成

## 7. 搜索 API 改造

- [x] 7.1 修改搜索 API 响应模型，新增 chunk_id、page_number、time_start、time_end、start_offset、end_offset 字段
- [x] 7.2 新增 `POST /api/search/image` 端点在 chunk 粒度执行以图搜图
- [x] 7.3 新增 `GET /api/contents/{id}/chunks` 端点返回内容的所有 chunks

## 8. 前端改造

- [x] 8.1 搜索结果列表展示 chunk 片段（chunk_text 前 200 字）+ 高亮
- [x] 8.2 PDF 搜索结果点击后跳转到对应 page_number
- [x] 8.3 视频搜索结果点击后跳转到 time_start 播放位置
- [x] 8.4 内容详情页新增「分块预览」Tab，展示所有 chunks 列表
- [x] 8.5 搜索结果支持文档级聚合（同一文档多块折叠展示）

## 9. 重新分块 API

- [x] 9.1 修改 `POST /api/contents/{id}/process` 清除旧 chunks 后重新分块
- [x] 9.2 新增 `POST /api/contents/rechunk-all` 批量重新分块所有内容
- [x] 9.3 修改 `POST /api/embeddings/reindex` 同时清除 chunks 和重新分块
