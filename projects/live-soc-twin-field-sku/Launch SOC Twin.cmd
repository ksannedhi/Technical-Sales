@echo off
setlocal enabledelayedexpansion
set ROOT=%~dp0
set FRONTEND=%ROOT%frontend

echo.
echo  Starting SOC Twin...
echo.

REM -- Check for Node.js --
where node >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Node.js is not installed or not on PATH.
    pause
    exit /b 1
)

REM -- Check for npm --
where npm.cmd >nul 2>&1
if errorlevel 1 (
    echo  ERROR: npm is not available on PATH.
    pause
    exit /b 1
)

REM -- Install backend dependencies if missing --
if not exist "%ROOT%node_modules" (
    echo  Installing backend dependencies...
    pushd "%ROOT%"
    call npm.cmd install
    popd
)

REM -- Install frontend dependencies if missing --
if not exist "%FRONTEND%\node_modules" (
    echo  Installing frontend dependencies...
    pushd "%FRONTEND%"
    call npm.cmd install
    popd
)

REM -- Open backend in a new window --
echo  Starting backend...
start "SOC Twin - Backend" powershell -NoExit -NoProfile -ExecutionPolicy Bypass -Command "cd '%ROOT%'; npm.cmd run demo:start"

timeout /t 2 /nobreak >nul

REM -- Run demo prep in this window (reset + seed + health check) --
echo  Running demo prep (reset + seed + health)...
pushd "%ROOT%"
call npm.cmd run demo:prep
popd

REM -- Open frontend in a new window --
echo  Starting frontend...
start "SOC Twin - Frontend" powershell -NoExit -NoProfile -ExecutionPolicy Bypass -Command "cd '%FRONTEND%'; npm.cmd run dev"

echo.
echo  SOC Twin is starting.
echo.
echo  Frontend : http://localhost:5173
echo  API      : http://localhost:3001
echo.
echo  Use Ctrl+C in each spawned terminal to stop services.
echo.
