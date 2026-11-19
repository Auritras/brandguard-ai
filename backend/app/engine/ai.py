"""AI judgement checks (tone, messaging, unsupported claims) through an OpenAI-compatible endpoint.

The model only ever sees: the draft, its stated purpose, and the rules and facts selected for it.
Its output is treated as untrusted and goes through engine.verify before anyone sees it.
"""
import json
import re
import time

import httpx

from .. import config
from ..routers.common import plural

MAX_RULES = 12

SYSTEM = """You review marketing content for a brand team before it is published.
You are given the brand's approved RULES and approved FACTS, each with a code, and a DRAFT.

Report only real conflicts between the DRAFT and those RULES or FACTS.
- Cite exactly one code from the lists for each finding. Never invent a code or a rule.
- "quote" must be copied character for character from the DRAFT: one short passage, at most 30 words.
- "reason" is one or two plain sentences a non-expert understands.
- "suggestion" is replacement text for the quoted passage only. Keep the writer's purpose and voice; change as little as possible. Never rewrite the whole draft.
- A statistic, ranking or measurable claim that no approved FACT supports is a finding against the claims rule.
- Every suggestion and rewrite must itself follow every rule under RULES and ALSO FOLLOW, use only numbers from FACTS, and use the preferred terms. Never swap one banned word for another (for example "#1" for "leading").
- Do not repeat anything listed under ALREADY FOUND.
- If the draft is fine, return an empty list. At most 8 findings.

Also, for each item under NEEDS A FIX, write a "rewrite": the same sentence, minimally changed so it no longer breaks the rule named.

Reply with JSON only:
{"findings":[{"quote":"...","rule_code":"R-001","reason":"...","suggestion":"..."}],
 "rewrites":[{"index":0,"suggestion":"..."}]}"""


def select_rules(body: str, purpose: str, rules: list) -> list:
    """Narrow context: keep the rules most related to this draft (simple word overlap)."""
    if len(rules) <= MAX_RULES:
        return rules
    words = set(re.findall(r"[a-z]{4,}", (body + " " + purpose).lower()))
    scored = sorted(rules, key=lambda r: -len(words & set(re.findall(r"[a-z]{4,}", (r.title + " " + r.text).lower()))))
    return scored[:MAX_RULES]


def build_prompt(draft, rules, facts, exact_findings, style=()) -> str:
    lines = ["RULES"]
    lines += [f"{r.code} [{r.category}] {r.title}: {r.text}" for r in rules]
    if style:
        lines += ["", "ALSO FOLLOW (checked separately in code; obey them in suggestions and rewrites)"]
        lines += [f"- {s}" for s in style]
    lines += ["", "FACTS"]
    for f in facts:
        until = f" (valid until {f.valid_until.isoformat()})" if f.valid_until else ""
        lines.append(f"{f.code}: {f.statement}{until}")
    lines += ["", "ALREADY FOUND"]
    lines += [f"- \"{x['quote']}\" ({x['ref_code']})" for x in exact_findings] or ["- none"]
    lines += ["", "NEEDS A FIX"]
    needs = [(i, x) for i, x in enumerate(exact_findings) if not x.get("suggestion") and x.get("_sentence")]
    lines += [f"- index {i}: sentence \"{x['_sentence']}\" breaks {x['ref_code']}: {x['ref_text']}" for i, x in needs] or ["- none"]
    lines += [
        "", f"CHANNEL: {draft.channel or 'not stated'}",
        f"AUDIENCE: {draft.audience or 'not stated'}",
        f"PURPOSE: {draft.purpose or 'not stated'}",
        "", "DRAFT", draft.body,
    ]
    return "\n".join(lines)


def _why(e: Exception) -> str:
    """A short, safe reason for a failed AI call: the HTTP status and the provider's own message."""
    if isinstance(e, httpx.HTTPStatusError) and e.response.status_code == 429:
        return "the AI provider's free usage limit was busy; try the check again in a minute"
    if isinstance(e, httpx.HTTPStatusError):
        try:
            msg = e.response.json().get("error", {}).get("message", "")
        except Exception:
            msg = ""
        return f"HTTP {e.response.status_code}{': ' + msg[:160] if msg else ''}"
    return type(e).__name__


