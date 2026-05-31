## Context

本项目为全新本地部署的多模态个人知识库系统，以摄影学习场景为优先切入点。系统需要统一管理文本、图片、PDF/Office 文档、音视频及网页内容，并提供语义检索与 AI 辅助能力。

**当前状态**：全新项目，无历史代码包袱。

**核心约束**：
- 本地部署优先，核心数据离线可用
- 模型与第三方服务通过 API 调用（不捆绑特定供应商）
- 存储方案：PostgreSQL 16 + pgvector（统一业务数据与向量）
- 技术栈与 YLCraft 保持一致（Python + asyncpg + FastAPI + React/TypeScript）

## Goals / Non-Goals

**Goals:**
- 统一接入多种内容模态（文本、图片、PDF、音视频、网页）
- 通过向量嵌入实现跨模态语义检索
- 提供友好的内容组织与在线预览体验
- 支持可配置的第三方 AI 服务（OpenAI 兼容格式）
- AI 辅助增强（摘要/推荐/题库）

**Non-Goals:**
- 多用户/团队协作（单用户个人知识库）
- 移动端原生 App
- 定时自动备份（仅手动备份）
- 数据库/文件加密存储
- 公开 API 实现（仅预留接口设计）

## Decisions

### D1: 后端技术栈 - Python + FastAPI + asyncpg

**选择**：Python + FastAPI（异步）+ asyncpg（直连 PostgreSQL）+ Alembic（迁移）

**理由**：
- 与 YLCraft 项目技术栈完全一致，复用现有开发经验与基础设施
- Python 生态在 AI/ML 集成（Whisper、OpenAI SDK、OCR 库）方面成熟度最高
- asyncpg 原生异步，配合 pgvector 查询性能优异

**备选**：Node.js（Drizzle ORM）→ 排除，AI 库生态弱于 Python

---

### D2: 向量存储 - PostgreSQL + pgvector（单一数据库）

**选择**：不引入独立向量数据库（如 Pinecone、Weaviate），使用 pgvector 扩展 PostgreSQL

**理由**：
- 本地部署场景下，减少运维复杂度（一个数据库服务搞定所有）
- 业务数据与向量数据 JOIN 查询零网络开销
- pgvector 对百万级个人知识库场景性能完全足够

**代价**：向量查询水平扩展能力弱于专用向量数据库 → 对个人使用场景无影响

---

### D3: 检索策略 - 混合检索（向量 + 关键词 RRF 融合）

**选择**：向量语义检索（pgvector cosine similarity）+ PostgreSQL 全文检索（tsvector）通过 Reciprocal Rank Fusion（RRF）合并排名

**理由**：
- 纯语义检索对精确名词（人名、型号、专有词汇）召回率低
- 纯关键词检索无法理解语义相近表达
- RRF 无需调权重参数，实现简单且效果稳健

---

### D4: 嵌入模型 - 通过 API 调用，不本地运行模型

**选择**：多模态嵌入通过外部 API（如通义千问、OpenAI、jina-embeddings），不在本地运行嵌入模型

**理由**：
- 本地运行嵌入模型（如 CLIP）需要 GPU，个人设备限制大
- API 调用方式可随时切换供应商，灵活性更高
- 通过 `provider-config` 能力统一管理 API 配置

**代价**：嵌入时依赖网络 → 通过本地缓存向量（一次嵌入永久存储）缓解

---

### D5: 音视频转写 - 优先 Whisper API，支持本地 Whisper

**选择**：默认使用 OpenAI Whisper API；支持配置本地 faster-whisper 作为替代

**理由**：
- 云端 Whisper 速度快、无需本地 GPU
- 本地 faster-whisper 满足离线需求，作为可选配置

---

### D6: 前端架构 - React + TypeScript + Vite，单页应用

**选择**：React 18 + TypeScript + Vite，UI 组件库使用 shadcn/ui（与 YLCraft 保持一致）

**理由**：
- 技术栈与 YLCraft 保持一致，降低上下文切换成本
- shadcn/ui 极简风格与需求书「极简清爽」定位匹配
- Vite 构建速度快，开发体验好

