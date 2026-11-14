# BrandGuard AI

A review desk that sits between a finished draft and the publish button. A creator pastes or
uploads content; BrandGuard checks it against the organisation's approved rules, facts and
terminology; every issue comes back with the exact passage, the rule or fact it breaks, a plain
reason and a suggested fix. People make every approval decision.

**Team Nova Blasters** · CodeNova India 2026 · Round 2 build (13 to 16 November 2026)

- **Live app:** https://brandguard-ai-lac.vercel.app
- **API:** https://brandguard-api-qtj3.onrender.com/api/health

The free server sleeps after 15 minutes without visits. A scheduled GitHub Action
(`.github/workflows/keep-awake.yml`) pings it from about 08:30 to 23:30 IST; outside those hours
the first page load can take 30 to 60 seconds while it wakes.

## Try it in two minutes

The demo uses a fictional brand, **Lumio Payroll**. All rules, facts and sample content are made
up for the demo. Sign in with one click as any of the three demo accounts:

| Account | Role | What to try |
|---|---|---|
| Asha | Creator | New draft → **Load a sample post** → **Save and run check**. Accept a fix, dispute a finding, then **Send for review**. |
| Rohan | Manager | Open the draft. With a high-risk finding still open, **Approve and escalate** sends it to the brand owner. |
| Meera | Authorised reviewer (brand owner) | Waive the high-risk finding with a reason, or decide the dispute, then **Approve**. Edit rules, facts and terms in **Brand Library**. |

Manual sign-in: `creator@brandguard.test`, `manager@brandguard.test` or
`reviewer@brandguard.test`, password `brandguard-demo`.

## Features in this build

**Brand Library** (editable by the authorised reviewer only)
- Rules with a code, category, severity and optional exact patterns. New rules start as
  *proposed* and only count once approved.
- Approved facts with a source and a valid-until date.
- Terminology list: banned term → preferred term.
- Guideline import: paste guideline text and get proposed rules to review and approve.

**Review**
- Content in by pasting, or by uploading `.txt`, `.md`, `.docx` or `.pdf` (up to 5 MB).
- **Checks while typing:** the instant exact checks run a moment after the writer stops typing and
  highlight problems in the editor before anything is saved. Nothing is stored or sent to AI.
- Each draft records its channel, audience and purpose; the AI keeps that purpose in its fixes.
- **Exact checks in code**, the same answer every time: banned terms, rule patterns
  (superlatives, promised outcomes, "click here", shouting, repeated exclamation marks),
  numbers next to a fact's keywords compared with the approved value, and expired facts.
- **AI checks** for tone, messaging, competitors and unsupported claims, using only the rules
  that have no exact pattern.
- **No citation, no finding:** an AI finding is kept only if its quote appears in the draft and
  its rule or fact code exists in the library. Everything else is dropped and counted.
- AI-written fixes get the preferred terms applied, and a fix that still breaks a rule is
  dropped. AI findings that repeat an exact finding are not shown twice.
- Highlights in the text link to their findings; each finding shows the quote, the cited rule or
  fact, the reason, the severity and a suggested fix.
- The creator accepts the fix, writes their own, or disputes it with a reason. Accepting or
  editing creates a new version.
- "How this was checked" on every review: how many findings came from code and from AI, which
  provider and model, what was sent, and how many AI findings were dropped.

**Workflow and record**
- States: Draft → In review → Changes requested / Authorised review → Approved (locked).
- A manager can approve when nothing high-risk is open. Otherwise their approval escalates to
  the authorised reviewer, who must waive each high-risk finding with a written reason, decide
  the dispute, or request changes. High-risk disputes are decided only by the reviewer.
- A finding a person has already ruled on is not raised again for the same passage.
- Comments, full version history, and an append-only audit log of who did what and when.
- **Compare versions:** any two versions side by side, removed words struck out and new words
  highlighted.
- **Review record:** a printable page (or PDF) with the approved text, who approved or escalated
  it, every finding and how it was handled, how the check ran, and the full timeline.

**Brand health**
- Most broken rules, facts and terms; findings per draft by channel; the split by risk; what
  happened to each finding; and the average time from first draft to approval. Creators see their
  own drafts, managers and reviewers see the team.

## How it works

