@echo off
set PYTHONPATH=%~dp0src
set PDG_OPEN_BROWSER=0

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$port = 8010; $url = 'http://127.0.0.1:' + $port; " ^
  "$listening = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue; " ^
  "if (-not $listening) { Start-Process cmd.exe -ArgumentList '/k','set PYTHONPATH=%~dp0src && set PDG_OPEN_BROWSER=0 && python \"%~dp0app.py\"'; Start-Sleep -Milliseconds 300 }; " ^
  "$deadline = (Get-Date).AddSeconds(12); " ^
  "while ((Get-Date) -lt $deadline) { try { Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 | Out-Null; Start-Process $url; exit 0 } catch { Start-Sleep -Milliseconds 250 } }; " ^
  "Start-Process $url"
