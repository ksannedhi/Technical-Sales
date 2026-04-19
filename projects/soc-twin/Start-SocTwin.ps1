param(
  [switch]$SkipPrep
)

$ErrorActionPreference = 'Stop'

function Test-Command($name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

if (-not (Test-Command 'node')) {
  Write-Error 'Node.js is not installed or not on PATH.'
}
if (-not (Test-Command 'npm.cmd')) {
  Write-Error 'npm.cmd is not available on PATH.'
}

Set-Location $PSScriptRoot

$backendNodeModules = Join-Path $PSScriptRoot 'node_modules'
$frontendPath = Join-Path $PSScriptRoot 'frontend'
$frontendNodeModules = Join-Path $frontendPath 'node_modules'

if (-not (Test-Path $backendNodeModules)) {
  Write-Host '[Launcher] Installing backend dependencies...'
  & npm.cmd install
}

if (-not (Test-Path $frontendNodeModules)) {
  Write-Host '[Launcher] Installing frontend dependencies...'
  Push-Location $frontendPath
  try {
    & npm.cmd install
  } finally {
    Pop-Location
  }
}

Write-Host '[Launcher] Starting backend in new window...'
Start-Process powershell -ArgumentList @(
  '-NoExit',
  '-Command',
  "Set-Location '$PSScriptRoot'; npm.cmd run demo:start"
) | Out-Null

Start-Sleep -Seconds 2

if (-not $SkipPrep) {
  Write-Host '[Launcher] Running demo prep (reset + seed + health)...'
  & npm.cmd run demo:prep
}

Write-Host '[Launcher] Starting frontend in new window...'
Start-Process powershell -ArgumentList @(
  '-NoExit',
  '-Command',
  "Set-Location '$frontendPath'; npm.cmd run dev"
) | Out-Null

Write-Host ''
Write-Host '[Launcher] SOC Twin is starting.'
Write-Host '[Launcher] Frontend URL: http://localhost:5173'
Write-Host '[Launcher] API URL: http://localhost:3001'
Write-Host '[Launcher] Use Ctrl+C in each spawned terminal to stop services.'