@echo off
setlocal enabledelayedexpansion
set ROOT=%~dp0

echo.
echo  Starting Phishing Analyzer...
echo.

REM -- Kill any process already listening on port 3002 --
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3002 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
    echo  Stopped existing process on port 3002.
)

REM -- Kill any process already listening on port 5175 --
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":5175 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
    echo  Stopped existing process on port 5175.
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
    )
)

REM -- Open backend in a new window --
start "Phishing Analyzer - Backend" powershell -NoExit -NoProfile -ExecutionPolicy Bypass -Command "cd '%ROOT%'; npm.cmd run dev:server"

REM -- Poll /api/health until backend is ready (max 30s) before starting frontend --
echo  Waiting for backend...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$deadline = (Get-Date).AddSeconds(30); ^
   $ready = $false; ^
   while ((Get-Date) -lt $deadline) { ^
     try { ^
       $r = Invoke-WebRequest -Uri 'http://localhost:3002/api/health' -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop; ^
       if ($r.StatusCode -eq 200) { $ready = $true; break } ^
     } catch {} ^
     Start-Sleep -Milliseconds 500 ^
   } ^
   if (-not $ready) { Write-Host '  Backend did not respond in 30s — starting frontend anyway.' }"

REM -- Open frontend in a new window --
start "Phishing Analyzer - Frontend" powershell -NoExit -NoProfile -ExecutionPolicy Bypass -Command "cd '%ROOT%'; npm.cmd run dev:client"

echo.
echo  Backend and frontend launch windows opened.
echo.
echo  Dashboard : http://localhost:5175
echo  Backend   : http://localhost:3002
echo  Health    : http://localhost:3002/api/health
echo.
echo  Confirm your OPENAI_API_KEY is set in .env before first use.
echo.
