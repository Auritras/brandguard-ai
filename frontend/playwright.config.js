// Browser tests of the main journeys, against a real backend (fresh SQLite database, no AI key) and the
// real frontend. Run: npx playwright test   (CI installs Chromium and runs the same).
import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// A new database for every run. The config is read again by the test worker, so the name is kept in
// an environment variable the worker inherits.
process.env.E2E_DB ??= join(tmpdir(), `brandguard-e2e-${Date.now()}.db`)
const db = process.env.E2E_DB
// The backend's own virtual environment (made by scripts/dev.sh or dev.ps1) when there is one, else `python`.
const venv = process.platform === 'win32'
  ? join(process.cwd(), '..', 'backend', '.venv', 'Scripts', 'python.exe')
  : join(process.cwd(), '..', 'backend', '.venv', 'bin', 'python')
const python = process.env.E2E_PYTHON || (existsSync(venv) ? `"${venv}"` : 'python')

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  // Reduced motion: no animation is mid-way when the accessibility scan measures colours.
  use: { baseURL: 'http://127.0.0.1:5174', trace: 'retain-on-failure', screenshot: 'only-on-failure', contextOptions: { reducedMotion: 'reduce' } },
  webServer: [
    {
      command: `${python} -m uvicorn app.main:app --port 8765`,
      cwd: '../backend',
      url: 'http://127.0.0.1:8765/api/health',
      reuseExistingServer: false,
      timeout: 60_000,
      env: { DATABASE_URL: 'sqlite:///' + db.split('\\').join('/'), GROQ_API_KEY: '', BRANDGUARD_RATE_LIMITS: 'off',
        CORS_ORIGINS: 'http://127.0.0.1:5174', JWT_SECRET: 'e2e-only-secret-not-used-anywhere-else' },
    },
    {
      command: 'npx vite --host 127.0.0.1 --port 5174 --strictPort',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: false,
      timeout: 60_000,
      env: { VITE_API_URL: 'http://127.0.0.1:8765' },
    },
  ],
})
