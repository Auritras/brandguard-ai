# Roadmap

Where BrandGuard AI goes after CodeNova India 2026. Each phase says what it delivers, roughly how long
it takes a team of our size working part-time, and what it depends on. Phases are in order: each one
builds on the one before. Estimates assume the free hosting stays as it is until Phase 3.

## Now (Round 3 build, 19 to 21 November 2026)

Done and live: brands as private workspaces, the review workflow with four-eyes approval, exact and AI
checks with verification, **image review**, **guideline-gap insights**, **measured reliability** (80
test drafts, scored on every change), browser tests of the main journeys, and the hardening listed in
[CHANGELOG.md](CHANGELOG.md). What does not work yet is listed in the README under *Known limits*.

## Phase 1: Pilot with real teams (4 to 6 weeks)

**Delivers**
- Two or three pilot brands (a student society, a small business, a campus magazine) using it on real
  posts for a month, with their own rules.
- Email notifications when something is waiting for you, and a daily digest for managers.
- Brand-owner settings: which channels the brand uses, and its own channel limits.
- More test drafts written from the pilots' real content, so the reliability score measures their
  kind of writing, not only ours.

**Depends on:** finding pilot teams; a free email sending service (for example Brevo's free tier);
the pilots' permission to keep anonymised examples as test drafts.

**How we will know it worked:** pilots keep using it after week two; findings that are fixed rather
than argued with stay above 60%; no pilot reports a missed high-risk problem that a rule covered.

## Phase 2: Fit into where content is written (6 to 8 weeks)

**Delivers**
- A browser extension that checks text where it is written (Google Docs, a CMS, LinkedIn's post box),
  building on today's bookmarklet.
- Import from Google Docs and Notion links, not only files.
- Scheduled re-checks that notify the writer, building on today's re-check alerts for expired facts.
- Hindi and Bengali rules and terms written by the brand, checked in the same way as English (the
  checks already handle Indian scripts in text; the rules themselves are English today).

**Depends on:** Phase 1 feedback on which tools pilots write in; Chrome Web Store developer account
(one-time fee); Google and Notion API access.

## Phase 3: Reliable at a larger scale (6 weeks)

**Delivers**
- A paid always-on server instead of the free one that sleeps, and background jobs for checks, so a
  long check never holds a page open.
- A fallback AI provider when the main one is rate limited, with the same verification step.
- The reliability run with AI, already nightly in CI, raising an alert when the
  catch rate drops.
- Audit log export for compliance teams, and single sign-on (Google Workspace).

**Depends on:** a budget of roughly Rs 1,500 to 3,000 a month for hosting and AI at pilot scale;
choosing a second AI provider and re-scoring it on the test drafts before switching.

## Phase 4: Learn from decisions (8 weeks, research)

**Delivers**
- Rules that suggest their own exceptions from repeated waivers (the guideline-gap rewrite, made
  continuous), always approved by the brand owner.
- Video and audio: transcripts checked like text, and frames checked like images.
- A public, versioned benchmark of brand-review drafts so other teams can compare checkers.

**Depends on:** enough real decisions from Phases 1 to 3 to learn from; consent from brands to use
their anonymised decisions.

## Not planned

- Letting the AI approve or publish anything. People decide; that is the point of the product.
- Writing whole posts for people. BrandGuard suggests the smallest fix that keeps the writer's voice.
