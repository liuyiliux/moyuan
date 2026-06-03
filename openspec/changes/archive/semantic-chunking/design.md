## Context

墨渊知识库当前将每个文件作为单一内容单元：一个 PDF 提取全文存入 `text_content`，生成一个 4096 维向量存入 `embedding`。对长文档（8万字+）而言，单向量无法精确表达多主题语义，搜索命中后也无法定位到具体段落或视频时间点。

本次改造引入「语义分块」机制，将长内容切分为语义连贯的小块，每块独立存储和向量化。同时支持从搜索结果直接跳转到文档页码或视频播放位置。

**当前状态**：
- `contents` 表已有 `text_content`（全文）、`embedding`（4096维向量）、`embedding_type` 字段
- 处理管道 `process.py` 已有 `_chunk_text` 固定长度分块函数（未启用）
- 嵌入服务 `embedding.py` 支持文本/图像多模态嵌入
- 搜索服务 `search.py` 支持向量+关键词 RRF 混合检索

## Goals / Non-Goals

**Goals:**
- 将长文档切分为语义连贯的小块（2000字左右），每块独立向量化
- 搜索粒度从「整文档」升级为「语义块」，返回最相关块的精确位置
- 支持 PDF 页码定位、视频时间戳跳转
- 不同内容类型使用差异化分块策略（文本按语义、视频按字幕时间戳）
- 语义切片使用独立的轻量嵌入模型（BGE-M3），与入库向量模型（Qwen3-VL-Embedding-8B）分离

**Non-Goals:**
- 不改变现有 `contents` 表结构（chunks 为独立子表）
- 不引入独立向量数据库（仍使用 pgvector）
- 不实现实时增量分块（全量重新处理）

## Decisions

### D1: 分块存储 - 独立 `content_chunks` 子表

**选择**：新建 `content_chunks` 表，通过 `content_id` 关联 `contents`

**表结构**：
```
content_chunks (
    id UUID PK,
    content_id UUID FK,
    chunk_index INT,          -- 块序号
    chunk_type VARCHAR(10),   -- 'text' / 'image'
    chunk_text TEXT,           -- 文本内容
    embedding VECTOR(4096),   -- 入库向量（Qwen3-VL-Embedding-8B）
    
    -- 位置定位信息
    page_number INT,           -- PDF 页码（可选）
    start_offset INT,          -- 在原文中的起始字符偏移
    end_offset INT,            -- 在原文中的结束字符偏移
    time_start FLOAT,          -- 视频/音频起始时间（秒）
    time_end FLOAT,            -- 视频/音频结束时间（秒）
    
    -- 图片相关
    image_path TEXT,           -- 提取的图片文件路径（chunk_type='image' 时）
    
    extra_meta JSONB,          -- 扩展数据
    created_at TIMESTAMP
)
```

**理由**：
- 与 `contents` 一对多关系清晰，不污染主表
- 每块有独立向量，搜索精度高
- 位置信息（页码/偏移/时间戳）支持前端跳转定位
- 图片块可存提取的 PDF 内嵌图片路径

**备选**：在 `extra_meta` JSON 中存分块数组 → 查询效率低，无法直接向量检索

### D2: 语义切片策略 - BGE-M3 边界检测

**选择**：使用 BGE-M3 嵌入模型计算相邻句子相似度，低相似度处为语义断点

**流程**：
1. 按段落/句子初步拆分
2. 调用 BGE-M3 为每个句子生成 1024 维向量
3. 计算相邻句子的余弦相似度
4. 相似度低于阈值（0.5）处为切分点
5. 合并过短的块（<200字），拆分过长的块（>3000字）

**理由**：
- BGE-M3 免费（硅基流动）、支持中文、8192 token 上下文
- 语义切分比固定长度切分更精准，不会切断主题
- 仅用于切片判断，不入库，成本极低

**备选**：
- 固定长度切分（当前 `_chunk_text`）→ 可能切断语义
- NLTK/spacy 句子分割 → 不理解语义，仅按标点切
- LLM 语义切分 → 成本过高

### D3: 不同内容类型的分块策略

| 内容类型 | 分块策略 | 位置信息 |
|---------|---------|---------|
| PDF | 语义切片 + 图片提取 | page_number + start_offset |
| Doc/Office | 语义切片 | start_offset |
| Note | 语义切片 | start_offset |
| Web | 语义切片 | start_offset |
| Image | 单块（不切分） | 无 |
| Audio | 按字幕句子分块 | time_start + time_end |
| Video | 按字幕句子分块 | time_start + time_end |

### D4: 双模型架构 - 切片模型 + 入库模型分离

**选择**：语义切片用 BGE-M3（1024维），入库向量用 Qwen3-VL-Embedding-8B（4096维）

**理由**：
- 切片只需判断「两句话是否相关」，1024维足够
- 入库向量需要高精度语义表达，4096维更优
- 两套模型独立配置，互不影响

**配置方式**：在 `provider_configs.default_models` 中新增 `chunking` 功能绑定：
```json
{
  "summarize": "gpt-4o",
  "embedding": "Qwen3-VL-Embedding-8B",
  "chunking": "BAAI/bge-m3"
}
```

### D5: 搜索粒度升级 - Chunk 级别检索

**选择**：搜索时在 `content_chunks` 表上执行向量检索，返回最相关的 chunk 及其父 content 信息

**理由**：
- 精准定位到段落/时间点，用户体验好
- 返回结果包含 page_number / time_start，前端可直接跳转
- 仍可通过 GROUP BY content_id 聚合为文档级结果

## Risks / Trade-offs

| 风险 | 严重度 | 缓解措施 |
|------|--------|----------|
| 分块数量膨胀（8万字可能产生 40+ 块） | 低 | 单用户场景，pgvector 完全可承受 |
| 语义切片边界判断不准 | 中 | 支持 fallback 到固定长度切分 |
| BGE-M3 API 调用延迟 | 低 | 硅基流动免费且快；可缓存切分结果 |
| 旧数据需要重新分块处理 | 中 | 提供 reindex API，批量重新处理 |

## Migration Plan

1. 新建 `content_chunks` 表
2. 部署新代码（处理管道、搜索服务、API）
3. 执行 reindex API，将现有内容重新分块 + 向量化
4. 前端更新搜索结果展示 + 位置跳转

## Open Questions

1. PDF 图片提取后是否也生成图像嵌入？（建议：是，使用 Qwen3-VL-Embedding-8B）
2. 分块后的 `contents.embedding` 是否保留？（建议：保留，用于文档级聚合搜索）
3. 视频字幕从哪里获取？（需要先有 Whisper 转写流程）
