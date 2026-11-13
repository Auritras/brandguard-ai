"""AI judgement checks (tone, messaging, unsupported claims) through an OpenAI-compatible endpoint.

The model only ever sees: the draft, its stated purpose, and the rules and facts selected for it.
Its output is treated as untrusted and goes through engine.verify before anyone sees it.
"""
import json
import re

import httpx

from .. import config

MAX_RULES = 12

SYSTEM = """You review marketing content for a brand team before it is published.
You are given the brand's approved RULES and approved FACTS, each with a code, and a DRAFT.

Report only real conflicts between the DRAFT and those RULES or FACTS.
- Cite exactly one code from the lists for each finding. Never invent a code or a rule.
- "quote" must be copied character for character from the DRAFT: one short passage, at most 30 words.
- "reason" is one or two plain sentences a non-expert understands.
- "suggestion" is replacement text for the quoted passage only. Keep the writer's purpose and voice; change as little as possible. Never rewrite the whole draft.
- A statistic, ranking or measurable claim that no approved FACT supports is a finding against the claims rule.
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


def build_prompt(draft, rules, facts, exact_findings) -> str:
    lines = ["RULES"]
    lines += [f"{r.code} [{r.category}] {r.title}: {r.text}" for r in rules]
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


def _chat(system: str, user: str) -> dict:
    r = httpx.post(
        config.AI_BASE_URL.rstrip("/") + "/chat/completions",
        headers={"Authorization": f"Bearer {config.AI_API_KEY}"},
        json={
            "model": config.AI_MODEL,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        },
        timeout=45,
    )
    r.raise_for_status()
    return json.loads(r.json()["choices"][0]["message"]["content"])


def ai_review(draft, rules, facts, exact_findings) -> dict:
    """Returns {used, note, findings, rewrites}. Never raises: a failed call is reported in `note`."""
    if not config.AI_API_KEY:
        return {"used": False, "findings": [], "rewrites": [],
                "note": "AI checks were skipped: no AI key is configured on this server. Only exact checks ran."}
    chosen = select_rules(draft.body, draft.purpose, rules)
    sent = (f"Sent to {config.AI_PROVIDER_NAME} ({config.AI_MODEL}): the draft text, its channel, audience and purpose, "
            f"{len(chosen)} rule(s) ({', '.join(r.code for r in chosen) or 'none'}) and {len(facts)} approved fact(s). "
            "Nothing else from the Brand Library, and no user names or emails, was sent.")
    try:
        data = _chat(SYSTEM, build_prompt(draft, chosen, facts, exact_findings))
    except Exception as e:  # network error, rate limit, bad JSON
        return {"used": False, "findings": [], "rewrites": [],
                "note": f"AI checks failed and were skipped ({type(e).__name__}). Only exact checks ran. Re-run to try again."}
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
