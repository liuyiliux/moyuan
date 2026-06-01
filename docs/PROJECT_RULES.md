# 墨渊 (Moyuan) 项目规则文档

> **最后更新**: 2026-06-02
> **项目版本**: 0.1.0

---

## 1. 项目概览

### 项目定位
墨渊是一个**多模态个人知识库系统**，支持统一管理文本、图片、PDF/Office 文档、音视频与网页内容，提供语义检索与 AI 辅助能力。

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

### 前端技术栈
| 技术 | 版本 | 用途 |
|------|------|------|
| React | 19.2.6 | UI 框架 |
| TypeScript | 6.0.2 | 类型系统 |
| Vite | 8.0.12 | 构建工具 |
| TailwindCSS | 4.3.0 | CSS 框架 |
| React Router | 7.16.0 | 路由 |

### 依赖位置
- 后端依赖: `backend/requirements.txt`
- 前端依赖: `frontend/package.json`

---

## 3. 项目结构

```
moyuan/
├── backend/                          # Python 后端
│   ├── app/
│   │   ├── api/                      # API 路由层（FastAPI Routers）
│   │   │   ├── file.py               # 文件上传/管理
│   │   │   ├── search.py             # 语义检索
│   │   │   ├── embedding.py          # 嵌入管理
│   │   │   ├── provider.py           # AI 提供商配置
│   │   │   ├── brains.py             # 工作区管理
│   │   │   └── ...
│   │   ├── core/                     # 核心基础设施
│   │   │   ├── config.py             # 配置管理（pydantic-settings）
│   │   │   ├── database.py           # 数据库连接
│   │   │   └── crypto.py             # 加密服务（API Key 加密）
│   │   ├── models/                   # SQLAlchemy ORM 模型
│   │   │   ├── base.py               # 基类
│   │   │   └── models.py             # 核心数据模型
│   │   ├── schemas/                  # Pydantic 数据模型
│   │   └── services/                 # 业务逻辑层
│   │       ├── chunking.py           # 语义分块服务
│   │       ├── embedding.py          # 嵌入生成服务
│   │       ├── process.py            # 内容处理管道
│   │       ├── task_queue.py         # 异步任务队列
│   │       └── search.py             # 检索服务
│   ├── alembic/                      # 数据库迁移
│   │   └── versions/
│   ├── tests/                        # 测试
│   ├── .env.example                  # 环境变量模板
│   └── requirements.txt
├── frontend/                         # React 前端
│   ├── src/
│   │   ├── api/                      # API 客户端
│   │   ├── components/               # 组件
│   │   │   └── ui/                   # shadcn/ui 组件
│   │   ├── pages/                    # 页面
│   │   ├── lib/                      # 工具库
│   │   └── App.tsx
│   └── package.json
├── openspec/                         # OpenSpec 设计文档
│   └── changes/moyuan/
│       ├── design.md                 # 设计决策
│       ├── proposal.md               # 需求提案
│       └── specs/                    # 各模块详细规格
├── data/                             # 本地数据（gitignore）
│   └── files/                        # 上传文件存储
├── docker-compose.yml                # Docker 配置
└── PROJECT_RULES.md                  # 本文档 ⬅️
```

---

## 4. 核心数据模型

### 关键表结构

| 表名 | 用途 | 核心字段 |
|------|------|---------|
| `contents` | 主内容表 | `id`, `title`, `content_type`, `text_content`, `embedding` (Vector 4096维) |
| `content_chunks` | 内容分块 | `content_id`, `chunk_text`, `embedding` (Vector 4096维) |
| `categories` | 分类（树形） | `id`, `name`, `parent_id` |
| `tags` | 标签 | `id`, `name`, `color` |
| `collections` | 合集 | `id`, `name` |
| `brains` | 工作区 | `id`, `name`, `is_default` |
| `provider_configs` | AI 提供商配置 | `id`, `name`, `api_key_encrypted`, `default_models` |
| `function_binding_configs` | 功能绑定 | `function`, `provider_id`, `model` |
| `content_relations` | 内容关联 | `source_id`, `target_id`, `relation_type` |
| `annotations` | 批注 | `content_id`, `selected_text`, `annotation_text` |

### 向量维度约定
- **统一向量维度**: 4096 维（Qwen3-VL-Embedding-8B 输出）
- **索引限制**: pgvector 的 IVFFlat/HNSW 索引最多支持 2000 维，4096 维向量**不创建索引**，数据量小时（<10万条）全表扫描性能够用

