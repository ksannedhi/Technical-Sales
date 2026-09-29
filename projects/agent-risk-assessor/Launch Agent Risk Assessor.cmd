@echo off
title Agent Risk Assessor
echo.
echo  Starting Agent Risk Assessor...
echo  Backend  ^> http://localhost:3006
echo  Frontend ^> http://localhost:5181
echo.

if not exist "%~dp0backend\node_modules" (cd /d "%~dp0backend" && set PUPPETEER_SKIP_DOWNLOAD=true && call npm install)
if not exist "%~dp0frontend\node_modules" (cd /d "%~dp0frontend" && call npm install)
if not exist "%~dp0.env" copy "%~dp0.env.example" "%~dp0.env" >nul

start "Agent Risk Assessor - Backend" cmd /k "cd /d "%~dp0backend" && node --env-file-if-exists=../.env --watch server.js"
start "Agent Risk Assessor - Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

timeout /t 4 /nobreak >nul
start http://localhost:5181
