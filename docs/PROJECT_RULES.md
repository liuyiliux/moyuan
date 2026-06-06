# 墨渊 (Moyuan) 项目规则文档

> **最后更新**: 2026-06-06
> **项目版本**: 0.2.0

---

## 1. 项目概览

### 项目定位
墨渊是一个**多模态个人知识库系统**，支持统一管理文本、图片、PDF/Office 文档、音视频与网页内容，提供语义检索、AI 问答、题库生成等 AI 辅助能力。界面采用赛博道观风格。

### 核心约束
- ✅ **本地部署优先**：核心数据离线可用
- ✅ **API 调用模型**：不本地运行 AI 模型（嵌入、OCR、转写都通过 API）
- ✅ **单用户系统**：不支持多用户/团队协作
- ✅ **单一数据库**：PostgreSQL + pgvector，不引入独立向量库

---

## 2. 技术栈

### 后端技术栈
| 技术 | 版本 | 用途 |
|------|------|------|
| Python | 3.10+ | 运行时 |
| FastAPI | 0.115.6 | Web 框架 |
| SQLAlchemy | 2.0.36 | ORM（异步） |
| asyncpg | 0.30.0 | PostgreSQL 驱动 |
| pgvector | 0.3.6 | 向量扩展 |
| Alembic | 1.14.1 | 数据库迁移 |
| OpenAI SDK | 1.58.1 | AI API 调用 |
| cryptography | - | API Key 加密 |

### 前端技术栈
| 技术 | 版本 | 用途 |
|------|------|------|
| React | 19.2.6 | UI 框架 |
| TypeScript | 6.0.2 | 类型系统 |
| Vite | 8.0.12 | 构建工具 |
| TailwindCSS | 4.3.0 | CSS 框架 |
| React Router | 7.16.0 | 路由 |
| React Markdown | - | Markdown 渲染 |
| remark-breaks | - | 换行支持 |

---

## 3. 项目结构

```
moyuan/
├── backend/                          # Python 后端
│   ├── app/
│   │   ├── api/                      # API 路由层（FastAPI Routers）
│   │   │   ├── ai.py                 # AI 功能：题库生成、RAG问答、答题记录、错题本、Prompt模板
│   │   │   ├── file.py               # 文件上传/管理/内容操作
│   │   │   ├── search.py             # 语义检索
│   │   │   ├── notes.py              # 笔记 CRUD
│   │   │   ├── collections.py        # 合集管理
│   │   │   ├── provider.py           # AI 提供商配置 + 功能绑定
│   │   │   ├── brains.py             # 工作区管理 + 默认 Prompt 模板
│   │   │   └── ...
│   │   ├── core/                     # 核心基础设施
│   │   │   ├── config.py             # 配置管理（pydantic-settings）
│   │   │   ├── database.py           # 数据库连接
│   │   │   └── crypto.py             # 加密服务（API Key 加密）
│   │   ├── models/                   # SQLAlchemy ORM 模型
│   │   │   ├── base.py               # 基类
│   │   │   └── models.py             # 核心数据模型（所有表定义）
│   │   ├── schemas/                  # Pydantic 数据模型
│   │   └── services/                 # 业务逻辑层
│   │       ├── chunking.py           # 语义分块服务
│   │       ├── embedding.py          # 嵌入生成服务
│   │       ├── process.py            # 内容处理管道
│   │       ├── task_queue.py         # 异步任务队列
│   │       ├── search.py             # 检索服务
│   │       └── provider.py           # Provider 服务
│   ├── alembic/                      # 数据库迁移
│   │   └── versions/
│   ├── tests/                        # 测试
│   ├── .env.example                  # 环境变量模板
│   └── requirements.txt
├── frontend/                         # React 前端
│   ├── src/
│   │   ├── api/                      # API 客户端
│   │   │   ├── content.ts            # 内容 API
│   │   │   ├── search.ts             # 搜索 API
│   │   │   ├── provider.ts           # Provider API
│   │   │   └── organization.ts       # 分类/合集 API
│   │   ├── components/               # 组件
│   │   │   ├── ui/                   # 基础 UI 组件（Button/Card/Dialog/Badge/Input）
│   │   │   ├── Sidebar.tsx           # 侧边栏导航
│   │   │   ├── QuizGenerator.tsx     # 题库生成组件
│   │   │   ├── PromptEditor.tsx      # Prompt 模板编辑器（支持 quiz/qa 双类型）
│   │   │   ├── ContentPicker.tsx     # 内容选择器
│   │   │   ├── ProviderModal.tsx     # Provider 配置弹窗
│   │   │   ├── VersionHistoryPanel.tsx # 版本历史面板
│   │   │   └── ConfirmDialog.tsx     # 确认对话框
│   │   ├── pages/                    # 页面
│   │   │   ├── contents/             # 道藏（内容浏览/详情）
│   │   │   ├── search/               # 问玄（搜索+AI问答双模式）
│   │   │   ├── quiz/                 # 炼题（出题/答题/错题本三标签页）
│   │   │   ├── notes/                # 墨宝（笔记编辑）
│   │   │   ├── brains/               # 丹室（工作区管理）
│   │   │   ├── categories/           # 坤舆（分类管理）
│   │   │   ├── tags/                 # 符印（标签管理）
│   │   │   ├── favorites/            # 珍藏（收藏）
│   │   │   ├── collections/          # 藏经（合集管理）
│   │   │   ├── settings/             # 玄台（Provider/功能绑定/存储/索引）
│   │   │   ├── analytics/            # 卦象（统计）
│   │   │   ├── backup/               # 封魔（备份）
│   │   │   └── recycle/              # 归墟（回收站）
│   │   ├── lib/                      # 工具库
│   │   │   └── copywriting.ts        # 三风格文案系统（道/常/萌）
│   │   ├── index.css                 # 全局样式 + Tailwind + 赛博道观主题
│   │   └── App.tsx                   # 路由配置
│   └── package.json
├── openspec/                         # 项目规格文档
│   ├── specs/                        # 能力规格（23个模块）
│   └── changes/archive/              # 已归档的变更记录
├── data/                             # 本地数据（gitignore）
│   ├── files/                        # 上传文件存储
│   ├── logs/                         # 日志文件
│   └── backups/                      # 备份文件
├── docs/                             # 项目文档
│   ├── PROJECT_RULES.md              # 本文档
│   └── ...
├── docker-compose.yml                # Docker 配置
├── README.md
├── start.bat / start.ps1 / start.sh  # 一键启动脚本
└── .gitignore
```

