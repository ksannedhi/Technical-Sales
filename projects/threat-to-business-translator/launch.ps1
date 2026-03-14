$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$venvPython = Join-Path $backend ".venv\Scripts\python.exe"

Write-Host "Starting Threat-to-Business Translator..." -ForegroundColor Cyan

if (-not (Test-Path $venvPython)) {
    Write-Host "Creating backend virtual environment..." -ForegroundColor Yellow
    Push-Location $backend
    python -m venv .venv
    Pop-Location
}

if (-not (Test-Path (Join-Path $backend ".venv\installed.ok"))) {
    Write-Host "Installing backend requirements..." -ForegroundColor Yellow
    Push-Location $backend
    & $venvPython -m pip install -r requirements.txt
    New-Item -ItemType File -Force ".venv\installed.ok" | Out-Null
    Pop-Location
}

if (-not (Test-Path (Join-Path $frontend "node_modules"))) {
    Write-Host "Installing frontend packages..." -ForegroundColor Yellow
    Push-Location $frontend
    npm install
    Pop-Location
}

$backendCommand = "cd '$backend'; .\.venv\Scripts\Activate.ps1; uvicorn app.main:app --reload"
$frontendCommand = "cd '$frontend'; npm run dev"

Start-Process powershell -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $backendCommand)
Start-Sleep -Seconds 3
Start-Process powershell -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $frontendCommand)

Write-Host "Backend and frontend launch windows opened." -ForegroundColor Green
Write-Host "API: http://127.0.0.1:8000" -ForegroundColor Green
Write-Host "UI:  http://127.0.0.1:5173" -ForegroundColor Green