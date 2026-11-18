# One command to run BrandGuard AI on your own computer (Windows PowerShell):
#   powershell -ExecutionPolicy Bypass -File scripts\dev.ps1
# Installs what is missing, then starts the backend (http://localhost:8000) and the website
# (http://localhost:5173). Close the backend window to stop it. Uses a local SQLite database, never a live one.
# AI checks: put GROQ_API_KEY=... in backend\.env (only that key is read from it here).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
if (-not (Get-Command python -ErrorAction SilentlyContinue)) { Write-Output 'Python 3.12 or newer is needed: https://www.python.org/downloads/'; exit 1 }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Write-Output 'Node 20 or newer is needed: https://nodejs.org/'; exit 1 }

if (-not (Test-Path 'backend\.venv')) {
  Write-Output 'Setting up the backend (first run only)...'
  python -m venv backend\.venv
  & backend\.venv\Scripts\python.exe -m pip install -q -r backend\requirements.txt
}
if (-not (Test-Path 'frontend\node_modules')) {
  Write-Output 'Setting up the website (first run only)...'
  Push-Location frontend; npm ci --silent; Pop-Location
}

$key = ''
if (Test-Path 'backend\.env') {
  $line = Get-Content 'backend\.env' | Where-Object { $_ -match '^GROQ_API_KEY=' } | Select-Object -First 1
  if ($line) { $key = ($line -replace '^GROQ_API_KEY=', '').Trim('"') }
}
if ($key) { Write-Output 'AI checks: on (key from backend\.env)' } else { Write-Output 'AI checks: off (exact checks only). Add GROQ_API_KEY to backend\.env to turn them on.' }

if (-not (Test-Path 'backend\brandguard.db')) {
  Write-Output 'Building the demo drafts in the local database (first run only, about a minute)...'
  Push-Location backend
  $env:DATABASE_URL = ''; $env:GROQ_API_KEY = ''
  & .\.venv\Scripts\python.exe -m app.reset_demo --no-ai --yes | Out-Null
  Pop-Location
}

# The backend runs in its own window with only the AI key set, so a DATABASE_URL elsewhere is never used.
$cmd = "`$env:DATABASE_URL=''; `$env:GROQ_API_KEY='$key'; Set-Location '$root\backend'; .\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000"
Start-Process powershell -ArgumentList '-NoExit', '-Command', $cmd
Write-Output 'Open http://localhost:5173 and choose Try the demo.'
Set-Location frontend
npm run dev -- --port 5173
