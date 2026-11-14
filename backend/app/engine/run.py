"""One review run: exact checks -> AI checks -> verification -> saved findings + disclosure record."""
import re

from sqlalchemy.orm import Session

from .. import config
from ..models import Draft, Fact, Finding, ReviewRun, Rule, Term
from .ai import ai_review
from .exact import check_rule_patterns, check_terms, run_exact
from .verify import verify_ai_findings

# A finding a person has already ruled on is not raised again for the same passage.
SETTLED = ("disputed", "dismissed", "waived")


def clean_ai_text(text: str, pattern_rules, terms) -> str:
    """Put preferred terms into AI-written text, and return "" if it still breaks a pattern rule.
    A suggested fix that breaks a rule is worse than no suggestion."""
    if not text:
        return ""
    for t in check_terms(text, terms):
        text = re.sub(r"(?<![\w-])" + re.escape(t["quote"]) + r"(?![\w-])", t["suggestion"], text)
    return "" if check_rule_patterns(text, pattern_rules) else text


def repeats_exact(item: dict, exact: list, body: str) -> bool:
    a = body.find(item["quote"])
    for x in exact:
        if x["ref_code"] == item["ref_code"] and x["quote"] == item["quote"]:
            return True
        b = body.find(x["quote"])
        overlaps = a != -1 and b != -1 and a < b + len(x["quote"]) and b < a + len(item["quote"])
        if overlaps and x["category"] == item["category"]:
            return True
    return False


def run_review(db: Session, draft: Draft) -> ReviewRun:
    rules = db.query(Rule).filter(Rule.status == "approved").order_by(Rule.code).all()
    facts = db.query(Fact).order_by(Fact.code).all()
    terms = db.query(Term).all()

    exact = run_exact(draft.body, rules, facts, terms)

    ai_rules = [r for r in rules if not (r.patterns or "").strip()]
    pattern_rules = [r for r in rules if (r.patterns or "").strip()]
    style = [f"{r.code} {r.title}: {r.text}" for r in pattern_rules]
    style += [f"Say \"{t.preferred}\", not \"{t.banned}\"." for t in terms]
    result = ai_review(draft, ai_rules, facts, exact, style)

    refs = {r.code: {"text": r.text, "category": r.category, "severity": r.severity} for r in ai_rules}
    refs.update({f.code: {"text": f"{f.statement} (Source: {f.source})", "category": "claims", "severity": "high"} for f in facts})
    kept, dropped = verify_ai_findings(result["findings"], draft.body, refs)

    # AI rewrites for exact findings that had no ready-made fix.
    for rw in result["rewrites"]:
        try:
            target = exact[int(rw["index"])]
            suggestion = str(rw["suggestion"]).strip()
        except (KeyError, ValueError, TypeError, IndexError):
            continue
        sentence = target.get("_sentence")
        suggestion = clean_ai_text(suggestion, pattern_rules, terms)
        if sentence and suggestion and suggestion != sentence and not target["suggestion"] and sentence in draft.body:
            target["quote"], target["suggestion"] = sentence, suggestion

    # The model's own fixes get the same treatment: preferred terms, and no fix that breaks a rule.
    for k in kept:
        k["suggestion"] = clean_ai_text(k.get("suggestion") or "", pattern_rules, terms)

    # Exact checks are the reliable source. Drop AI findings that repeat one: same rule, or the
    # same kind of issue on an overlapping passage.
    kept = [k for k in kept if not repeats_exact(k, exact, draft.body)]

    settled = {(f.quote, f.ref_code) for f in db.query(Finding).filter(Finding.draft_id == draft.id, Finding.status.in_(SETTLED))}
    db.query(Finding).filter(Finding.draft_id == draft.id, Finding.status == "open").delete()
    for item in exact + kept:
        if (item["quote"], item["ref_code"]) in settled:
            continue
        item.pop("_sentence", None)
        db.add(Finding(draft_id=draft.id, version=draft.version, **item))

    run = ReviewRun(
        draft_id=draft.id, version=draft.version,
        ai_used=result["used"],
        ai_provider=config.AI_PROVIDER_NAME if result["used"] else "",
        ai_model=config.AI_MODEL if result["used"] else "",
        ai_note=result["note"],
        exact_count=len(exact), ai_count=len(kept), dropped_count=len(dropped),
    )
    db.add(run)
    draft.checked_version = draft.version
    db.commit()
    return run
