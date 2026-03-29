@echo off
set "APP_DIR=%~dp0"
set "PYTHONPATH=%APP_DIR%src"
set "PDG_OPEN_BROWSER=1"
set "PYTHON_EXE=C:\Python313\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=python"

"%PYTHON_EXE%" "%APP_DIR%app.py"
