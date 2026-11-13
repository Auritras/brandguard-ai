"""Verification: "no citation, no finding".

Every AI finding must (1) quote text that really is in the draft and
(2) cite a rule or fact code that really exists. Anything else is dropped.
This is ordinary code, not another AI call.
"""
import re

SMART = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-"})


def locate(quote: str, body: str) -> str | None:
    """Return the exact passage of `body` matching `quote`, tolerating whitespace and curly quotes."""
    quote = (quote or "").strip()
    if not quote:
        return None
    if quote in body:
        return quote
    tokens = quote.translate(SMART).split()
    if not tokens:
        return None
    pattern = r"\s+".join(re.escape(t) for t in tokens)
    m = re.search(pattern, body.translate(SMART))
    if m:
        return body[m.start():m.end()]  # translate() keeps positions, so slice the original
    return None


def verify_ai_findings(raw: list, body: str, refs: dict[str, dict]) -> tuple[list[dict], list[dict]]:
    """Split raw AI output into (kept, dropped). `refs` maps code -> {text, category, severity}."""
    kept, dropped, seen = [], [], set()
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            dropped.append({"item": str(item)[:200], "why": "not an object"})
            continue
        code = str(item.get("rule_code") or item.get("ref_code") or "").strip().upper()
        quote = locate(str(item.get("quote") or ""), body)
        reason = str(item.get("reason") or "").strip()
        if code not in refs:
            dropped.append({"item": item, "why": f"cites '{code}', which is not in the Brand Library"})
            continue
        if quote is None:
            dropped.append({"item": item, "why": "quoted text is not in the draft"})
            continue
        if not reason:
            dropped.append({"item": item, "why": "no reason given"})
            continue
        if (quote, code) in seen:
            continue
        seen.add((quote, code))
        ref = refs[code]
        suggestion = str(item.get("suggestion") or "").strip()
        if suggestion == quote:
            suggestion = ""
        kept.append({
            "source": "ai", "category": ref["category"], "severity": ref["severity"],
            "quote": quote, "ref_code": code, "ref_text": ref["text"],
            "reason": reason, "suggestion": suggestion,
        })
    return kept, dropped
