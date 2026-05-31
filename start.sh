#!/usr/bin/env bash
# 墨渊 Moyuan 一键启动脚本 (Linux / macOS / Git Bash)
# 用法: bash start.sh
#       bash start.sh 3000 8080    → 指定前端/后端端口

set -e

FRONTEND_PORT="${1:-5173}"
BACKEND_PORT="${2:-8005}"

ROOT="$(cd "$(dirname "$0")" && pwd)"
TIMESTAMP() { date '+%H:%M:%S'; }

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m'

step()  { echo -e "  ${GRAY}[$(TIMESTAMP)]${NC} $*"; }
ok()    { echo -e "  ${GRAY}[$(TIMESTAMP)]${NC} ${GREEN}✓${NC} $*"; }
warn()  { echo -e "  ${GRAY}[$(TIMESTAMP)]${NC} ${YELLOW}⚠${NC} $*"; }
err()   { echo -e "  ${GRAY}[$(TIMESTAMP)]${NC} ${RED}✗${NC} $*"; }

echo ""
echo -e "${CYAN}╔════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   墨渊 Moyuan — 多模态个人知识库          ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════╝${NC}"
echo ""

# ── 检测操作系统 ──
IS_WIN=0
case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) IS_WIN=1 ;;
esac

# ── Python 路径 ──
if [ $IS_WIN -eq 1 ]; then
    VENV_PYTHON="$ROOT/backend/venv/Scripts/python.exe"
    VENV_PIP="$ROOT/backend/venv/Scripts/pip.exe"
else
    VENV_PYTHON="$ROOT/backend/venv/bin/python"
    VENV_PIP="$ROOT/backend/venv/bin/pip"
fi

# ── 1. 环境检查 ──
step "检查运行环境..."

if [ ! -f "$VENV_PYTHON" ]; then
    warn "Python venv 未找到，正在创建..."
    cd "$ROOT/backend"
    python3 -m venv venv 2>/dev/null || python -m venv venv
    "$VENV_PIP" install -r requirements.txt -q
    ok "venv 已创建"
fi

if ! command -v node &>/dev/null; then
    err "Node.js 未安装"
    exit 1
fi
ok "Python venv + Node.js 就绪"

# .env
if [ ! -f "$ROOT/backend/.env" ]; then
    cp "$ROOT/backend/.env.example" "$ROOT/backend/.env" 2>/dev/null || true
    warn ".env 已从 .env.example 创建"
fi

# ── 2. 数据库初始化 ──
step "初始化数据库..."

cd "$ROOT/backend"
"$VENV_PYTHON" -c "
import asyncio
from sqlalchemy import text
from app.core.database import engine
from app.models.base import Base
from app.models.models import ProcessingTask

async def init():
    async with engine.begin() as conn:
        try: await conn.execute(text('CREATE EXTENSION IF NOT EXISTS vector'))
        except: pass
        await conn.run_sync(Base.metadata.create_all)
    print('OK')

asyncio.run(init())
" 2>/dev/null && ok "数据库表就绪" || warn "数据库初始化失败（可能已存在）"

# ── 3. 清理旧端口 ──
step "清理端口占用..."

if [ $IS_WIN -eq 1 ]; then
    # Windows: 使用 netstat + taskkill
    for port in $BACKEND_PORT $FRONTEND_PORT; do
        pid=$(netstat -ano 2>/dev/null | grep ":$port " | awk '{print $5}' | head -1)
        if [ -n "$pid" ] && [ "$pid" != "0" ]; then
            taskkill //F //PID "$pid" 2>/dev/null && warn "已释放端口 $port"
        fi
    done
else
    for port in $BACKEND_PORT $FRONTEND_PORT; do
        pid=$(lsof -ti ":$port" 2>/dev/null)
        if [ -n "$pid" ]; then
            kill -9 $pid 2>/dev/null && warn "已释放端口 $port"
        fi
    done
fi
sleep 1

# ── 4. 前端依赖 ──
cd "$ROOT/frontend"
if [ ! -d "node_modules" ]; then
    step "安装前端依赖..."
    npm install --silent
    ok "前端依赖安装完成"
else
    ok "前端依赖已存在"
fi

# ── 5. 启动后端 ──
step "启动后端 (port $BACKEND_PORT)..."

cd "$ROOT/backend"
"$VENV_PYTHON" -m uvicorn app.main:app --host 0.0.0.0 --port "$BACKEND_PORT" &
BACKEND_PID=$!
sleep 2

# 检查健康
if curl -s "http://localhost:$BACKEND_PORT/api/health" >/dev/null 2>&1; then
    ok "后端已启动: http://localhost:$BACKEND_PORT"
else
    err "后端启动失败，请检查数据库是否运行"
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

# ── 6. 启动前端 ──
step "启动前端 (port $FRONTEND_PORT)..."

cd "$ROOT/frontend"

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ${GREEN}后端:  http://localhost:$BACKEND_PORT${NC}"
echo -e "  ${GREEN}前端:  http://localhost:$FRONTEND_PORT${NC}"
echo -e "  ${GRAY}Ctrl+C 停止所有服务${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

cleanup() {
    echo ""
    echo -e "${YELLOW}正在关闭服务...${NC}"
    kill $BACKEND_PID 2>/dev/null
    wait $BACKEND_PID 2>/dev/null
    echo -e "${GREEN}已关闭${NC}"
}

trap cleanup INT TERM

npm run dev -- --port "$FRONTEND_PORT" &
FRONTEND_PID=$!

wait $FRONTEND_PID
cleanup
