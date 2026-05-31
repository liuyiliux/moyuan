# 墨渊 Moyuan 一键启动脚本 (PowerShell)
# 用法: .\start.ps1              → 默认端口 5173 + 8005
#       .\start.ps1 -Frontend 3000 -Backend 8080

param(
    [int]$Frontend = 5173,
    [int]$Backend = 8005
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Timestamp = Get-Date -Format "HH:mm:ss"

function Write-Step($msg) {
    Write-Host "  [$Timestamp] $msg" -ForegroundColor DarkGray
}
function Write-OK($msg) {
    Write-Host "  [$Timestamp] ✓ $msg" -ForegroundColor Green
}
function Write-Err($msg) {
    Write-Host "  [$Timestamp] ✗ $msg" -ForegroundColor Red
}
function Write-Warn($msg) {
    Write-Host "  [$Timestamp] ⚠ $msg" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "╔════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   墨渊 Moyuan — 多模态个人知识库          ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ========== 0. 清理旧进程 ==========
Write-Step "检查端口占用..."

function Free-Port($port) {
    $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
        Where-Object { $_.OwningProcess -gt 0 }
    foreach ($c in $conns) {
        try {
            Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop
            Write-Warn "已终止占用端口 $port 的进程 (PID $($c.OwningProcess))"
        } catch {
            Write-Err "无法终止 PID $($c.OwningProcess)，请手动检查"
        }
    }
}

Free-Port $Backend
Free-Port $Frontend
Start-Sleep -Milliseconds 500

# ========== 1. 环境检查 ==========
Write-Step "检查运行环境..."

$venvPython = Join-Path $Root "backend\venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Write-Err "Python 虚拟环境未找到: $venvPython"
    Write-Host "  → 创建中..." -ForegroundColor Yellow
    Push-Location "$Root\backend"
    python -m venv venv
    & "$Root\backend\venv\Scripts\pip.exe" install -r requirements.txt
    Pop-Location
    Write-OK "venv 已创建并安装依赖"
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Err "Node.js 未安装，请安装 Node.js 18+"
    exit 1
}
Write-OK "Python venv + Node.js 就绪"

# .env
if (-not (Test-Path "$Root\backend\.env")) {
    Copy-Item "$Root\backend\.env.example" "$Root\backend\.env" -ErrorAction SilentlyContinue
    Write-Warn ".env 已从 .env.example 创建，请检查配置"
}

# ========== 2. 数据库初始化 ==========
Write-Step "初始化数据库..."

Push-Location "$Root\backend"
try {
    & $venvPython -c @"
import asyncio, sys
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
"@
    Write-OK "数据库表就绪"
} catch {
    Write-Warn "数据库初始化失败（可能已存在）: $_"
}
Pop-Location

# ========== 3. 前端依赖 ==========
if (-not (Test-Path "$Root\frontend\node_modules")) {
    Write-Step "安装前端依赖..."
    Push-Location "$Root\frontend"
    npm install 2>&1 | Out-Null
    Pop-Location
    Write-OK "前端依赖安装完成"
} else {
    Write-OK "前端依赖已存在"
}

# ========== 4. 启动后端 ==========
Write-Step "启动后端 (port $Backend)..."

$backendProc = Start-Process -FilePath $venvPython `
    -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "$Backend" `
    -WorkingDirectory "$Root\backend" `
    -PassThru `
    -NoNewWindow

Start-Sleep -Seconds 2

# 检查后端是否成功启动
try {
    $null = Invoke-WebRequest -Uri "http://localhost:$Backend/api/health" -TimeoutSec 3 -UseBasicParsing
    Write-OK "后端已启动: http://localhost:$Backend"
} catch {
    Write-Err "后端启动失败，请检查日志"
    Write-Host "  数据库是否在运行？端口 $Backend 是否被占用？" -ForegroundColor Yellow
    if ($backendProc) { Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue }
    exit 1
}

# ========== 5. 启动前端 ==========
Write-Step "启动前端 (port $Frontend)..."

Push-Location "$Root\frontend"

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  后端:  http://localhost:$Backend" -ForegroundColor Green
Write-Host "  前端:  http://localhost:$Frontend" -ForegroundColor Green
Write-Host "  Ctrl+C 停止所有服务" -ForegroundColor DarkGray
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

# 注册 Ctrl+C 清理
$cleanup = {
    Write-Host ""
    Write-Host "正在关闭服务..." -ForegroundColor Yellow
    if ($backendProc) {
        Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue
    }
    # 杀当前 node 进程
    Get-Process -Name "node" -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowTitle -eq "" } |
        Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host "已关闭" -ForegroundColor Green
}

try {
    npm run dev -- --port $Frontend
} finally {
    & $cleanup
}
