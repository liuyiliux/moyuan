@echo off
title Moyuan Startup
setlocal enabledelayedexpansion

set ROOT=%~dp0
set ROOT=%ROOT:~0,-1%
set BACKEND_PORT=8005
set FRONTEND_PORT=5173
set PYTHON=%ROOT%\backend\venv\Scripts\python.exe

echo.
echo ========================================
echo   Moyuan - Multi-modal Knowledge Base
echo ========================================
echo.

:: ---- 1. kill old processes ----
echo [1/6] Cleaning old ports...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%BACKEND_PORT%"') do (
    if not "%%a"=="0" taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%FRONTEND_PORT%"') do (
    if not "%%a"=="0" taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: ---- 2. check python venv ----
echo [2/6] Checking Python...
if not exist "%PYTHON%" (
    echo   Creating venv...
    cd /d "%ROOT%\backend"
    python -m venv venv 2>nul
    if not exist "%PYTHON%" (
        echo   [ERROR] Failed to create venv
        pause
        exit /b 1
    )
    echo   Installing dependencies...
    "%PYTHON%" -m pip install -r requirements.txt -q 2>nul
    echo   Done.
)

:: ---- 3. .env ----
if not exist "%ROOT%\backend\.env" (
    if exist "%ROOT%\backend\.env.example" (
        copy "%ROOT%\backend\.env.example" "%ROOT%\backend\.env" >nul
    )
)

:: ---- 4. database ----
echo [3/6] Initializing database...
cd /d "%ROOT%\backend"
"%PYTHON%" init_db.py 2>nul
echo   Done.

:: ---- 5. frontend deps ----
echo [4/6] Checking frontend...
if not exist "%ROOT%\frontend\node_modules" (
    echo   Installing frontend deps...
    cd /d "%ROOT%\frontend"
    call npm install 2>nul
)
echo   Done.

:: ---- 6. start backend ----
echo [5/6] Starting backend...
cd /d "%ROOT%\backend"
start "Moyuan-Backend" /MIN cmd /c "title Moyuan-Backend && "%PYTHON%" -m uvicorn app.main:app --host 0.0.0.0 --port %BACKEND_PORT%"
timeout /t 3 /nobreak >nul

:: ---- 7. start frontend ----
echo [6/6] Starting frontend...
cd /d "%ROOT%\frontend"
start "Moyuan-Frontend" /MIN cmd /c "title Moyuan-Frontend && npm run dev -- --port %FRONTEND_PORT%"

echo.
echo =========================================
echo   Backend : http://localhost:%BACKEND_PORT%
echo   Frontend: http://localhost:%FRONTEND_PORT%
echo =========================================
echo.

timeout /t 2 /nobreak >nul
start http://localhost:%FRONTEND_PORT%

echo All services started.
echo Close this window or press any key to stop backend.
pause >nul
taskkill /FI "WINDOWTITLE eq Moyuan-Backend*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Moyuan-Frontend*" /F >nul 2>&1
