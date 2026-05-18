# setup.ps1 — One-time setup for presales-skills plugin (Windows)
# Run from the cloned repo root: .\skills\presales-skills\setup.ps1

param(
    [string]$RepoRoot = (Resolve-Path "$PSScriptRoot\..\..").Path
)

$marketplaceName = "ksannedhi-Technical-Sales"
$marketplacePath = "$env:USERPROFILE\.claude\plugins\marketplaces\$marketplaceName"
$knownMarketplacesPath = "$env:USERPROFILE\.claude\plugins\known_marketplaces.json"

Write-Host "`nPresales Skills — Plugin Setup" -ForegroundColor Cyan
Write-Host "Repo root: $RepoRoot"

# Step 1: Create junction
if (Test-Path $marketplacePath) {
    Write-Host "[skip] Junction already exists at $marketplacePath" -ForegroundColor Yellow
} else {
    New-Item -ItemType Junction -Path $marketplacePath -Target $RepoRoot | Out-Null
    Write-Host "[ok]   Junction created -> $RepoRoot" -ForegroundColor Green
}

# Step 2: Register marketplace
if (-not (Test-Path $knownMarketplacesPath)) {
    Write-Error "known_marketplaces.json not found at $knownMarketplacesPath. Is Claude Code installed?"
    exit 1
}

$json = Get-Content $knownMarketplacesPath -Raw | ConvertFrom-Json
$existing = $json.PSObject.Properties[$marketplaceName]

if ($existing) {
    Write-Host "[skip] Marketplace '$marketplaceName' already registered" -ForegroundColor Yellow
} else {
    $entry = [PSCustomObject]@{
        source = [PSCustomObject]@{
            source = "github"
            repo   = "ksannedhi/Technical-Sales"
        }
        installLocation = $marketplacePath
        lastUpdated     = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss.fffZ")
    }
    $json | Add-Member -NotePropertyName $marketplaceName -NotePropertyValue $entry
    $json | ConvertTo-Json -Depth 10 | Set-Content $knownMarketplacesPath -Encoding utf8
    Write-Host "[ok]   Marketplace registered in known_marketplaces.json" -ForegroundColor Green
}

Write-Host "`nSetup complete. Now inside Claude Code run:" -ForegroundColor Cyan
Write-Host "  /plugin install presales-skills@ksannedhi-Technical-Sales"
Write-Host "  /reload-plugins`n"
