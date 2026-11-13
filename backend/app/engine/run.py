"""One review run: exact checks -> AI checks -> verification -> saved findings + disclosure record."""
from sqlalchemy.orm import Session

from .. import config
from ..models import Draft, Fact, Finding, ReviewRun, Rule, Term
from .ai import ai_review
from .exact import run_exact
from .verify import verify_ai_findings

# A finding a person has already ruled on is not raised again for the same passage.
SETTLED = ("disputed", "dismissed", "waived")


def run_review(db: Session, draft: Draft) -> ReviewRun:
    rules = db.query(Rule).filter(Rule.status == "approved").order_by(Rule.code).all()
    facts = db.query(Fact).order_by(Fact.code).all()
    terms = db.query(Term).all()

    exact = run_exact(draft.body, rules, facts, terms)

    ai_rules = [r for r in rules if not (r.patterns or "").strip()]
    result = ai_review(draft, ai_rules, facts, exact)

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
        if sentence and suggestion and suggestion != sentence and not target["suggestion"] and sentence in draft.body:
            target["quote"], target["suggestion"] = sentence, suggestion

    exact_keys = {(x["quote"], x["ref_code"]) for x in exact}
    kept = [k for k in kept if (k["quote"], k["ref_code"]) not in exact_keys]

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
