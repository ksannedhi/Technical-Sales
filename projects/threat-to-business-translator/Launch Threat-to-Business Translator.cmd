@echo off
setlocal enabledelayedexpansion
set ROOT=%~dp0
set BACKEND=%ROOT%backend
set VENV_PYTHON=%BACKEND%\.venv\Scripts\python.exe
set VENV_ACTIVATE=%BACKEND%\.venv\Scripts\activate.bat

echo.
echo  Starting CyberRisk Narrator...
echo.

REM -- Create Python virtual environment if missing --
if not exist "%VENV_PYTHON%" (
    echo  Creating backend virtual environment...
    pushd "%BACKEND%"
    python -m venv .venv
    popd
)

REM -- Install backend requirements if not already done --
if not exist "%BACKEND%\.venv\installed.ok" (
    echo  Installing backend requirements...
    pushd "%BACKEND%"
    call "%VENV_PYTHON%" -m pip install -r requirements.txt
    echo. > ".venv\installed.ok"
    popd
)

REM -- Install frontend packages if node_modules is missing --
if not exist "%ROOT%frontend\node_modules" (
    echo  Installing frontend packages...
    pushd "%ROOT%frontend"
    call npm.cmd install
    popd
)

REM -- Open backend in a new window (activate venv then run uvicorn) --
start "CyberRisk Narrator - Backend" powershell -NoExit -NoProfile -ExecutionPolicy Bypass -Command "cd '%BACKEND%'; .\.venv\Scripts\Activate.ps1; uvicorn app.main:app --reload --no-access-log"

timeout /t 3 /nobreak >nul

REM -- Open frontend in a new window --
start "CyberRisk Narrator - Frontend" powershell -NoExit -NoProfile -ExecutionPolicy Bypass -Command "cd '%ROOT%frontend'; npm.cmd run dev"

echo.
echo  Backend and frontend launch windows opened.
echo.
echo  Dashboard : http://127.0.0.1:5178
echo  API       : http://127.0.0.1:8000
echo.
