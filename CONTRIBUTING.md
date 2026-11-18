# Working on BrandGuard AI

1. Run it: `sh scripts/dev.sh` (macOS, Linux) or `powershell -ExecutionPolicy Bypass -File scripts\dev.ps1`
   (Windows). It uses a local SQLite database; it never reads `DATABASE_URL` from `backend/.env`.
2. Before you push, run what CI runs:
   - `cd backend && python -m pytest` (includes the reliability gate)
   - `cd frontend && npm run lint && npm run build`
   - `cd frontend && npm run e2e` (browser tests; first time: `npx playwright install chromium`)
3. Changing a rule pattern, the exact checks or the AI prompt? Run `python -m evals.run` (and with
   `--mode ai` if you have a key) and look at what was missed or wrongly flagged. Add a test draft to
   `backend/evals/cases/` for any bug you fix in the checks.
4. Never commit `backend/.env`. Keys and database addresses go in Render and Vercel settings.

Conventions: plain English in the interface (short sentences, no jargon); every judgement the product
makes is either measured in code or verified against the draft; people make every decision.