---

## 4. 核心数据模型

### 关键表结构

| 表名 | 用途 | 核心字段 |
|------|------|---------|
| `contents` | 主内容表 | `id`, `title`, `content_type`, `text_content`, `embedding` (Vector 4096维), `brain_id` |
| `content_chunks` | 内容分块 | `content_id`, `chunk_text`, `embedding` (Vector 4096维), `page_number`, `chunk_type`, `disable_quiz` |
| `categories` | 分类（树形） | `id`, `name`, `parent_id`, `brain_id` |
| `tags` | 标签 | `id`, `name`, `color` |
| `collections` | 合集 | `id`, `name`, `brain_id` |
| `collection_items` | 合集-内容关联 | `collection_id`, `content_id`, `sort_order` |
| `brains` | 工作区 | `id`, `name`, `is_default` |
| `notes` | 笔记 | `id`, `title`, `content`, `is_starred`, `is_pinned`, `version_count` |
| `note_versions` | 笔记版本历史 | `note_id`, `title`, `text_content`, `version_number` |
| `annotations` | 文本批注 | `content_id`, `selected_text`, `annotation_text` |
| `provider_configs` | AI 提供商配置 | `id`, `name`, `api_key_encrypted`, `base_url`, `default_models` |
| `function_binding_configs` | 功能绑定 | `function`(summarize/embedding/chunking/quiz/judge/qa/ocr/transcribe), `provider_id`, `model` |
| `prompt_templates` | Prompt 模板 | `brain_id`, `template_type`(quiz/qa), `name`, `system_prompt`, `user_prompt_template`, `is_default` |
| `questions` | 题库 | `content_id`, `q_type`(single/multiple/truefalse/open), `question`, `options`, `answer`, `explanation`, `source_chunk_id` |
| `question_records` | 答题记录 | `question_id`, `user_answer`, `is_correct` |
| `content_relations` | 内容关联图 | `source_id`, `target_id`, `relation_type` |
| `search_logs` | 搜索日志 | `query`, `result_count` |
| `processing_tasks` | 异步任务 | `content_id`, `task_type`, `status` |

### 内容类型枚举
- `note` - 笔记
- `image` - 图片
- `video` - 视频
- `audio` - 音频
- `pdf` - PDF 文档
- `doc` - Office 文档
- `web` - 网页

### 向量维度约定
- **统一向量维度**: 4096 维（Qwen3-VL-Embedding-8B 输出）
- **不创建索引**: 4096 维超过 IVFFlat/HNSW 的 2000 维限制，数据量小时全表扫描性能够用

