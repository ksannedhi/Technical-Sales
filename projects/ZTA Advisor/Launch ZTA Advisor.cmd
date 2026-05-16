@echo off
title ZTA Advisor
echo.
echo  Starting ZTA Advisor...
echo  Backend  ^> http://localhost:3005
echo  Frontend ^> http://localhost:5180
echo.

start "ZTA Advisor - Backend" cmd /k "cd /d "%~dp0backend" && node --env-file=../.env --watch server.js"
start "ZTA Advisor - Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

timeout /t 4 /nobreak >nul
start http://localhost:5180