RETRIES = 3          # extra attempts when the provider says "too many requests"
MAX_WAIT = 15        # seconds to wait before one retry, at most


def _post(payload: dict) -> httpx.Response:
    """Send one request; on HTTP 429 wait as long as the provider asks (capped) and try again."""
    for attempt in range(RETRIES + 1):
        r = httpx.post(
            config.AI_BASE_URL.rstrip("/") + "/chat/completions",
            headers={"Authorization": f"Bearer {config.AI_API_KEY}"},
            json=payload,
            timeout=45,
        )
        if r.status_code != 429 or attempt == RETRIES:
            return r
        try:
            wait = float(r.headers.get("retry-after", ""))
        except ValueError:
            wait = 2.0 * (attempt + 1)
        time.sleep(min(max(wait, 1.0), MAX_WAIT))
    return r


def _chat(system: str, user: str) -> dict:
    r = _post(
        {
            "model": config.AI_MODEL,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        }
    )
    r.raise_for_status()
    return json.loads(r.json()["choices"][0]["message"]["content"])


def ai_review(draft, rules, facts, exact_findings, style=()) -> dict:
    """Returns {used, note, findings, rewrites}. Never raises: a failed call is reported in `note`.

    `style` is a list of short lines (pattern rules and preferred terms) the model's own
    suggestions must also obey."""
    if not config.AI_API_KEY:
        return {"used": False, "findings": [], "rewrites": [],
                "note": "AI checks were skipped: no AI key is configured on this server. Only exact checks ran."}
    chosen = select_rules(draft.body, draft.purpose, rules)
    sent = (f"Sent to {config.AI_PROVIDER_NAME} ({config.AI_MODEL}): the draft text, its channel, audience and purpose, "
            f"{plural(len(chosen), 'rule')} ({', '.join(r.code for r in chosen) or 'none'}), {plural(len(facts), 'approved fact')}"
            f"{' and the writing rules and preferred terms its suggestions must follow' if style else ''}. "
            "Nothing else from the Brand Library, and no user names or emails, was sent.")
    try:
        data = _chat(SYSTEM, build_prompt(draft, chosen, facts, exact_findings, style))
    except Exception as e:  # network error, rate limit, bad JSON
        return {"used": False, "findings": [], "rewrites": [],
                "note": f"AI checks failed and were skipped ({_why(e)}). Only exact checks ran. Re-run to try again."}
    findings = data.get("findings") if isinstance(data, dict) else []
    rewrites = data.get("rewrites") if isinstance(data, dict) else []
    return {"used": True, "note": sent,
            "findings": findings if isinstance(findings, list) else [],
            "rewrites": rewrites if isinstance(rewrites, list) else []}


IMPORT_SYSTEM = """Turn a brand guideline document into separate, checkable rules.
Each rule is one instruction a reviewer could check a draft against.
category is one of: tone, claims, messaging, accessibility. severity is one of: low, medium, high.
Use only what the document says. Reply with JSON only:
{"rules":[{"category":"tone","title":"short name","text":"the rule in one or two sentences","severity":"medium"}]}"""

RULE_WORDS = re.compile(r"\b(must|should|do not|don't|never|always|avoid|use|write|keep)\b", re.IGNORECASE)


def propose_rules(text: str) -> tuple[list[dict], str]:
    """Split guideline text into proposed rules. With no AI key, falls back to picking instruction-like lines."""
    if config.AI_API_KEY:
        try:
            data = _chat(IMPORT_SYSTEM, text[:12000])
            rules = [r for r in data.get("rules", []) if isinstance(r, dict) and str(r.get("text", "")).strip()]
            if rules:
                return rules[:40], f"Rules proposed by {config.AI_PROVIDER_NAME} ({config.AI_MODEL}) from the text you pasted."
        except Exception:
            pass
    out = []
    for line in re.split(r"\n+|(?<=[.])\s+(?=[A-Z])", text):
        line = line.strip(" \t-*•")
        if 20 <= len(line) <= 300 and RULE_WORDS.search(line):
            out.append({"category": "tone", "title": line[:60].rstrip(" ,.;:"), "text": line, "severity": "medium"})
    return out[:40], "Rules proposed without AI: each instruction-like line became one rule. Check the categories."


