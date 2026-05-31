## ADDED Requirements

### Requirement: 系统 SHALL 将长文本内容切分为语义连贯的小块

系统 SHALL 对 `text_content` 超过 2000 字的内容执行语义分块。分块使用嵌入模型（BGE-M3）计算相邻句子的语义相似度，在相似度低于阈值处切分。每块 SHALL 包含独立的文本内容和 4096 维向量。

#### Scenario: PDF 长文档自动分块
- **WHEN** 用户上传一个 8 万字的 PDF 文件，处理管道完成文本提取
- **THEN** 系统 SHALL 将文本切分为 20-50 个语义块，每块 1000-3000 字，存入 `content_chunks` 表，每块包含 `chunk_index`、`chunk_text`、`embedding`、`page_number`、`start_offset`、`end_offset`

#### Scenario: 短文本不分块
- **WHEN** 用户创建一个 500 字的笔记
- **THEN** 系统 SHALL 仅生成 1 个 chunk（chunk_index=0），不执行语义切分

#### Scenario: 语义切片失败时 fallback
- **WHEN** 语义切片 API 调用失败（网络错误或模型不可用）
- **THEN** 系统 SHALL fallback 到固定长度切分（2000字/块，200字 overlap），确保处理不中断

### Requirement: 系统 SHALL 为不同内容类型使用差异化分块策略

系统 SHALL 根据 `content_type` 选择不同的分块策略。文本类内容使用语义切片；音视频类内容按字幕时间戳分块；图片类内容不切分。

#### Scenario: PDF 分块包含页码信息
- **WHEN** 系统处理一个 50 页的 PDF
- **THEN** 每个 text chunk SHALL 包含 `page_number` 字段，标记该块起始所在的页码

#### Scenario: 视频按字幕时间戳分块
- **WHEN** 系统处理一个有字幕的视频文件
- **THEN** 每个 chunk SHALL 包含 `time_start` 和 `time_end` 字段（单位：秒），对应字幕片段的时间范围

#### Scenario: 图片不切分
- **WHEN** 用户上传一张图片
- **THEN** 系统 SHALL 仅生成 1 个 chunk（chunk_type='image'），`image_path` 存储图片文件路径

### Requirement: 系统 SHALL 支持 PDF 内嵌图片提取

系统 SHALL 从 PDF 文件中提取内嵌图片，每个提取的图片 SHALL 作为独立的 image chunk 存储，`chunk_type='image'`，`image_path` 为提取后的文件路径，`page_number` 为所在页码。

#### Scenario: 图文混排 PDF 处理
- **WHEN** 系统处理一个包含 10 张图片的 PDF
- **THEN** 系统 SHALL 提取所有内嵌图片存为独立文件，每张图片生成 1 个 image chunk，包含 `page_number` 和 `image_path`，并使用多模态模型生成 4096 维图像嵌入

### Requirement: 系统 SHALL 使用独立的切片模型配置

系统 SHALL 在 `provider_configs.default_models` 中支持 `chunking` 功能绑定，与 `embedding` 功能独立配置。切片模型用于语义边界检测（生成 1024 维向量），入库模型用于生成最终的 4096 维向量。

#### Scenario: 配置切片模型
- **WHEN** 用户在设置中配置 chunking 模型为 `BAAI/bge-m3`
- **THEN** 语义切片 SHALL 使用该模型判断分块边界，入库向量仍使用 embedding 配置的模型

#### Scenario: 未配置切片模型时 fallback
- **WHEN** 用户未配置 chunking 模型
- **THEN** 系统 SHALL 使用固定长度切分（2000字/块）作为 fallback

### Requirement: 系统 SHALL 支持重新分块处理

系统 SHALL 提供 API 端点，支持对已有内容重新执行分块和向量化。重新分块时 SHALL 先删除旧的 chunks，再生成新的。

#### Scenario: 重新分块单个内容
- **WHEN** 用户对某个内容触发重新处理
- **THEN** 系统 SHALL 删除该内容的所有旧 chunks，重新执行分块和向量化

#### Scenario: 批量重新分块
- **WHEN** 用户触发批量重新处理
- **THEN** 系统 SHALL 清空所有 chunks，逐个内容重新分块和向量化