---

### D7: 文件存储 - 本地文件系统，路径可配置

**选择**：原始文件存储在本地文件系统（路径用户可配置），数据库仅存储元数据与向量

**理由**：
- 个人本地部署场景，文件系统存储最简单可靠
- 避免将大文件塞入数据库（性能与备份复杂度）
- 文件路径记录在 PostgreSQL，支持相对路径方便迁移

---

### D8: 内容处理 - 异步任务队列

**选择**：使用内置异步任务处理（Python asyncio + 后台任务），暂不引入 Celery/RQ

**理由**：
- 个人使用并发量低，无需重型消息队列
- 减少部署依赖（无需 Redis 作为 broker，但可选用 Redis 做缓存）
- 上传后异步处理（OCR/转写/嵌入），前端通过轮询或 WebSocket 获取进度

## Risks / Trade-offs

| 风险 | 严重度 | 缓解措施 |
|------|--------|----------|
| 嵌入 API 调用失败导致内容无法检索 | 中 | 内容先存储，嵌入失败标记状态，支持重试 |
| 视频转写耗时长（大文件） | 中 | 前端展示处理进度，分片上传与流式转写 |
| pgvector 向量维度与嵌入模型不匹配 | 低 | Alembic 迁移时记录模型维度，切换模型时提示重新嵌入 |
| 本地文件路径移动导致预览失效 | 中 | 数据库存储相对路径，导出/迁移时做路径重映射 |
| OCR 精度不足（手写/复杂版式） | 低 | 支持用户手动编辑 OCR 结果 |
| Whisper 转写长视频 API 费用较高 | 低 | 支持切换本地 faster-whisper，按需选择 |

## Migration Plan

**全新项目，无迁移需求。**

首次部署步骤：
1. 初始化 PostgreSQL 数据库，安装 pgvector 扩展
2. 运行 Alembic 迁移建表
3. 配置 `.env`（数据库连接、存储路径、API keys）
4. 启动后端服务（uvicorn）
5. 构建并部署前端静态资源
6. 通过 UI 配置第三方服务（嵌入模型、OCR、Whisper）

## 业界参考项目分析与借鉴

### 参考项目概览

| 项目 | 定位 | Star | 核心借鉴点 |
|------|------|------|------------|
| **Paperless-ngx** | 文档归档与 OCR 检索 | 20k+ | 自动化分类流水线、消费者模式、渐进式 AI 学习 |
| **Immich** | 自托管照片/视频管理 | 102k | CLIP 多模态搜索、独立 ML 服务、多索引融合 |
| **Quivr** | RAG 知识库框架 | 32k | 模块解耦架构、Brain 多知识空间、解析器注册制 |
| **Supermemory** | AI 记忆引擎 | - | 图结构记忆、MCP 协议集成、多渠道采集 |
| **Trilium Notes** | 层级笔记知识库 | 27k | 树形组织+克隆、关系图谱、脚本扩展体系 |

### 借鉴优化点

#### 1. Paperless-ngx → 自动化分类流水线 ⭐

**Paperless 的做法**：上传文件 → 消费者管道自动处理（类型检测 → OCR → 分类 → 索引）→ 用户确认/修正

**对设计的优化**：
- 新增 **消费者管道** 概念：上传文件后不是简单异步处理，而是按文件类型走不同的处理管道（文档管道/图片管道/视频管道/网页管道）
- 借鉴 **自动分类学习** 思路：系统根据用户历史分类行为，用朴素贝叶斯或 LLM 自动建议分类和标签，降低手动组织负担
- 借鉴 **文档类型 + 通讯方 + 标签** 三维分类：对知识库内容增加「来源」维度（如 B站教程 / 微信公众号 / 个人笔记 / PDF教材），结合分类和标签形成三维组织

#### 2. Immich → CLIP 多模态语义搜索 ⭐⭐⭐

**Immich 的做法**：图像通过 CLIP 模型编码为统一向量空间，支持「用文字搜图片」「用图片搜相似图片」

