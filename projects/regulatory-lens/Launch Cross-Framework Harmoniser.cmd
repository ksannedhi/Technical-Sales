@echo off
setlocal enabledelayedexpansion
set ROOT=%~dp0

echo.
echo  Starting Cross-Framework Harmoniser...
echo.

REM -- Kill any process already listening on port 3004 --
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3004 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
    echo  Stopped existing process on port 3004.
)

REM -- Kill any process already listening on port 5179 --
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":5179 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
    echo  Stopped existing process on port 5179.
)

REM -- Install dependencies if node_modules is missing --
if not exist "%ROOT%node_modules" (
    echo  Installing workspace packages (downloading Puppeteer Chromium - takes a minute^)...
    pushd "%ROOT%"
    call npm.cmd install
    popd
)

REM -- Download Puppeteer Chromium if not already cached --
if not exist "%USERPROFILE%\.cache\puppeteer" (
    echo  Downloading Puppeteer Chromium browser...
    pushd "%ROOT%"
    call node_modules\.bin\puppeteer browsers install chrome
    popd
)

REM -- Create .env from .env.example if .env is missing --
if not exist "%ROOT%.env" (
    if exist "%ROOT%.env.example" (
        echo  Creating .env from .env.example...
        copy "%ROOT%.env.example" "%ROOT%.env" >nul
        echo  .env created - add your ANTHROPIC_API_KEY before using the tool.
    )
)

REM -- Open backend in a new window (run from root so dotenv finds .env here) --
start "Harmoniser - Backend" powershell -NoExit -NoProfile -ExecutionPolicy Bypass -Command "cd '%ROOT%'; node --watch server/index.js"

timeout /t 3 /nobreak >nul

REM -- Open frontend in a new window --
start "Harmoniser - Frontend" powershell -NoExit -NoProfile -ExecutionPolicy Bypass -Command "cd '%ROOT%'; npm.cmd run dev --workspace=client"

echo.
echo  Backend and frontend launch windows opened.
echo.
echo  Frontend  : http://localhost:5179
echo  Backend   : http://localhost:3004
echo  Health    : http://localhost:3004/api/health
echo.
echo  Confirm your ANTHROPIC_API_KEY is set in .env before first use.
echo.
