## ADDED Requirements

### Requirement: 系统 SHALL 在语义块粒度执行向量检索

系统 SHALL 在 `content_chunks` 表上执行向量相似度搜索，返回与查询最相关的语义块。搜索结果 SHALL 包含块的精确位置信息（页码/偏移/时间戳），支持前端跳转定位。

#### Scenario: 文本搜索返回精确段落
- **WHEN** 用户搜索「光圈与景深的关系」
- **THEN** 系统 SHALL 返回最相关的 chunk，包含 `chunk_text`（相关段落）、`page_number`（所在页码）、`start_offset`（字符偏移）、所属 `content_id` 和 `title`

#### Scenario: 搜索结果按相关度排序
- **WHEN** 用户搜索一个查询
- **THEN** 系统 SHALL 按向量余弦相似度降序返回 chunk 列表，每条结果包含 `score`（0-1 相似度分数）

#### Scenario: 支持 content_type 过滤
- **WHEN** 用户搜索时指定 `content_type="pdf"`
- **THEN** 系统 SHALL 仅返回属于 PDF 类型内容的 chunks

### Requirement: 系统 SHALL 支持以图搜图在 chunk 粒度执行

系统 SHALL 支持上传图片查询，在 `content_chunks` 表中搜索相似的 image chunks。返回结果 SHALL 包含图片的 `image_path` 和 `page_number`（PDF 内嵌图片的页码）。

#### Scenario: 以图搜图返回相似图片块
- **WHEN** 用户上传一张图片进行搜索，search_mode="image"
- **THEN** 系统 SHALL 在 embedding_type='image' 的 chunks 中搜索最相似的块，返回 `image_path`、`page_number`、`content_id`、`title`

#### Scenario: 以图搜文返回相关文本块
- **WHEN** 用户上传一张图片进行搜索，search_mode="all"
- **THEN** 系统 SHALL 在所有 chunks 中搜索，返回图片和文本块混合结果

### Requirement: 系统 SHALL 支持混合检索（向量 + 关键词 RRF 融合）

系统 SHALL 支持在 chunk 粒度执行向量检索和关键词检索，并通过 RRF 融合排序。关键词检索 SHALL 在 `chunk_text` 上执行 ILIKE 模糊匹配。

#### Scenario: 精确关键词命中
- **WHEN** 用户搜索「ISO感光度」
- **THEN** 系统 SHALL 通过关键词检索在 chunk_text 中精确匹配该术语，结合向量语义检索，通过 RRF 融合返回最优结果

#### Scenario: 语义相近但关键词不同
- **WHEN** 用户搜索「相机感光元件灵敏度」
- **THEN** 系统 SHALL 通过向量检索找到语义相关的 chunks（如讨论 ISO 的段落），即使 chunk_text 中不包含查询原文

### Requirement: 搜索结果 SHALL 支持前端位置跳转

搜索 API 响应 SHALL 包含跳转所需的元数据，使前端能够定位到文档的具体页面或视频的播放位置。

#### Scenario: PDF 搜索结果跳转到页码
- **WHEN** 用户点击一条 PDF 搜索结果
- **THEN** 前端 SHALL 跳转到 PDF 预览器的对应 `page_number` 页面，并高亮显示匹配文本

#### Scenario: 视频搜索结果跳转到时间点
- **WHEN** 用户点击一条视频搜索结果
- **THEN** 前端 SHALL 将视频播放器跳转到 `time_start` 时间点开始播放

#### Scenario: 搜索结果展示片段预览
- **WHEN** 搜索返回结果列表
- **THEN** 每条结果 SHALL 展示 chunk_text 的前 200 字作为片段预览，查询关键词 SHALL 高亮显示

### Requirement: 系统 SHALL 支持文档级聚合搜索

系统 SHALL 支持在返回 chunk 级结果的同时，提供按 content_id 聚合的文档级视图。同一文档的多个命中 chunks SHALL 可折叠展示。

#### Scenario: 同一文档多块命中
- **WHEN** 某个 PDF 有 3 个 chunks 命中搜索查询
- **THEN** 搜索结果 SHALL 以文档为单位展示，默认显示最相关的一个 chunk 片段，展开可查看其他命中 chunks

#### Scenario: 返回文档级元信息
- **WHEN** 搜索返回 chunk 结果
- **THEN** 每条结果 SHALL 包含所属文档的 `title`、`content_type`、`file_size`、`created_at` 等元信息