**对设计的优化**：
- **图像嵌入方案明确化**：使用 CLIP 模型（OpenAI CLIP API 或 HuggingFace CLIP）进行图像编码，而非通用多模态嵌入。CLIP 在「图文对齐」场景明显优于通用模型
- **多索引融合搜索**：同一内容同时建立多套索引——文本向量、图像向量、OCR 文本向量、元数据索引。检索时根据查询类型选择合适的索引组合
- **独立 ML 推理服务**：将 AI 推理（嵌入/OCR/转写/分类）拆为独立服务，与主 API 服务解耦，方便后续替换模型和分配计算资源
- **渐进式 AI 处理**：借鉴 Immich 的「先入库再分析」模式——文件上传后立即可见，AI 处理（OCR/转写/嵌入/分类）异步进行，用户不等待

#### 3. Quivr → 模块解耦 + Brain 多知识空间 ⭐⭐

**Quivr 的做法**：Embedding / 检索 / 生成三大模块完全解耦；每个 Brain 对应独立向量空间和 Prompt 配置

**对设计的优化**：
- **Brain/工作区概念**：支持创建多个知识空间（如「摄影学习」「工作文档」「个人笔记」），每个空间有独立的分类体系、嵌入索引和 AI 配置。空间之间可切换，数据完全隔离
- **解析器注册制**：文件解析器采用 `register_parser()` 注册机制，新增文件类型只需实现接口并注册，不修改核心代码
- **动态 Chunk 策略**：不同内容类型使用不同的分块策略——文本按段落、代码按函数、视频按字幕句子，通过配置文件切换而非硬编码

#### 4. Supermemory → 图结构记忆 + MCP 协议 ⭐⭐

**Supermemory 的做法**：知识存储不只是向量，还包括实体之间的关系图谱；通过 MCP 协议让其他 AI 工具直接访问记忆

**对设计的优化**：
- **知识关联图谱**：除分类/标签外，增加内容间的「关联边」——引用关系、先后顺序关系（如教程第1集→第2集）、相似关系（AI 自动发现并提示用户确认）。存储为轻量图结构（邻接表即可，不需 Neo4j）
- **关联推荐增强**：关联推荐不仅基于向量相似度，还结合图谱中的关系边（如「同一教程系列」「被同一标签标记」），提升推荐质量
- **MCP 协议预留**：设计阶段预留 MCP Server 接口，让未来的 AI 对话工具（Claude/ChatGPT）能直接检索知识库内容。这是 Supermemory 最有前瞻性的设计

#### 5. Trilium Notes → 树形组织 + 克隆 + 可视化 ⭐⭐

**Trilium 的做法**：笔记按树形层级排列，支持「克隆」让同一笔记出现在多个位置；内置思维导图、关系图、画布等多种可视化

**对设计的优化**：
- **内容克隆/别名**：借鉴 Trilium 的克隆机制——同一内容可以同时归属于多个分类/合集，但不复制数据。例如一篇「光圈与景深」笔记同时出现在「摄影基础」和「人像摄影」两个分类下
- **关系图可视化**：在内容详情页增加「关联图谱」视图，以节点-边图展示当前内容与相关内容的关联网络
- **笔记类型多样性**：富文本编辑器不仅支持 Markdown，也支持思维导图模式（一键切换视图）、代码笔记、表格视图
- **属性系统**：借鉴 Trilium 的「提升属性」——用户可为内容定义自定义属性字段（如摄影笔记的「相机型号」「光圈」「ISO」），属性值可在表格视图中展示和筛选

### 设计修订清单

基于上述参考分析，对当前设计做以下修订：

| 修订项 | 影响范围 | 优先级 |
|--------|----------|--------|
| 引入 Brain/工作区多知识空间概念 | proposal + design + specs | 高 |
| 图像嵌入方案从「通用多模态」调整为「CLIP 图文对齐」 | design + storage-vector spec | 高 |
| 新增「内容克隆/别名」机制 | content-organization spec | 中 |
| 新增「知识关联图谱」轻量实现 | ai-assistant + semantic-search spec | 中 |
| 新增「解析器注册制」扩展架构 | content-ingestion spec | 中 |
| 新增「消费者管道」处理模式 | content-ingestion spec | 中 |
| 新增「关系图可视化」视图 | content-viewer spec | 低 |
| 新增「自定义属性系统」 | content-organization spec | 低 |
| 预留 MCP Server 接口 | design | 低 |
| 预留 CLI 命令行工具接口 | design | 低 |
| 预留 Skill 可编程扩展接口 | design | 低 |