### 模型文件位置
[backend/app/models/models.py](file:///f:/PycharmProjects/moyuan/backend/app/models/models.py)

---

## 5. 关键设计决策

### 5.1 嵌入处理流程 ⭐
**关键规则**：内容先分块，再对块向量化，不再截断长文本

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

**相关文件**:
- [backend/app/services/chunking.py](file:///f:/PycharmProjects/moyuan/backend/app/services/chunking.py) - 语义分块
- [backend/app/services/embedding.py](file:///f:/PycharmProjects/moyuan/backend/app/services/embedding.py) - 嵌入生成
- [backend/app/services/process.py](file:///f:/PycharmProjects/moyuan/backend/app/services/process.py) - 内容处理管道

### 5.2 AI 提供商配置
- API Key 使用 `cryptography` 加密存储在 `api_key_encrypted` 字段
- 功能绑定通过 `function_binding_configs` 表（`embedding`, `chunking`, `summarize` 等）
- 优先使用 Provider 的 `default_models`，fallback 到功能绑定

**加密服务**: [backend/app/core/crypto.py](file:///f:/PycharmProjects/moyuan/backend/app/core/crypto.py)

### 5.3 异步任务队列
- 使用 Python asyncio 后台任务（不引入 Celery/Redis）
- 任务状态保存在 `processing_tasks` 表
- WebSocket `/ws/progress/{content_id}` 推送进度

**任务队列**: [backend/app/services/task_queue.py](file:///f:/PycharmProjects/moyuan/backend/app/services/task_queue.py)

### 5.4 检索策略
- **混合检索**: 向量语义检索 + PostgreSQL 全文检索
- **优先使用 chunks**: 语义检索优先查 `content_chunks` 而不是完整内容
- **RRF 融合**: 无需调权重参数

**检索服务**: [backend/app/services/search.py](file:///f:/PycharmProjects/moyuan/backend/app/services/search.py)

---

## 6. 编码规范

### 6.1 后端编码规范

#### 分层架构
```
API 层 (api/*.py)
    ↓ 调用
Service 层 (services/*.py)  ⬅️ 业务逻辑在这里
    ↓ 调用
Model 层 (models/*.py)
```

- **API 层**: 只做请求解析、参数验证、响应包装
- **Service 层**: 核心业务逻辑，与数据库交互
- **不跨层调用**: API 不直接操作 Model，通过 Service

#### 错误处理
```python
# 优先使用 FastAPI HTTPException
from fastapi import HTTPException

raise HTTPException(status_code=404, detail="Content not found")

# Service 层可以抛出 RuntimeError，由 API 层捕获
# 详细错误信息打印到日志，用户侧只显示友好提示
```

#### 数据库迁移
- 使用 Alembic 管理 schema 变更
- 不要直接修改数据库，始终通过迁移
- 迁移文件位于 `backend/alembic/versions/`

```bash
# 创建新迁移
alembic revision --autogenerate -m "add_xxx_table"

# 执行迁移
alembic upgrade head

# 回滚
alembic downgrade -1
```

### 6.2 前端编码规范

#### API 调用
- API 客户端统一放在 `frontend/src/api/`
- 使用 TypeScript 类型定义

#### 组件组织
- 通用 UI 组件在 `components/ui/`
- 业务组件在 `components/`
- 页面在 `pages/`

---

## 7. 常见问题与解决方案

### 7.1 硅基流动嵌入 API 报错
**问题**: 调用硅基流动嵌入 API 返回 400 错误

**解决方案**:
1. ✅ 批量大小不超过 64（已在 `_call_openai_embedding` 中处理）
2. ✅ 设置 `encoding_format="float"`（已添加）
3. ✅ 过滤空字符串输入（已添加）
4. ✅ 检查模型名称是否正确（如 `BAAI/bge-m3`）

**相关代码**: [backend/app/services/embedding.py#L35-L122](file:///f:/PycharmProjects/moyuan/backend/app/services/embedding.py#L35-L122)

### 7.2 向量维度问题
**问题**: pgvector 索引创建失败

**原因**: 4096 维向量超过 IVFFlat/HNSW 索引的 2000 维限制

**解决方案**: 不创建索引，数据量小时全表扫描性能够用

### 7.3 _truncate_text 不再截断
**变更历史**:
- **旧行为**: 截断到 8000 字符
- **新行为**: 只做 trim() 清理，不截断
- **原因**: 内容已经过分块，单块只有 2000-3000 字符，不需要截断

**相关代码**: [backend/app/services/embedding.py#L174-L178](file:///f:/PycharmProjects/moyuan/backend/app/services/embedding.py#L174-L178)

### 7.4 向量搜索格式问题
**问题**: 使用 asyncpg 调用 pgvector 时报错 `invalid input for query argument`

**原因**: asyncpg 需要向量以字符串格式 `[x,y,z]` 传递，而不是 Python list

**解决方案**: 在搜索服务中将向量列表转换为字符串格式

**相关代码**: [backend/app/services/search.py#L65-L67](file:///f:/PycharmProjects/moyuan/backend/app/services/search.py#L65-L67)

### 7.5 Chunks API 分页
**功能**: 获取内容分块时支持分页，避免返回过多数据

**API**: `GET /api/contents/{content_id}/chunks?page=1&page_size=50`

**响应**:
```json
{
  "content_id": "...",
  "total": 100,
  "page": 1,
  "page_size": 50,
  "chunks": [...]
}
```

**相关代码**: [backend/app/api/file.py#L421-L472](file:///f:/PycharmProjects/moyuan/backend/app/api/file.py#L421-L472)

### 7.6 重新处理内容策略
**功能**: 重新处理内容时可以选择处理范围

**选项**:
- `reprocess_all=false`: 只处理未嵌入的分块（默认，保留成功的嵌入）
- `reprocess_all=true`: 删除所有分块，重新处理全部内容

**相关代码**:
- [backend/app/api/file.py#L361-L376](file:///f:/PycharmProjects/moyuan/backend/app/api/file.py#L361-L376)
- [backend/app/services/process.py#L100-L110](file:///f:/PycharmProjects/moyuan/backend/app/services/process.py#L100-L110)

### 7.7 前端详情页优化
**功能**:
- 长文本内容默认折叠，点击展开查看全部
- 底部添加"回到顶部"和"滚动到底部"浮动按钮
- Chunks 标签页支持分页浏览

**相关代码**: [frontend/src/pages/contents/detail.tsx](file:///f:/PycharmProjects/moyuan/frontend/src/pages/contents/detail.tsx)

---

## 8. 启动与开发

### 8.1 本地开发启动

**Windows (PowerShell)**:
```powershell
# 方式 1: 使用启动脚本
.\start.ps1

# 方式 2: 手动启动
# 后端
cd backend
venv\Scripts\activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 前端（新终端）
cd frontend
npm install
npm run dev
```

**访问地址**:
- 前端: http://localhost:5173
- 后端 API: http://localhost:8000
- API 文档: http://localhost:8000/docs

### 8.2 环境变量配置
复制 `backend/.env.example` 为 `backend/.env` 并填入配置：

```env
# 数据库
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/moyuan
DATABASE_URL_SYNC=postgresql://user:password@localhost:5432/moyuan

# 文件存储
FILE_STORAGE_ROOT=../data/files

# 加密密钥（生成: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"）
ENCRYPTION_KEY=xxx

# 服务配置
HOST=0.0.0.0
PORT=8000
DEBUG=false
```

---

## 9. 设计文档参考

项目使用 OpenSpec 管理设计文档，位于 `openspec/changes/moyuan/`:

| 文档 | 用途 |
|------|------|
| [design.md](file:///f:/PycharmProjects/moyuan/openspec/changes/moyuan/design.md) | 核心设计决策、技术选型、风险评估 |
| [proposal.md](file:///f:/PycharmProjects/moyuan/openspec/changes/moyuan/proposal.md) | 需求提案 |
| [tasks.md](file:///f:/PycharmProjects/moyuan/openspec/changes/moyuan/tasks.md) | 任务分解 |
| specs/*.md | 各模块详细规格（语义搜索、内容管理等） |

---

## 10. 快速参考卡片

### 常用路径速查
```
嵌入服务    → backend/app/services/embedding.py
分块服务    → backend/app/services/chunking.py
处理管道    → backend/app/services/process.py
数据模型    → backend/app/models/models.py
API 路由    → backend/app/api/
配置        → backend/app/core/config.py
```

### 内容类型枚举
- `note` - 笔记
- `image` - 图片
- `video` - 视频
- `audio` - 音频
- `pdf` - PDF 文档
- `doc` - Office 文档
- `web` - 网页

### 关系类型枚举
- `reference` - 引用
- `series` - 系列
- `similar` - 相似

---

## 11. 待办与改进方向

### 已知改进点
1. 考虑引入本地轻量级嵌入模型作为 API 离线 fallback
2. 支持向量维度可配置（1536/2000/4096）
3. 为 chunks 表考虑其他索引策略（如预先降维）
4. CLI 工具（预留设计）
5. MCP Server（预留设计）
6. AI Agent Skills（预留设计）

### 参考项目设计
- Paperless-ngx: 自动化分类流水线
- Immich: CLIP 多模态搜索
- Quivr: 模块化架构、多知识空间
- Trilium Notes: 树形组织、克隆机制

---

## 12. 修改记录

| 日期 | 修改内容 | 修改人 |
|------|---------|-------|
| 2026-06-02 | 创建本文档，记录项目架构与关键决策 | AI |
| 2026-06-02 | 修复硅基流动嵌入问题（批量限制、encoding_format） | AI |
| 2026-06-02 | 移除 _truncate_text 的截断逻辑（分块已处理） | AI |
| 2026-06-02 | 修复向量搜索格式问题（asyncpg 需要字符串格式） | AI |
| 2026-06-02 | 为 Chunks API 添加分页功能 | AI |
| 2026-06-02 | 添加重新处理内容策略（支持选择处理范围） | AI |
| 2026-06-02 | 优化前端详情页（内容折叠、浮动按钮、分页） | AI |

---

> **AI 助手注意**: 处理此项目代码时，请优先参考本文档！遇到问题先查「常见问题与解决方案」章节。
