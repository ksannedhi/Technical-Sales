@echo off
setlocal enabledelayedexpansion
set ROOT=%~dp0

echo.
echo  Starting Threat Intel Briefing Builder...
echo.

REM -- Kill any process already listening on port 3001 --
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3001 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
    echo  Stopped existing process on port 3001.
)

REM -- Kill any process already listening on port 5173 --
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":5173 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
    echo  Stopped existing process on port 5173.
)

REM -- Install dependencies if node_modules is missing --
if not exist "%ROOT%node_modules" (
    echo  Installing workspace packages...
    set PUPPETEER_SKIP_DOWNLOAD=true
    pushd "%ROOT%"
    call npm.cmd install
    popd
)

REM -- Create .env from .env.example if .env is missing --
if not exist "%ROOT%.env" (
    if exist "%ROOT%.env.example" (
        echo  Creating .env from .env.example...
        copy "%ROOT%.env.example" "%ROOT%.env" >nul
        echo  .env created - add your ANTHROPIC_API_KEY before generating a briefing.
    )
)

REM -- Open backend in a new window --
start "Threat Briefing - Backend" powershell -NoExit -NoProfile -ExecutionPolicy Bypass -Command "cd '%ROOT%'; npm.cmd run dev --workspace=server"

timeout /t 3 /nobreak >nul

REM -- Open frontend in a new window --
start "Threat Briefing - Frontend" powershell -NoExit -NoProfile -ExecutionPolicy Bypass -Command "cd '%ROOT%'; npm.cmd run dev --workspace=client"

echo.
echo  Backend and frontend launch windows opened.
echo.
echo  Dashboard : http://localhost:5173
echo  Backend   : http://localhost:3001
echo  Health    : http://localhost:3001/api/health
echo.
echo  Click "Generate now" in the dashboard to run the pipeline on demand.
echo  The daily briefing auto-runs at 06:00 GST while the server is running.
echo.
echo  Confirm your ANTHROPIC_API_KEY is set in .env before first use.
echo.