### 扩展接口预留设计

#### CLI 命令行工具

**定位**：为高级用户提供命令行交互能力，覆盖 Web UI 不便操作或需要脚本化的场景。

**设计预留**：

```python
# cli/ 目录结构（预留）
cli/
├── __init__.py
├── main.py              # CLI 入口（typer/click）
├── commands/
│   ├── search.py        # kb search "光圈与景深" --brain photography
│   ├── ingest.py        # kb ingest ./photo.jpg --brain photography --tags "人像,逆光"
│   ├── export.py        # kb export --brain photography --format json
│   ├── brain.py         # kb brain list/create/switch
│   └── config.py        # kb config set provider.openai.key=sk-xxx
└── utils.py
```

**核心命令设计（预留，不实现）**：

| 命令 | 说明 | 示例 |
|------|------|------|
| `kb search <query>` | 语义检索 | `kb search "逆光人像" --brain photo --limit 10` |
| `kb ingest <path>` | 录入内容 | `kb ingest ./notes/ --brain work --tags "会议纪要"` |
| `kb brain <action>` | 工作区管理 | `kb brain create "摄影学习"` |
| `kb export` | 数据导出 | `kb export --brain photo --format markdown` |
| `kb config` | 配置管理 | `kb config set provider.openai.model gpt-4o` |
| `kb stats` | 统计信息 | `kb stats --brain photo` |

**技术选型预留**：
- 使用 `typer`（FastAPI 同作者，风格一致）或 `click`
- 与 FastAPI 共享同一 Service 层，不重复实现业务逻辑
- 通过 `httpx` 调用本地 API（CLI 作为 API 的客户端），或直接 import Service 层（零网络开销模式）

---

#### Skill 系统（AI Agent Skills）

**定位**：将知识库封装为 AI Agent 可调用的 Skill（类似 WorkBuddy 的 `openspec-propose`、`frontend-design` 等 skill），让 AI 助手能直接检索用户知识库来增强回答质量。这是让知识库「被 AI 使用」的接口，而非让用户写脚本。

**核心理念**：

```
用户提问 → AI Agent → 加载 kb-search skill → 检索知识库 → 结合检索结果回答
                                              ↑
                                    用户个人知识库（私有上下文）
```

**Skill 清单设计**：

| Skill 名称 | 功能 | AI 调用场景 |
|------------|------|-------------|
| `kb-search` | 语义检索知识库 | 「帮我找一下之前存的逆光拍摄技巧」 |
| `kb-ingest` | 录入新内容到知识库 | 「把这篇文章存到我的摄影知识库里」 |
| `kb-list` | 浏览知识库结构 | 「我的知识库里有哪些分类？」 |
| `kb-summarize` | AI 摘要生成 | 「总结一下我知识库里关于构图的内容」 |
| `kb-quiz` | 基于知识库出题 | 「根据我的摄影笔记出10道题考我」 |
| `kb-stats` | 知识库统计 | 「我知识库里有多少篇摄影相关的内容？」 |

**Skill 目录结构预留**：

```
skills/                              # 项目 skills 目录
├── kb-search/
│   └── SKILL.md                     # skill 定义（name/description/triggers/tools）
├── kb-ingest/
│   └── SKILL.md
├── kb-list/
│   └── SKILL.md
├── kb-summarize/
│   └── SKILL.md
├── kb-quiz/
│   └── SKILL.md
└── kb-stats/
    └── SKILL.md
```

**SKILL.md 模板（以 kb-search 为例）**：

