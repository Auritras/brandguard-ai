#!/usr/bin/env sh
# One command to run BrandGuard AI on your own computer (macOS or Linux):
#   sh scripts/dev.sh
# Installs what is missing, then starts the backend (http://localhost:8000) and the website
# (http://localhost:5173). Stop both with Ctrl+C. Uses a local SQLite database, never a live one.
# AI checks: put GROQ_API_KEY=... in backend/.env (only that key is read from it here).
set -e
cd "$(dirname "$0")/.."
command -v python3 >/dev/null || { echo "Python 3.12 or newer is needed: https://www.python.org/downloads/"; exit 1; }
command -v npm >/dev/null || { echo "Node 20 or newer is needed: https://nodejs.org/"; exit 1; }

if [ ! -d backend/.venv ]; then
  echo "Setting up the backend (first run only)..."
  python3 -m venv backend/.venv
  backend/.venv/bin/pip install -q -r backend/requirements.txt
fi
if [ ! -d frontend/node_modules ]; then
  echo "Setting up the website (first run only)..."
  (cd frontend && npm ci --silent)
fi

KEY=""
[ -f backend/.env ] && KEY=$(grep -E '^GROQ_API_KEY=' backend/.env | head -1 | cut -d= -f2- | tr -d '"')
[ -n "$KEY" ] && echo "AI checks: on (key from backend/.env)" || echo "AI checks: off (exact checks only). Add GROQ_API_KEY to backend/.env to turn them on."

if [ ! -f backend/brandguard.db ]; then
  echo "Building the demo drafts in the local database (first run only, about a minute)..."
  (cd backend && env -u DATABASE_URL GROQ_API_KEY="" .venv/bin/python -m app.reset_demo --no-ai --yes >/dev/null)
fi

(cd backend && env -u DATABASE_URL GROQ_API_KEY="$KEY" .venv/bin/python -m uvicorn app.main:app --port 8000) &
BACK=$!
trap 'kill $BACK 2>/dev/null' EXIT INT TERM
echo "Open http://localhost:5173 and choose Try the demo."
cd frontend && npm run dev -- --port 5173
