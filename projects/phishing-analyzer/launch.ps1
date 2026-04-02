$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$client = Join-Path $root "client"
$server = Join-Path $root "server"

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

Write-Host "Starting Phishing Analyzer..." -ForegroundColor Cyan

Stop-ListenerOnPort -Port 3001
Stop-ListenerOnPort -Port 5173

if (-not (Test-Path (Join-Path $root "node_modules"))) {
    Write-Host "Installing workspace packages..." -ForegroundColor Yellow
    Push-Location $root
    npm.cmd install
    Pop-Location
}

if (-not (Test-Path (Join-Path $root ".env"))) {
    if (Test-Path (Join-Path $root ".env.example")) {
        Write-Host "Creating .env from .env.example..." -ForegroundColor Yellow
        Copy-Item (Join-Path $root ".env.example") (Join-Path $root ".env")
    }
}

$serverCommand = "cd '$root'; npm.cmd run dev:server"
$clientCommand = "cd '$root'; npm.cmd run dev:client"

Start-Process powershell -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $serverCommand)
Start-Sleep -Seconds 3
Start-Process powershell -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $clientCommand)

Write-Host "Backend and frontend launch windows opened." -ForegroundColor Green
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Green
Write-Host "Backend:  http://localhost:3001" -ForegroundColor Green
Write-Host "Health:   http://localhost:3001/api/health" -ForegroundColor Green
Write-Host "" 
Write-Host "If this is your first run, confirm your OPENAI_API_KEY is present in .env." -ForegroundColor DarkYellow