```
frontend (React, Vercel)  ──HTTPS──▶  backend (FastAPI, Render)  ──▶  Postgres (Supabase)
                                              │
                                              └──▶  Groq API (openai/gpt-oss-120b)
```

One review run (`backend/app/engine/run.py`):

1. Exact checks on the draft (`engine/exact.py`).
2. The AI gets the draft, its purpose, up to 12 relevant rules without patterns, the approved
   facts, the exact findings already made, and the pattern rules and terms its own fixes must
   follow (`engine/ai.py`). It replies in JSON.
3. Verification drops any AI finding whose quote is not in the draft or whose code is not in the
   library (`engine/verify.py`).
4. AI rewrites fill in fixes for exact findings that had none, then every AI-written fix is
   cleaned against the terms and pattern rules.
5. Findings and a `ReviewRun` disclosure record are saved.

If the AI call fails or no key is set, the exact checks still run and the review says that the
AI step was skipped and why. The AI never approves, waives or publishes.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 19, Vite 8, Tailwind CSS 4, React Router 7 |
| Backend | Python 3.14, FastAPI, SQLAlchemy 2, PyJWT, httpx |
| Database | PostgreSQL on Supabase (SQLite locally) |
| AI | Groq API, `openai/gpt-oss-120b`, JSON mode, temperature 0 |
| Documents | python-docx, pypdf |
| Tests | pytest (22 tests: auth, exact engine, AI path with a fake model, full workflow, insights, live check) |
| Hosting | Vercel (frontend), Render (backend), Supabase (database), all on free plans |

Passwords are hashed with PBKDF2 (200,000 rounds). Sessions are signed tokens that last 12 hours.
Role checks are enforced in every API route, not only in the screens.

## Run it locally

You need Python 3.12 or newer and Node 20 or newer.

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate        # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 8000
```

To turn on the AI checks locally, copy `backend/.env.example` to `backend/.env`, add a Groq key,
and start with `uvicorn app.main:app --port 8000 --env-file .env` instead.

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173, /api is proxied to port 8000
```

Without `DATABASE_URL` the backend uses a local SQLite file. The demo brand and accounts are
created on first start. Run the tests with `python -m pytest` inside `backend`.

## Deploy

| Service | Settings |
|---|---|
| Supabase | New project. Turn the Data API off and automatic RLS on (the backend connects directly). Copy the **Session pooler** connection string. |
| Render | Web service, root `backend`, build `pip install -r requirements.txt`, start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, health check `/api/health`. Variables: see `backend/.env.example`. |
| Vercel | Import the repo with root `frontend` (Vite). Variable `VITE_API_URL` = the Render address, type Config. Redeploy after changing it. |

## Repository layout

```
backend/
  app/
    main.py            app, health, login
    config.py          settings from environment variables
    models.py          users, rules, facts, terms, drafts, versions, findings, runs, comments, audit log
    seed.py            the Lumio Payroll demo brand and accounts
    engine/            exact checks, AI checks, verification, review run, file text extraction
    routers/           Brand Library, draft/workflow and Brand health API
  tests/
frontend/
  src/pages/           Login, Drafts, NewDraft, DraftView, Record, Insights, Library
  src/LiveText.jsx     the editor that checks while you type
  src/diff.js          word-level version comparison
  src/ui.jsx           shared components
```

## Disclosure

- **External services:** Groq (AI checks), Supabase (database), Render and Vercel (hosting),
  Google Fonts (Bricolage Grotesque, Public Sans, Caveat).
- **What the AI receives:** the draft text, its channel, audience and purpose, the selected rules,
  the approved facts and the terminology list. No names or email addresses are sent.
- **AI tools used to build it:** the team used Claude Code (Anthropic) as a coding assistant for
  planning, code, tests and documentation. Every change was reviewed and tested by the team.
- **Demo data:** the Lumio Payroll brand, its rules, facts, accounts and sample posts are
  fictional.
- Open-source libraries are listed in `backend/requirements.txt` and `frontend/package.json`.

## Team

| Member | Role |
|---|---|
| Tanmoy Ghosh | Team leader, UI/UX design |
| Deepanjan Mandal | Frontend |
| Sohom Koley | Frontend |
| Auritras Maitra | Backend |
| Sounavo Majumder | ML (review engine) |
| Deepanjan Panda | Research and analysis |
