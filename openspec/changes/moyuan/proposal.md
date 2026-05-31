## Why

个人学习者面临多模态资料（摄影教程视频、PDF、截图、网页文章）分散存储、无法跨格式语义检索的痛点；现有笔记工具不支持视频字幕索引、图片 OCR 检索，导致知识积累越多反而越难找到。构建一个本地部署的多模态知识库，以摄影学习场景为切入点，统一管理文本、图片、音视频与网页内容，并提供语义检索与 AI 辅助能力。

## What Changes

- **新增**：多模态内容接入与解析能力（文本/图片 OCR/PDF/音视频转写/网页抓取）
- **新增**：PostgreSQL + pgvector 统一存储业务数据与向量嵌入
- **新增**：语义检索引擎（向量相似度 + 关键词混合检索，结果高亮）
- **新增**：多工作区（Brain）概念，支持创建多个独立知识空间，每个空间独立分类体系与 AI 配置
- **新增**：内容组织体系（多级分类、标签、合集、内容克隆/别名、自定义属性）
- **新增**：在线预览与播放能力（PDF/图片/视频，视频支持字幕时间轴跳转，内容关联图谱可视化）
- **新增**：富文本笔记编辑器（新建、编辑、批注、摘录引用，支持思维导图/表格多视图切换）
- **新增**：AI 辅助功能（摘要生成、关联推荐基于向量+图谱双重策略、题库生成）
- **新增**：知识关联图谱（内容间的引用/系列/相似关系，轻量图结构存储）
- **新增**：数据安全与迁移（手动备份、一键导入导出）
- **新增**：第三方服务扩展（兼容 OpenAI API 格式、腾讯云 OCR/IMA 接入）
- **预留**：MCP Server 接口（外部 AI 工具只读检索）、CLI 命令行工具、AI Agent Skills 系统（kb-search/kb-ingest 等 6 个 skill）
- **新增**：数据统计面板（文件数、标签分布、检索热度）

## Capabilities

### New Capabilities

- `workspace-brain`: 多工作区（Brain）管理，支持创建多个独立知识空间，每个空间有独立的分类、标签、嵌入索引和 AI 配置，数据完全隔离
- `content-ingestion`: 内容录入与多模态解析，采用消费者管道模式（按文件类型走不同处理管道），解析器注册制扩展架构，支持手动新建、文件上传/批量导入、网页链接抓取，涵盖文档提取、图片 OCR、音视频转写与切片
- `storage-vector`: 存储层设计，PostgreSQL + pgvector 统一管理业务数据与多模态向量嵌入，支持 CLIP 图像嵌入 + 文本嵌入双索引，本地文件自定义路径存储
- `semantic-search`: 语义检索引擎，向量相似度 + 关键词混合检索，多索引融合（文本向量/图像向量/OCR 文本向量/元数据），支持分类/标签/时间筛选，结果片段高亮
- `content-organization`: 内容组织管理，多级分类、标签、合集、内容克隆/别名（同一内容多归属），自定义属性字段，星标/收藏、置顶、版本历史
- `content-viewer`: 在线预览与播放，覆盖图片、PDF、文本、视频全类型，视频支持字幕时间轴帧精准跳转，内容关联图谱可视化
- `note-editor`: 富文本笔记编辑器，支持新建/编辑图文笔记、批注划线、内容摘录引用生成新笔记，支持思维导图/表格多视图切换
- `ai-assistant`: AI 辅助功能，包括 AI 摘要、关联内容推荐（向量+图谱双重策略）、基于知识库自动生成题库
- `knowledge-graph`: 知识关联图谱，轻量图结构（PostgreSQL 邻接表），记录内容间引用/系列/相似关系，自动发现关联并提示确认
- `file-management`: 文件管理，重复文件检测、自定义存储路径、全类型在线预览，渐进式 AI 处理（先入库后分析）
- `data-backup`: 数据安全与迁移，手动本地备份、完整知识库一键导入导出
- `provider-config`: 第三方服务配置，兼容 OpenAI 格式自定义 AI 模型 API、腾讯云 OCR/IMA 等服务接入管理
- `analytics-dashboard`: 数据统计面板，展示文件数量、标签分布、检索热度等使用统计

### Future Capabilities（预留，不实现）

- `cli-tool`: 命令行工具（`kb search/ingest/brain/export/config`），与 Web UI 共享 Service 层，支持脚本化操作与 AI 调用
- `ai-skills`: AI Agent Skills 系统，将知识库封装为 6 个 Skill（kb-search/kb-ingest/kb-list/kb-summarize/kb-quiz/kb-stats），让 AI 助手直接检索和操作知识库
- `mcp-server`: MCP Server 协议接口，让外部 AI 工具以只读方式检索知识库内容

### Modified Capabilities

（无，为全新项目）

## Impact

- **技术依赖**：Python 后端（FastAPI/asyncpg/pgvector/Alembic），前端（React/TypeScript），多模态嵌入模型 API，OCR 服务（腾讯云 IMA 或本地方案），语音转写服务（Whisper/云端）
- **基础设施**：本地部署 PostgreSQL 16 + pgvector，本地文件系统存储，可选 Redis 缓存
- **外部服务**：兼容 OpenAI API 的 LLM（摘要/题库），图像/文本嵌入模型 API，OCR/IMA 服务
- **前端**：极简风格 Web UI，深色/浅色主题切换，快捷键与全局搜索支持