REWRITE_SYSTEM = """You help a brand owner make one unclear brand rule clearer.
You get the RULE, and real EXAMPLES where writers and reviewers disagreed with it: what was flagged, what happened
(waived, dismissed, disputed) and the reasons people gave.
Rewrite the rule so a writer can tell in advance what is and is not allowed, and the cases in the examples are
decided the way the reviewers decided them. Keep the rule's intent; do not weaken it beyond what the examples show.
Keep it to one to three plain sentences. If the rule is checked by exact patterns, you may suggest new patterns
(one regular expression per line), or "" to keep them.
Reply with JSON only: {"title":"short name","text":"the rewritten rule","patterns":"","why":"one sentence on what changed and why"}"""


def suggest_rewrite(rule, examples: list[dict]) -> dict:
    """A clearer wording for one rule, from the disagreements it caused. Raises RuntimeError without AI."""
    if not config.AI_API_KEY:
        raise RuntimeError("Suggesting a rewrite needs the AI, and no AI key is configured on this server.")
    lines = [f"RULE {rule.code} [{rule.category}, {rule.severity}] {rule.title}: {rule.text}"]
    if (rule.patterns or "").strip():
        lines.append("PATTERNS (checked in code):\n" + rule.patterns)
    lines.append("EXAMPLES")
    for e in examples[:8]:
        lines.append(f"- flagged \"{e['quote']}\" -> {e['outcome']}" + (f"; reason given: {e['note']}" if e.get("note") else ""))
    try:
        data = _chat(REWRITE_SYSTEM, "\n".join(lines))
    except Exception as e:
        raise RuntimeError(f"The AI could not suggest a rewrite right now ({_why(e)}). Try again in a minute.")
    text = str(data.get("text") or "").strip()
    if not text:
        raise RuntimeError("The AI did not return a rewrite. Try again.")
    patterns = str(data.get("patterns") or "").strip()
    for line in patterns.splitlines():
        try:
            re.compile(line.strip())
        except re.error:
            patterns = ""  # never offer a pattern that would not even compile
            break
    return {"title": str(data.get("title") or rule.title).strip()[:200], "text": text[:1000],
            "patterns": patterns, "why": str(data.get("why") or "").strip()[:400]}


MISSING_SYSTEM = """You help a brand owner find gaps in their brand rules.
You get the brand's current RULES, and NOTES that reviewers wrote when they sent drafts back or discussed them.
Find recurring problems in the NOTES that no current rule covers. Ignore anything a current rule already covers,
and anything mentioned only once unless it is serious.
category is one of: tone, claims, messaging, accessibility. severity is one of: low, medium, high.
Reply with JSON only: {"rules":[{"category":"tone","title":"short name","text":"the rule in one or two sentences","severity":"medium","because":"which notes show this"}]}
Return an empty list if nothing is missing. At most 5 rules."""


def find_missing_rules(rules, notes: list[str]) -> list[dict]:
    if not config.AI_API_KEY:
        raise RuntimeError("Finding missing rules needs the AI, and no AI key is configured on this server.")
    text = "RULES\n" + "\n".join(f"{r.code} {r.title}: {r.text}" for r in rules)
    text += "\n\nNOTES\n" + "\n".join(f"- {n[:400]}" for n in notes[:60])
    try:
        data = _chat(MISSING_SYSTEM, text)
    except Exception as e:
        raise RuntimeError(f"The AI could not look for missing rules right now ({_why(e)}). Try again in a minute.")
    out = []
    for r in data.get("rules") or []:
        if isinstance(r, dict) and str(r.get("text", "")).strip():
            out.append(r)
    return out[:5]
