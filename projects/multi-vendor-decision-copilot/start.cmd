@echo off
setlocal

set "APP_DIR=%~dp0"
set "PYTHONPATH=%APP_DIR%src"
set "PYTHON_EXE=C:\Python313\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=python"

echo Starting Multi-Vendor Decision Copilot on http://localhost:8501 ...
"%PYTHON_EXE%" -m streamlit run "%APP_DIR%app.py" --server.port 8501 --server.headless false --browser.gatherUsageStats false
