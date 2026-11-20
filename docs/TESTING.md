# How BrandGuard AI is tested

Four layers, from the engine up to the whole product in a browser. Everything except the AI evaluation
and the load test runs on every push in GitHub Actions (`.github/workflows/tests.yml`); the AI evaluation
runs every night (`.github/workflows/reliability-ai.yml`). Run the Python commands with the backend's
virtual environment active (`backend/.venv`, made by the setup scripts: `source .venv/bin/activate`,
or `.venv\Scripts\activate` on Windows).

| Layer | What it covers | Run it |
|---|---|---|
| Backend tests | 78 tests: auth and roles, brand isolation, the exact engine, the AI path with a fake model (verification, rate limits, failure), the full workflow, image review (measurements, findings, fixes, links), guideline gaps, hardening (stale pages, double clicks, limits, renamed files, channel limits), demo copies | `cd backend && python -m pytest` |
| Reliability gate | The 80 test drafts through the real check with exact checks only; fails if any planted problem is missed or a clean draft is flagged | part of the backend tests; also `python -m evals.run` |
| Browser tests | The main journeys clicked through in Chromium against a real backend and website, plus an accessibility scan of each screen | `cd frontend && npm run e2e` |
| AI evaluation | The 80 test drafts through the full check with AI | `cd backend && python -m evals.run --mode ai --save` |
| Load test | Many people using the live demo at once | `cd backend && python -m evals.load <API address> --people 15` |

## Measured reliability

The test drafts are in `backend/evals/cases/`, 40 per demo brand: 30 with problems planted on purpose
(each listing the rule that should catch it) and 10 clean. A catch counts only when the check cites
that rule on that passage. Anything else it flags counts as a false alarm, even if it is a fair point.

| Run | Brand | Planted problems caught | Of what it flagged, real | Clean drafts left alone |
|---|---|---|---|---|
| Exact checks (every push) | Lumio Payroll | 27 of 27 (100%) | 100% | 10 of 10 |
| Exact checks (every push) | Fizzbox | 29 of 29 (100%) | 100% | 10 of 10 |
| Full check with AI, 19 Nov run 1 | Lumio Payroll | 34 of 35 (97.1%) | 87.2% | 9 of 10 |
| Full check with AI, 19 Nov run 1 | Fizzbox | 37 of 37 (100%) | 94.9% | 9 of 10 |
| Full check with AI, 19 Nov run 2 | Lumio Payroll | 33 of 35 (94.3%) | 78.6% | 10 of 10 |
| Full check with AI, 19 Nov run 2 | Fizzbox | 37 of 37 (100%) | 92.5% | 9 of 10 |

The AI part varies between runs of the same code, even at temperature 0, which is why the page shows
a trend and not one number. The exact checks do not vary.

What the AI runs get wrong, honestly: twice it missed fear-based urgency ("you will regret waiting"); once
it flagged the insult to a competitor ("Their support is terrible.") instead of the competitor's name we
listed, which our strict scoring counts as one miss and one false alarm. Most false alarms are claims the
AI thinks need a fact ("payroll now takes a coffee break") or tone calls ("Find your nearest store." as too
corporate). None of them is a high-risk problem being missed.
The latest numbers, every miss and every false alarm are on the Reliability page in the app.

## Browser tests

`frontend/e2e/journeys.spec.js`, against a fresh database with no AI key:

1. **Lumio, end to end:** write a draft with the sample image, see problems while typing, accept all
   low-risk fixes, accept the number fix, describe the image, re-check, send; the manager approves and
   it escalates; the brand owner waives each high-risk finding with a reason and approves; the record.
2. **Fizzbox:** "BUY NOW" is not flagged, "Healthy" is, while typing.
3. **A new brand:** sign up, add a teammate, write a draft, see that you cannot approve your own, sign
   in as the teammate and approve it.
4. **Every main page** loads and passes the accessibility scan; Ctrl+K navigation works.
5. **Dark theme:** the same screens pass the accessibility scan with the dark theme on.

Accessibility: axe-core with the WCAG 2 A and AA rules on nine screens (sign-in, drafts, new draft, a
draft, the record, Brand health, Brand Library, Reliability, Team). The tests fail on any serious or
critical problem. Animations are turned off for the scan so colours are measured at rest.

These tests found two real bugs, both fixed: accepting the "Lumio Pay" fix also changed the "Lumio Pay"
inside "Lumio Payroll", and after "Accept all low-risk fixes" the number fix on the same sentence no
longer applied.

## Load test (live server, free plan)

15 people at once, each starting a demo copy, listing drafts, opening one, checking text while typing
three times and opening Brand health. No AI calls. Run on 19 November 2026.

| Request | Median | 95% under |
|---|---|---|
| Start a demo copy | 7.5 s | 8.2 s |
| List drafts | 2.3 s | 3.2 s |
| Open a draft | 1.7 s | 1.8 s |
| Check while typing | 1.0 s | 1.5 s |
| Brand health | 0.9 s | 1.2 s |

105 requests, 0 failed. Before a fix that day, starting a demo copy took 37 s when 15 started together
(password hashing for each copy's accounts on a shared CPU); one person alone takes about 2 s.

## "Try to break it" pass

What we tried, and what happens now:

| Tried | Result |
|---|---|
| Empty draft, empty title | The form and the API refuse it with a clear message |
| 20,001 characters of content | "Content is too long (at most 20,000 characters)." |
| A zip renamed to .pdf, a PDF renamed to .docx, a corrupt PDF | A message saying what is wrong; no crash |
| A text file renamed to .png, a 3000 px image, a 40+ megapixel image | Refused, shrunk to 1280 px, refused (in that order) |
| Hindi, emoji and mixed text | Checked correctly (in the test drafts) |
| A rule pattern that is not a valid regular expression | Refused when saved, with the error |
| Double-clicking Run check, Post comment, Approve | One check, one comment, one approval |
| Two people acting on the same draft | The second is told who acted first, and the page refreshes |
| Refreshing in the middle of writing a draft | The text is restored |
| The AI provider failing or rate limited | Exact checks still run; the review says the AI step did not run, with a retry button |
| The server asleep | A "Waking the server…" notice with a counter; the request finishes by itself |
| Going offline | An offline notice; nothing typed is lost |
| A brand with no drafts, an empty library, no findings | Each screen says what to do next |
| Approving your own draft | Refused: someone else on the team has to |
| Opening another brand's draft, image or rule by its number | Not found |
