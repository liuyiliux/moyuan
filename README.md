# 墨渊 (Moyuan) - 多模态个人知识库

## 技术栈

- **后端**: Python 3.10+ / FastAPI / asyncpg / pgvector / Alembic
- **前端**: React 18 / TypeScript / Vite / shadcn/ui / TailwindCSS
- **数据库**: PostgreSQL 16 + pgvector
- **缓存**: Redis 7 (可选)

## 快速开始

### 1. 启动数据库

```bash
docker compose up -d postgres
```

### 2. 配置环境变量

```bash
cd backend
cp .env.example .env
# 编辑 .env 填入实际配置
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

## 项目结构

```
moyuan/
├── backend/               # Python 后端
│   ├── app/
│   │   ├── api/           # API 路由
│   │   ├── core/          # 核心配置（数据库、设置）
│   │   ├── models/        # SQLAlchemy 模型
│   │   ├── schemas/       # Pydantic 数据模型
│   │   └── services/      # 业务逻辑
│   ├── alembic/           # 数据库迁移
│   ├── tests/             # 测试
│   └── requirements.txt
├── frontend/              # React 前端
├── skills/                # AI Agent Skills
├── data/                  # 本地数据存储
│   ├── files/             # 上传文件
│   └── backups/           # 备份文件
└── docker-compose.yml
```
