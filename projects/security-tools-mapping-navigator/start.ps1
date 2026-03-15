$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
$BackendDeps = Join-Path $Backend ".deps"
$BackendReq = Join-Path $Backend "requirements.txt"
$FrontendNodeModules = Join-Path $Frontend "node_modules"

Write-Host "Starting Security Tools Mapping Navigator..." -ForegroundColor Cyan

if (-not (Test-Path $BackendDeps)) {
  Write-Host "Installing backend dependencies to .deps..." -ForegroundColor Yellow
  python -m pip install -r $BackendReq --target $BackendDeps
}

if (-not (Test-Path $FrontendNodeModules)) {
  Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
  Push-Location $Frontend
  npm install
  Pop-Location
}

$backendCommand = @"
`$env:PYTHONPATH='$BackendDeps;$Backend';
python -m uvicorn app.main:app --reload --port 8010
"@

$frontendCommand = @"
cd '$Frontend';
npm run dev
"@

Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCommand | Out-Null
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCommand | Out-Null

Write-Host "Backend started on http://127.0.0.1:8010" -ForegroundColor Green
Write-Host "Frontend started on http://127.0.0.1:5173" -ForegroundColor Green
Write-Host "Two new terminal windows were opened." -ForegroundColor Green
