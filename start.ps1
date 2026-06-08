# Moyuan one-command startup script for Windows PowerShell.
# Usage:
#   .\start.ps1
#   .\start.ps1 -Frontend 3000 -Backend 8080

param(
    [int]$Frontend = 5173,
    [int]$Backend = 8005
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Now {
    return Get-Date -Format "HH:mm:ss"
}

function Write-Step($msg) {
    Write-Host "  [$(Now)] $msg" -ForegroundColor DarkGray
}

function Write-OK($msg) {
    Write-Host "  [$(Now)] OK  $msg" -ForegroundColor Green
}

function Write-Err($msg) {
    Write-Host "  [$(Now)] ERR $msg" -ForegroundColor Red
}

function Write-Warn($msg) {
    Write-Host "  [$(Now)] WARN $msg" -ForegroundColor Yellow
}

function Free-Port($port) {
    $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
        Where-Object { $_.OwningProcess -gt 0 }

    foreach ($c in $conns) {
        try {
            Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop
            Write-Warn "Stopped process using port $port (PID $($c.OwningProcess))."
        } catch {
            Write-Err "Could not stop PID $($c.OwningProcess). Please check it manually."
        }
    }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Moyuan - local multimodal personal knowledge base" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

Write-Step "Checking port usage..."
Free-Port $Backend
Free-Port $Frontend
Start-Sleep -Milliseconds 500

Write-Step "Checking runtime environment..."
$venvPython = Join-Path $Root "backend\venv\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    Write-Warn "Python virtual environment was not found: $venvPython"
    Write-Step "Creating backend virtual environment and installing dependencies..."
    Push-Location "$Root\backend"
    python -m venv venv
    & "$Root\backend\venv\Scripts\pip.exe" install -r requirements.txt
    Pop-Location
    Write-OK "Backend virtual environment is ready."
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Err "Node.js is not installed. Please install Node.js 18+."
    exit 1
}

Write-OK "Python venv and Node.js are ready."

if (-not (Test-Path "$Root\backend\.env")) {
    Copy-Item "$Root\backend\.env.example" "$Root\backend\.env" -ErrorAction SilentlyContinue
    Write-Warn "Created backend\.env from .env.example. Please review the configuration."
}

Write-Step "Initializing database tables..."
Push-Location "$Root\backend"
try {
    & $venvPython -c @"
import asyncio
from sqlalchemy import text
from app.core.database import engine
from app.models.base import Base
from app.models import models  # noqa: F401

async def init():
    async with engine.begin() as conn:
        try:
            await conn.execute(text('CREATE EXTENSION IF NOT EXISTS vector'))
        except Exception:
            pass
        await conn.run_sync(Base.metadata.create_all)
    print('OK')

asyncio.run(init())
"@
    Write-OK "Database tables are ready."
} catch {
    Write-Warn "Database initialization failed. It may already be initialized, or PostgreSQL may be offline. $_"
}
Pop-Location

if (-not (Test-Path "$Root\frontend\node_modules")) {
    Write-Step "Installing frontend dependencies..."
    Push-Location "$Root\frontend"
    npm install
    Pop-Location
    Write-OK "Frontend dependencies are installed."
} else {
    Write-OK "Frontend dependencies already exist."
}

Write-Step "Starting backend on port $Backend..."
$backendProc = Start-Process -FilePath $venvPython `
    -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "$Backend" `
    -WorkingDirectory "$Root\backend" `
    -PassThru `
    -NoNewWindow

Start-Sleep -Seconds 2

try {
    $null = Invoke-WebRequest -Uri "http://localhost:$Backend/api/health" -TimeoutSec 3 -UseBasicParsing
    Write-OK "Backend is running: http://localhost:$Backend"
} catch {
    Write-Err "Backend failed to start."
    Write-Host "  Check whether PostgreSQL is running and whether port $Backend is available." -ForegroundColor Yellow
    if ($backendProc) {
        Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue
    }
    exit 1
}

Write-Step "Starting frontend on port $Frontend..."
Push-Location "$Root\frontend"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Backend:  http://localhost:$Backend" -ForegroundColor Green
Write-Host "  Frontend: http://localhost:$Frontend" -ForegroundColor Green
Write-Host "  Press Ctrl+C to stop services." -ForegroundColor DarkGray
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$cleanup = {
    Write-Host ""
    Write-Host "Stopping services..." -ForegroundColor Yellow
    if ($backendProc) {
        Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue
    }
    Write-Host "Stopped." -ForegroundColor Green
}

try {
    npm run dev -- --port $Frontend
} finally {
    & $cleanup
    Pop-Location
}