### 模型文件位置
[backend/app/models/models.py](file:///f:/PycharmProjects/moyuan/backend/app/models/models.py)

---

## 5. API 路由速查

### AI 功能 (`/api/ai`)
| 方法 | 路径 | 用途 |
|------|------|------|
| POST | `/quiz` | RAG 题库生成（支持 random/topic 模式，scope 范围过滤） |
| GET | `/quiz/history` | 查询历史题目（支持 scope 过滤） |
| GET | `/quiz/{content_id}` | 查询某内容的历史题目 |
| POST | `/quiz/record` | 记录答题结果 |
| GET | `/quiz/wrong` | 查询错题列表 |
| DELETE | `/quiz/wrong/{question_id}` | 移除错题标记（逻辑标记） |
| POST | `/quiz/judge` | AI 判断简答题 |
| POST | `/wrong_quiz` | 弱知识点定向补强出题 |
| POST | `/ask` | RAG 知识库问答 |
| GET/PUT | `/quiz-template` | 出题 Prompt 模板 |
| POST | `/quiz-template/reset` | 恢复默认出题模板 |
| GET/PUT | `/qa-template` | 问答 Prompt 模板 |
| POST | `/qa-template/reset` | 恢复默认问答模板 |
| POST | `/summarize` | AI 摘要生成 |
| GET | `/related/{content_id}` | 关联内容推荐 |

### Provider (`/api/providers`)
| 方法 | 路径 | 用途 |
|------|------|------|
| GET/PUT | `/bindings` | 功能绑定配置 |
| POST/GET/PUT/DELETE | `/` | Provider CRUD |
| POST | `/{id}/test` | 测试连接 |

### 内容 (`/api/contents`)
| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/` | 内容列表（支持分类/标签/合集过滤） |
| GET | `/{id}` | 内容详情 |
| PUT | `/{id}` | 更新内容元数据 |
| DELETE | `/{id}` | 软删除 |
| GET | `/{id}/chunks` | 内容分块（支持分页） |
| POST | `/upload` | 文件上传 |
| POST | `/{id}/reprocess` | 重新处理内容嵌入 |

### 搜索 (`/api/search`)
| 方法 | 路径 | 用途 |
|------|------|------|
| POST | `/` | 混合检索（向量+关键词） |
| GET | `/history` | 搜索历史 |
| DELETE | `/history/{id}` | 删除搜索记录 |

### 笔记 (`/api/notes`)
| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/` | 笔记列表 |
| POST | `/` | 创建笔记 |
| GET/PUT/DELETE | `/{id}` | 笔记 CRUD |

---

## 6. 关键设计决策

### 6.1 嵌入处理流程 ⭐
```
完整文本
    ↓
【1】语义分块 (chunking.py)
    ├─ 切分为 2000-3000 字符的语义块
    ├─ 写入 content_chunks 表
    └─ 每块独立处理
    ↓
【2】批量嵌入 (embedding.py)
    ├─ 批量大小不超过 64（硅基流动 API 限制）
    ├─ 自动过滤空文本
    └─ 设置 encoding_format="float"
```

### 6.2 RAG 出题流程
```
用户出题请求（content_ids + mode + topic）
    ↓
【1】展开范围 (_expand_scope)
    ├─ manual: 直接使用 content_ids
    ├─ category: 递归查询子分类
    ├─ collection: 查询合集内所有 content
    └─ 无 scope: 返回所有未删除内容
    ↓
【2】检索出题素材
    ├─ random 模式: 随机抽取 content_chunks
    ├─ topic 模式: 向量检索 top-10 相关 chunk
    └─ 对每个出题 chunk 检索 2-3 个相似 chunk 作干扰项
    ↓
【3】组装 Prompt → 调用 LLM → 解析 JSON → 落库 questions 表
```

### 6.3 RAG 问答流程
```
用户问题
    ↓
【1】向量化问题（embed_texts）
    ↓
【2】pgvector 检索 Top-K 相关 chunk
    ↓
【3】加载 qa Prompt 模板（prompt_templates 表）
    ├─ 替换 {{question}}, {{context}}, {{top_k}} 变量
    └─ 无模板时回退硬编码 Prompt
    ↓
【4】调用 LLM → 返回 { answer, sources[] }
```

### 6.4 错题判定机制
- `question_records` 表是**追加式日志**，每次作答 INSERT 新记录
- 错题查询使用 `ROW_NUMBER() OVER (PARTITION BY question_id ORDER BY answered_at DESC)` 取最新记录
- 纠正错题方式：插入 `is_correct=true` 新记录覆盖旧状态
- 错题专项补强：`POST /api/ai/wrong_quiz` 基于错题文本向量检索相似 chunk 重新出题

### 6.5 Prompt 模板系统
- 模板存储在 `prompt_templates` 表，按 `template_type` 区分用途
- 现有类型：`quiz`（出题）、`qa`（问答）
- 新建 Brain 时自动创建默认模板
- 前端 PromptEditor 组件支持 quiz/qa 双类型切换
- 变量格式：`{{variable_name}}`，由 `_render_template` 替换

### 6.6 AI Provider 配置
- API Key 用 `cryptography` AES-256-CBC 加密
- 功能绑定：`function_binding_configs` 表（summarize/embedding/chunking/quiz/judge/qa/ocr/transcribe）
- 优先级：FunctionBindingConfig > Provider.default_models > 无

### 6.7 检索策略
- **混合检索**：向量语义检索 + PostgreSQL 全文检索
- **优先使用 chunks**：语义检索优先查 `content_chunks` 而不是完整内容
- **RRF 融合**：无需调权重参数

### 6.8 前端文案系统
- 三套风格：道（赛博道观）、常（日常）、萌（可爱）
- 集中管理：`frontend/src/lib/copywriting.ts`
- 使用：`useCopy(pageCopy)` hook

---

## 7. 编码规范

### 7.1 后端编码规范

#### 分层架构
```
API 层 (api/*.py)
    ↓ 调用
Service 层 (services/*.py)  ⬅️ 业务逻辑在这里
    ↓ 调用
Model 层 (models/*.py)
```

- **API 层**：请求解析、参数验证、响应包装
- **Service 层**：核心业务逻辑
- **不跨层调用**：API 不直接操作 Model，通过 Service

#### 数据库迁移
```bash
alembic revision --autogenerate -m "add_xxx_table"   # 创建
alembic upgrade head                                   # 执行
alembic downgrade -1                                   # 回滚
```

### 7.2 前端编码规范
- API 客户端：`frontend/src/api/`
- UI 组件：`components/ui/`
- 业务组件：`components/`
- 页面：`pages/`

### 7.3 路由注册顺序 ⚠️
**FastAPI 路由按注册顺序匹配**。通配路由（如 `/quiz/{content_id}`）必须放在所有具体路由（如 `/quiz/wrong`、`/quiz/history`）之后，否则会劫持请求。

---

## 8. 常见问题与解决方案

### 8.1 硅基流动嵌入 API 报错
- 批量大小不超过 64
- 设置 `encoding_format="float"`
- 过滤空字符串输入

### 8.2 向量维度问题
4096 维超过索引限制，不创建索引，数据量小时全表扫描性能够用。

### 8.3 内容截断
`_truncate_text` 不再截断（内容已分块，单块 2000-3000 字符）。

### 8.4 向量搜索格式
asyncpg 需要向量以字符串 `[x,y,z]` 格式传递。

### 8.5 前端依赖问题
`package-lock.json` 可能锁定内部 registry，必要时删除 `node_modules` 和 `package-lock.json` 后重新 `npm install`。

### 8.6 判断题 UI 兼容
判断题的 `q.type === "truefalse"` 渲染专用按钮（✓正确/✗错误），A/B 选项不显示。判题逻辑兼容 "对"/"正确"/"错"/"错误"/true/false 多种格式。

---

## 9. 启动与开发

### 9.1 一键启动

```bash
# Windows
start.bat
# 或 PowerShell
.\start.ps1
# Linux/Mac
./start.sh
```

### 9.2 手动启动

```bash
# 后端
cd backend
venv\Scripts\activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 前端（新终端）
cd frontend
npm install
npm run dev
```

**访问**:
- 前端: http://localhost:5173
- API 文档: http://localhost:8000/docs

### 9.3 环境变量

```env
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/moyuan
FILE_STORAGE_ROOT=../data/files
ENCRYPTION_KEY=xxx  # python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
HOST=0.0.0.0
PORT=8000
```

---

## 10. 设计文档参考

项目使用 OpenSpec 管理设计文档：

| 位置 | 内容 |
|------|------|
| `openspec/specs/` | 23个能力模块规格 |
| `openspec/changes/archive/` | 已归档的变更记录 |

---

## 11. 待办与改进方向

1. 引入本地轻量级嵌入模型作为 API 离线 fallback
2. 多轮对话上下文支持
3. SSE 流式输出（问答/摘要）
4. CLI 工具（预留设计）
5. MCP Server（预留设计）
6. AI Agent Skills（预留设计）

---

## 12. 修改记录

| 日期 | 修改内容 | 修改人 |
|------|---------|-------|
| 2026-06-02 | 创建本文档 | AI |
| 2026-06-02 | 修复硅基流动嵌入问题 | AI |
| 2026-06-06 | 更新：添加题库系统（RAG出题/错题本/弱知识点补强） | AI |
| 2026-06-06 | 更新：添加RAG知识库问答系统 | AI |
| 2026-06-06 | 更新：添加Prompt模板系统（quiz/qa） | AI |
| 2026-06-06 | 更新：添加API路由速查、数据模型、路由注册顺序警告 | AI |

---

> **AI 助手注意**: 处理此项目代码时，请优先参考本文档！遇到问题先查「常见问题与解决方案」章节。
