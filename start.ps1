# Script for powershell to start a local server and open a browser preview

$AppDir = "./app"

Set-Location $AppDir

Write-Host "Start browser..." -ForegroundColor Cyan
Start-Process "http://localhost:8000"

Write-Host "Start Python server..." -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop..." -ForegroundColor Gray
python -m http.server 8000
