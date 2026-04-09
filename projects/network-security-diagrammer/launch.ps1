$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Stop-ListenerOnPort {
    param(
        [int]$Port
    )

    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (-not $connections) {
        return
    }

    $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($pid in $pids) {
        try {
            Stop-Process -Id $pid -Force -ErrorAction Stop
            Write-Host "Stopped existing process on port $Port (PID $pid)." -ForegroundColor Yellow
        } catch {
            Write-Host "Could not stop process on port $Port (PID $pid)." -ForegroundColor DarkYellow
        }
    }
}

Write-Host "Starting Network Security Diagrammer..." -ForegroundColor Cyan

Stop-ListenerOnPort -Port 8787
Stop-ListenerOnPort -Port 5173

if (-not (Test-Path (Join-Path $root "node_modules"))) {
    Write-Host "Installing workspace packages..." -ForegroundColor Yellow
    Push-Location $root
    npm.cmd install
    Pop-Location
}

if (-not (Test-Path (Join-Path $root ".env")) -and (Test-Path (Join-Path $root ".env.example"))) {
    Write-Host "Creating .env from .env.example..." -ForegroundColor Yellow
    Copy-Item (Join-Path $root ".env.example") (Join-Path $root ".env")
}

$serverCommand = "cd '$root'; npm.cmd run dev:backend"
$clientCommand = "cd '$root'; npm.cmd run dev:frontend"

Start-Process powershell -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $serverCommand)
Start-Sleep -Seconds 3
Start-Process powershell -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $clientCommand)

Write-Host "Backend and frontend launch windows opened." -ForegroundColor Green
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Green
Write-Host "Backend:  http://localhost:8787" -ForegroundColor Green
Write-Host "Health:   http://localhost:8787/api/health" -ForegroundColor Green
Write-Host ""
Write-Host "If OpenAI-backed generation does not activate, confirm OPENAI_API_KEY is present in .env." -ForegroundColor DarkYellow
