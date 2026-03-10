@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "FRONTEND=%ROOT%frontend"
set "BACKEND_DEPS=%BACKEND%\.deps"
set "REQ=%BACKEND%\requirements.txt"

where python >nul 2>nul
if errorlevel 1 (
  echo [Launcher] Python not found in PATH.
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [Launcher] npm.cmd not found in PATH.
  exit /b 1
)

if not exist "%BACKEND_DEPS%" (
  echo [Launcher] Installing backend dependencies to .deps...
  python -m pip install -r "%REQ%" --target "%BACKEND_DEPS%"
  if errorlevel 1 (
    echo [Launcher] Backend dependency install failed.
    exit /b 1
  )
)

if not exist "%FRONTEND%\node_modules" (
  echo [Launcher] Installing frontend dependencies...
  pushd "%FRONTEND%"
  call npm.cmd install
  if errorlevel 1 (
    popd
    echo [Launcher] Frontend dependency install failed.
    exit /b 1
  )
  popd
)

echo [Launcher] Starting backend in new window...
start "Navigator Backend" cmd /k "set PYTHONPATH=%BACKEND_DEPS%;%BACKEND%&& cd /d %BACKEND% && python -m uvicorn app.main:app --reload --port 8000"

timeout /t 2 >nul

echo [Launcher] Starting frontend in new window...
start "Navigator Frontend" cmd /k "cd /d %FRONTEND% && npm.cmd run dev"

echo.
echo [Launcher] Security Tools Mapping Navigator is starting.
echo [Launcher] Frontend URL: http://localhost:5173
echo [Launcher] API URL: http://127.0.0.1:8000
echo [Launcher] Use Ctrl+C in each spawned terminal to stop services.

endlocal
