# Changelog

## Round 3 build (19 to 21 November 2026)

### The three improvements we named in Round 2

Each one is delivered as named. Where a part works differently from what we described, it says so.

**1. Image review** (named: palette and contrast, logo use, text inside images, missing image descriptions)

| Part | Delivered | How |
|---|---|---|
| Palette | Yes | The image's main colours are measured in code and compared with the brand's colours (CIE colour difference; white, black and greys always pass). Off-brand colours covering 8% or more of the image are flagged, with swatches. |
| Contrast | Yes | Each line of text in the image is located, and its text and background colours are measured on the pixels. The WCAG 2.2 AA ratio is computed in code: 4.5:1, or 3:1 for large text. |
| Logo use | Yes | The logo is located in the image; its proportions and main colour are measured against the brand's official logo file (stretched, squashed, recoloured, too small). Rotated, cropped or crowded comes from the vision model's reading. |
| Text inside images | Yes | The vision model reads the text; it then goes through exactly the same exact and AI checks as the draft's own text. |
| Missing descriptions | Yes | An image with no description is a finding; its suggested fix is a description written by the vision model, accepted with one click. |
| Brand palette and logo | Yes (added) | A "Colours and logo" tab in the Brand Library for the owner. |

The vision model (Groq, `qwen/qwen3.8-27b`) only *reads*; every judgement is measured in code, so the
same image always gives the same result. Without an AI key, palette and descriptions still work.

**2. Guideline-gap insights** (named: unclear rules, with the examples and a suggested rewrite)

| Part | Delivered | How |
|---|---|---|
| Unclear rules | Yes | For every rule, how often what it flags is waived, dismissed or disputed instead of fixed. Rules argued with in a third or more of at least two findings are listed first. |
| The examples | Yes | The real passages, what happened to each, the reason people gave, and a link to the draft. |
| A suggested rewrite | Yes | The brand owner asks the AI for a clearer wording built from those cases, sees it as a word-by-word diff, edits it and accepts it. Patterns are offered only if they compile. |
| Rule history | Yes (added) | Earlier wordings, who changed them, when and why. |
| Before and after | Yes (added) | For a rewritten rule, how often it was argued with before the change and since. |
| Missing rules | Yes (added) | Reads change requests, comments and waivers and proposes rules no current rule covers, for the owner to approve. |

**3. Measured reliability** (named: about 40 seeded drafts per brand, run on every change, shown in the product)

| Part | Delivered | How |
|---|---|---|
| About 40 seeded drafts per brand | Yes | 40 per demo brand: 30 with problems planted on purpose, 10 clean. They include Hindi, emoji, and Fizzbox hype that must not be flagged. `backend/evals/cases/` |
| Run on every change | Yes, in two parts | The exact checks run on every push in CI, and a change that misses a planted problem fails the build. The full check with AI runs on demand (`python -m evals.run --mode ai --save`); it needs an AI key, which is not stored in CI. |
| Shown in the product | Yes | A Reliability page: catch rate, how much of what it flags is real, clean drafts left alone, trend over runs, per-rule bars, and every miss and false alarm with its draft. |

### Reliability under normal use
- Acting on an out-of-date page (someone else approved or sent it back first) is refused with who did
  what, and the page reloads to the latest.
- Double clicks: a second check of the same version within 15 seconds returns the first result; the same
  comment twice is kept once; buttons are disabled while they work.
- Length limits on every field (20,000 characters of content); uploads checked by content, so a renamed
  file gets a clear message; corrupt files never crash.
- Rate limits per network on demo copies, sign-ups, sign-ins and checks.
- "Waking the server…" notice with a counter when the free server is starting; an offline notice; reads
  retry once; a crashed screen offers a reload instead of a blank page.
- New-draft text is kept as you type and restored after a refresh; leaving with unsaved work asks first.
- When the AI step fails, a clear notice with "Run the check again"; exact checks still run.
- Fixes replace whole words only, and other findings on the same sentence follow a fix.
- Load test on the live server: 15 people at once, 105 requests, none failed (see docs/TESTING.md).
- Demo copies start about five times faster when many people start at once.
- The demo is kept awake day and night during judging.

### Usability and real-world fit
- A guided tour for each role, shown once; plain-language meanings for the workflow's words on hover.
- Ctrl+K to jump to any page or draft.
- Drafts: search, status filter, due dates, "waiting for you · 11 h".
- Accept all low-risk fixes at once; copy the text or save it as .txt.
- Read-only share links to a review record (30 days, no account needed).
- Re-check alerts for approved content that quotes an expired or changed fact.
- Channel limits: Instagram (2,200 characters, 30 hashtags), LinkedIn (3,000 characters), ad text over 125.
- Rules to and from a spreadsheet (CSV); guideline import also reads PDF and Word files.
- A "Check with BrandGuard" bookmarklet for text on any web page.
- Removed teammates can be added back.
- Motion: the record prints out of a slot, image measurements trace in, gauges sweep; all respect
  reduced motion.

### Added on 20 November
- **Run the test now** on the Reliability page: the exact checks on all 80 cases, live.
- **Channel previews:** LinkedIn, Instagram and email, with where "…see more" cuts the text.
- Reward moments: a stamp on approval, a count-up to the new score, a pop when a draft is clean.
- **Hover a fix** to see the sentence as it would read; **undo** an accepted fix.
- **Make this a rule:** the brand owner selects text in a draft and gets a rule drafted from it (the
  pattern is built in code).
- Image scan: every measured problem is labelled on the image, including where an off-brand colour sits.
- **Precedents:** how the same rule was handled on earlier drafts.
- Pages update by themselves when a teammate acts in another window; the draft list re-sorts smoothly.
- Keyboard review (J / K, A, D), a share link for the sign-in comparison, and a nightly CI run of the
  full check with AI (needs a `GROQ_API_KEY` repository secret).
- A sliding tab marker, a spotlight in the tour, numbers that count up.
- **Check many posts:** a content calendar or CSV, a verdict for every post.
- **Dark mode**, opt-in.
- Two more image checks, measured in code: shape and size for the channel (Instagram, LinkedIn,
  email), with the crop drawn on the image and what it would cut off; and blurry or enlarged images.

### Testing and documentation
- Browser tests of the main journeys in CI, with an accessibility scan (axe, WCAG 2 A and AA) of nine screens, in light and dark.
- 73 backend tests, including the reliability gate.
- One-command local setup (`scripts/dev.sh`, `scripts/dev.ps1`), a roadmap, this changelog, and a
  testing report.

## Round 2 build (13 to 16 November 2026)

The review desk: brands as private workspaces with teams, the Brand Library, exact and AI checks with
verification, checks while typing, the review workflow with escalation and waivers, versions and
comparison, the printable review record, Brand health, and private demo copies of two demo brands.
