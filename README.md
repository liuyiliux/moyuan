# 墨渊 (Moyuan) — 多模态个人知识库

本地部署的多模态知识库，支持文本/图片/PDF/音视频/网页统一管理，提供语义检索、AI 问答、题库生成等 AI 辅助能力。

界面采用赛博道观风格（四色主调、太极八卦装饰、粒子气机背景）。

## 核心功能

- **多模态录入**：文本笔记 · PDF/Word/Excel 解析 · 图片 OCR · 音视频转写 · 网页抓取
- **多工作区**：创建多个独立 Brain，各自独立的分类、标签、AI 配置
- **语义检索**：向量相似度 + 关键词混合检索，结果高亮、跨模态搜索
- **在线预览**：PDF/图片/视频播放器，字幕时间轴跳转
- **富文本笔记**：Markdown 编辑、批注、版本历史、编辑/分屏/预览多视图
- **AI 问答**：基于知识库内容的 RAG 问答，答案可溯源、一键保存为笔记
- **AI 题库**：RAG 检索出题（单选/多选/判断/简答），支持按分类/合集出题、错题本、弱知识点补强
- **AI 摘要**：文档/视频自动生成摘要
- **知识图谱**：内容关联可视化
- **数据安全**：手动备份、一键导入导出
- **第三方服务**：兼容 OpenAI API 格式、腾讯云 OCR
- **Prompt 模板**：出题和问答 Prompt 可自定义编辑
- **数据统计**：文件数、标签分布、检索热度面板

## 技术栈

- **后端**：Python 3.10+ / FastAPI / asyncpg / pgvector / Alembic
- **前端**：React 18 / TypeScript / Vite / TailwindCSS v4
- **数据库**：PostgreSQL 16 + pgvector
- **缓存**：Redis 7（可选）

## 快速开始

### 1. 启动数据库

```bash
docker compose up -d postgres
```

### 2. 配置环境变量

```bash
cd backend
cp .env.example .env
# 编辑 .env 填入数据库连接、文件存储路径、加密密钥
```

### 3. 安装依赖

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 4. 初始化数据库

```bash
cd backend
alembic upgrade head
```

### 5. 启动后端

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 6. 启动前端

```bash
cd frontend
npm install
npm run dev
```

访问 http://localhost:5173

### 一键启动

```bash
# Windows
start.bat
# 或 PowerShell
.\start.ps1
# Linux/Mac
./start.sh
```

## 页面导航

| 页面 | 路径 | 功能 |
|------|------|------|
| 道藏（知识库） | `/contents` | 浏览、搜索、上传内容 |
| 符印（标签） | `/tags` | 标签管理 |
| 坤舆（分类） | `/categories` | 树形分类管理 |
| 珍藏（收藏） | `/favorites` | 收藏的内容 |
| 藏经（合集） | `/collections` | 合集管理 |
| 墨宝（笔记） | `/notes` | 富文本笔记编辑 |
| 丹室（工作区） | `/brains` | 多工作区管理 |
| 问玄（搜索） | `/search` | 搜索 + AI 问答双模式 |
| 炼题（题库） | `/quiz` | 出题、答题、错题本 |
| 卦象（统计） | `/analytics` | 数据统计面板 |
| 封魔（备份） | `/backup` | 数据备份与恢复 |
| 玄台（设置） | `/settings` | Provider 配置、功能绑定、存储路径、索引管理 |
| 归墟（回收站） | `/recycle` | 已删除内容恢复 |

## 项目结构

```
moyuan/
├── backend/               # Python 后端
│   ├── app/
│   │   ├── api/           # API 路由（ai/brain/content/file/notes/provider/search）
│   │   ├── core/          # 核心配置（数据库、加密、日志）
│   │   ├── models/        # SQLAlchemy 模型
│   │   ├── schemas/       # Pydantic 数据模型
│   │   └── services/      # 业务逻辑（embedding/file/provider/search）
│   ├── alembic/           # 数据库迁移
│   ├── tests/             # 测试
│   └── requirements.txt
├── frontend/              # React 前端
│   ├── src/
│   │   ├── api/           # API 客户端
│   │   ├── components/    # 通用组件
│   │   ├── lib/           # 工具库、文案系统
│   │   └── pages/         # 页面组件
│   └── ...
├── openspec/              # 项目规格文档
│   ├── specs/             # 能力规格
│   └── changes/archive/   # 已归档的变更记录
├── data/                  # 本地数据存储
│   ├── files/             # 上传文件
│   └── backups/           # 备份文件
└── docker-compose.yml
```