```markdown
---
name: kb-search
description: >
  搜索用户个人知识库，支持语义检索和多模态内容匹配。
  当用户引用自己之前保存的资料、笔记、教程时，使用此 skill 检索相关内容。
triggers:
  - 用户提到「我的知识库」「之前存的」「我记得存过」
  - 用户想查找摄影笔记、教程资料、PDF文档
  - 需要结合用户个人资料回答问题时
allowed-tools:
  - Bash(kb:search)
  - Read
version: 1.0.0
---

# kb-search

## 使用流程

1. 解析用户的搜索意图和关键词
2. 调用 `kb search "<query>" --brain <brain_name> --limit 10`
3. 将检索结果整合到回答中，标注来源
4. 如果没有找到相关内容，告知用户并建议补充关键词
```

**Skill 实现依赖**：

每个 Skill 本质上是 CLI 命令的封装 + 提示词模板。实现 Skill 系统依赖两件事：

1. **CLI 先落地**：`kb search/ingest/list/summarize/quiz/stats` 命令必须先可用
2. **SKILL.md 编排**：每个 SKILL.md 定义触发条件、调用流程、输出格式

**Skill 与 CLI / MCP 的分层关系**：

```
                    ┌──────────────────────┐
                    │    AI Agent          │
                    │ (Claude/ChatGPT/     │
                    │  WorkBuddy)          │
                    └──────────┬───────────┘
                               │ 加载 Skill
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
        ┌──────────┐    ┌──────────┐    ┌──────────┐
        │ kb-search│    │kb-ingest │    │ kb-quiz  │  ← Skills 层
        │ SKILL.md │    │ SKILL.md │    │ SKILL.md │     (AI 协议)
        └────┬─────┘    └────┬─────┘    └────┬─────┘
             │               │               │
             └───────────────┼───────────────┘
                             │ 调用 CLI
                             ▼
                      ┌──────────────┐
                      │     CLI      │  ← CLI 层
                      │  (typer)     │     (用户/AI 共用)
                      └──────┬───────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │  HTTP    │  │ 直接     │  │  MCP     │  ← 传输层
        │  API     │  │ import   │  │ Server   │
        └────┬─────┘  └────┬─────┘  └────┬─────┘
             │              │              │
             └──────────────┼──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │  Service 层  │  ← 共享业务逻辑
                     │  (Python)    │
                     └──────────────┘
```

**与 MCP Server 的分工**：

| | Skills | MCP Server |
|---|---|---|
| **使用者** | AI Agent（加载 SKILL.md 后调用） | AI Agent（通过 MCP 协议直接调用） |
| **协议** | SKILL.md 文件（提示词 + 工具声明） | MCP 协议（JSON-RPC over stdio/HTTP） |
| **能力** | 检索 + 录入 + 摘要 + 出题（全功能） | 只读检索 |
| **实现难度** | 低（Markdown 文件 + CLI 封装） | 中（需实现 MCP Server 协议） |
| **适用场景** | WorkBuddy / Claude Code 等支持 skill 的 Agent | 任何支持 MCP 的 AI 工具 |

**设计原则**：
- Skills 是「AI 协议层」，定义 AI 如何理解和使用知识库，不包含业务逻辑
- 业务逻辑在 Service 层实现，CLI 暴露接口，Skills 编排调用
- 每个 Skill 自包含：触发条件、调用流程、输出格式全部写在 SKILL.md 中
- Skills 可跨 AI Agent 复用（只要 Agent 支持加载 SKILL.md 格式）

## Open Questions

1. **图像嵌入模型选型**：基于 Immich 参考，确定使用 CLIP（OpenAI CLIP API 或 HuggingFace 开源 CLIP），不再纠结通义千问多模态
2. **网页抓取**：使用 `playwright`（JS 渲染）还是 `trafilatura`（纯 HTML 提取）？建议双路：先 trafilatura 快速提取，失败时 fallback playwright
3. **视频字幕格式**：字幕存数据库 JSON 切片，每个切片带时间戳和独立嵌入，支持语义切片与精准跳转
4. **Redis 是否必须**：若引入 Celery（参考 Quivr）则需要 Redis 作为 broker；若保持 asyncio 后台任务则可选
5. **知识图谱存储**：初期用 PostgreSQL 邻接表（content_id → related_content_ids + relation_type），避免引入 Neo4j 等专用图数据库
