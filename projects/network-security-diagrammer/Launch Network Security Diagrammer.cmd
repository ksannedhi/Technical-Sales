@echo off
setlocal enabledelayedexpansion
set ROOT=%~dp0

echo.
echo  Starting Network Security Diagrammer...
echo.

REM -- Kill any process already listening on port 8787 --
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8787 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
    echo  Stopped existing process on port 8787.
)

REM -- Kill any process already listening on port 5173 --
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":5173 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
    echo  Stopped existing process on port 5173.
)

REM -- Install dependencies if node_modules is missing --
if not exist "%ROOT%node_modules" (
    echo  Installing workspace packages...
    pushd "%ROOT%"
    call npm.cmd install
    popd
)

REM -- Create .env from .env.example if .env is missing --
if not exist "%ROOT%.env" (
    if exist "%ROOT%.env.example" (
        echo  Creating .env from .env.example...
        copy "%ROOT%.env.example" "%ROOT%.env" >nul
        echo  .env created - add your OPENAI_API_KEY before first use.
    )
)

REM -- Open backend in a new window --
start "Network Security Diagrammer - Backend" powershell -NoExit -NoProfile -ExecutionPolicy Bypass -Command "cd '%ROOT%'; npm.cmd run dev:backend"

timeout /t 3 /nobreak >nul

REM -- Open frontend in a new window --
start "Network Security Diagrammer - Frontend" powershell -NoExit -NoProfile -ExecutionPolicy Bypass -Command "cd '%ROOT%'; npm.cmd run dev:frontend"

echo.
echo  Backend and frontend launch windows opened.
echo.
echo  Dashboard : http://localhost:5173
echo  Backend   : http://localhost:8787
echo  Health    : http://localhost:8787/api/health
echo.
echo  Confirm your OPENAI_API_KEY is set in .env before first use.
echo.
