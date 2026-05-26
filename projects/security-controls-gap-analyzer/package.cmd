@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

set "NAME=security-controls-gap-analyzer"

REM Build a timestamped output filename next to the project folder
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmm"') do set "TS=%%i"
set "OUT=%ROOT%\..\%NAME%-%TS%.zip"

set "STAGE=%TEMP%\%NAME%-pkg-%TS%"

echo [Package] Staging to %STAGE% ...
if exist "%STAGE%" rmdir /s /q "%STAGE%"
mkdir "%STAGE%"

cmd.exe /c "robocopy "%ROOT%" "%STAGE%" /E /XD .git __pycache__ node_modules .deps backend\.deps frontend\dist frontend\.deps /XF *.pyc *.pyo .env navigator.db >nul 2>nul"

echo [Package] Creating zip...
powershell -NoProfile -Command "Compress-Archive -Path '%STAGE%\*' -DestinationPath '%OUT%' -Force"

echo [Package] Cleaning staging area...
rmdir /s /q "%STAGE%"

echo.
echo [Package] Done.
echo [Package] Output: %OUT%

endlocal
