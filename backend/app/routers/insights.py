"""Brand health: what the review record says about the brand's content. Read-only.

Creators see numbers for their own drafts; managers and reviewers see the whole team."""
from collections import Counter
from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import current_user, require
from ..db import get_db
from ..engine.ai import find_missing_rules, suggest_rewrite
from ..models import AuditLog, Comment, Draft, Fact, Finding, Rule, Term, User
from .common import log
from .library import CATEGORIES, SEVERITIES, next_code

router = APIRouter(prefix="/api", tags=["insights"])

OUTCOMES = ("open", "accepted", "edited", "disputed", "dismissed", "waived")


def _utc(dt):
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


@router.get("/insights")
def insights(db: Session = Depends(get_db), user: User = Depends(current_user)):
    q = db.query(Draft).filter(Draft.brand_id == user.brand_id, Draft.deleted_at.is_(None))
    if user.role == "creator":
        q = q.filter(Draft.creator_id == user.id)
    drafts = q.all()
    ids = [d.id for d in drafts]
    findings = db.query(Finding).filter(Finding.draft_id.in_(ids)).all() if ids else []

    # Which rules, facts and terms are broken most often.
    b = user.brand_id
    names = {r.code: r.title for r in db.query(Rule).filter(Rule.brand_id == b)}
    names.update({f.code: f.statement for f in db.query(Fact).filter(Fact.brand_id == b)})
    term_names = {t.banned.lower(): t.preferred for t in db.query(Term).filter(Term.brand_id == b)}
    by_ref = Counter()
    label = {}
    for f in findings:
        key = f"TERM:{f.quote.lower()}" if f.ref_code == "TERM" else f.ref_code
        by_ref[key] += 1
        if f.ref_code == "TERM":
            label[key] = (f"Term: \"{f.quote}\"", f"Say \"{term_names.get(f.quote.lower(), '…')}\"")
        else:
            label[key] = (f.ref_code, names.get(f.ref_code, f.ref_text[:80]))
    top_refs = [{"code": label[k][0], "name": label[k][1], "count": n} for k, n in by_ref.most_common(6)]

    # Findings per draft, by channel.
    per_channel = {}
    for d in drafts:
        c = d.channel or "Other"
        row = per_channel.setdefault(c, {"channel": c, "drafts": 0, "findings": 0})
        row["drafts"] += 1
    channel_of = {d.id: d.channel or "Other" for d in drafts}
    for f in findings:
        per_channel[channel_of[f.draft_id]]["findings"] += 1
    channels = sorted(per_channel.values(), key=lambda r: -r["findings"] / r["drafts"])
    for r in channels:
        r["per_draft"] = round(r["findings"] / r["drafts"], 1)

    # Time from creating a draft to its approval.
    approvals = {a.draft_id: a.created_at for a in db.query(AuditLog).filter(
        AuditLog.action == "approved", AuditLog.draft_id.in_(ids))} if ids else {}
    hours = [(_utc(approvals[d.id]) - _utc(d.created_at)).total_seconds() / 3600 for d in drafts if d.id in approvals]

    outcomes = Counter(f.status for f in findings)
    return {
        "scope": "your drafts" if user.role == "creator" else "all drafts",
        "drafts": len(drafts),
        "approved": sum(d.status == "approved" for d in drafts),
        "in_review": sum(d.status in ("in_review", "authorised_review") for d in drafts),
        "findings": len(findings),
        "from_ai": sum(f.source == "ai" for f in findings),
        "high": sum(f.severity == "high" for f in findings),
        "avg_hours_to_approval": round(sum(hours) / len(hours), 1) if hours else None,
        "top_refs": top_refs,
        "channels": channels,
        "severity": {s: sum(f.severity == s for f in findings) for s in ("high", "medium", "low")},
        "outcomes": {o: outcomes.get(o, 0) for o in OUTCOMES},
    }


# ---------- guideline gaps ----------

OUTCOME_TEXT = {"waived": "waived by the brand owner", "dismissed": "dismissed after the writer disputed it",
                "disputed": "disputed by the writer, waiting for a decision", "upheld": "disputed, but the reviewer kept it",
                "accepted": "fixed with the suggested fix", "edited": "fixed by the writer", "open": "still open"}
FRICTION = ("waived", "dismissed", "disputed", "upheld")


def _outcome(f: Finding) -> str:
    if f.status == "open" and (f.note or "").startswith("Dispute rejected"):
        return "upheld"
    return f.status


def _rate(items) -> dict:
    n = len(items)
    friction = sum(1 for f in items if _outcome(f) in FRICTION)
    return {"total": n, "friction": friction, "rate": round(100 * friction / n) if n else None}


def rule_gaps(db: Session, brand_id: int) -> list[dict]:
    """For each approved rule: how often what it flags is waived, dismissed or disputed rather than fixed.
    A rule people keep arguing with is usually unclear, not wrong, so these are the rules to rewrite."""
    rules = db.query(Rule).filter(Rule.brand_id == brand_id, Rule.status == "approved").order_by(Rule.code).all()
    drafts = {d.id: d for d in db.query(Draft).filter(Draft.brand_id == brand_id, Draft.deleted_at.is_(None))}
    by_code = {}
    if drafts:
        for f in db.query(Finding).filter(Finding.draft_id.in_(list(drafts))).order_by(Finding.id):
            by_code.setdefault(f.ref_code, []).append(f)
    out = []
    for r in rules:
        items = by_code.get(r.code, [])
        counts = Counter(_outcome(f) for f in items)
        stats = _rate(items)
        changed = r.versions[-1].created_at if r.versions else None
        row = {
            "id": r.id, "code": r.code, "title": r.title, "text": r.text, "patterns": r.patterns, "category": r.category,
            "severity": r.severity, "checked_by": "code" if (r.patterns or "").strip() else "AI",
            **stats, "counts": {k: counts.get(k, 0) for k in ("accepted", "edited", "open", *FRICTION)},
            "unclear": stats["total"] >= 2 and stats["friction"] >= 2 and stats["friction"] * 3 >= stats["total"],
            "examples": [{"quote": f.quote[:200], "outcome": OUTCOME_TEXT.get(_outcome(f), _outcome(f)), "note": f.note[:300],
                          "draft_id": f.draft_id, "draft_title": drafts[f.draft_id].title}
                         for f in items if _outcome(f) in FRICTION][:6],
            "changed_at": None, "before": None, "after": None,
        }
        if changed is not None:
            cut = _utc(changed)
            row["changed_at"] = cut.isoformat()
            row["before"] = _rate([f for f in items if _utc(f.created_at) < cut])
            row["after"] = _rate([f for f in items if _utc(f.created_at) >= cut])
        out.append(row)
    out.sort(key=lambda x: (not x["unclear"], -(x["rate"] or 0), -x["total"], x["code"]))
    return out


@router.get("/insights/gaps")
def gaps(db: Session = Depends(get_db), user: User = Depends(current_user)):
    rules = rule_gaps(db, user.brand_id)
    return {"rules": rules, "unclear": sum(r["unclear"] for r in rules), "notes": len(review_notes(db, user.brand_id))}


@router.post("/rules/{rule_id}/suggest-rewrite")
def suggest(rule_id: int, db: Session = Depends(get_db), user: User = Depends(require("reviewer"))):
    rule = db.get(Rule, rule_id)
    if rule is None or rule.brand_id != user.brand_id:
        raise HTTPException(404, "Rule not found.")
    row = next((r for r in rule_gaps(db, user.brand_id) if r["id"] == rule.id), None)
    examples = row["examples"] if row else []
    if not examples:
        raise HTTPException(409, "Nobody has disagreed with this rule yet, so there is nothing to learn from.")
    try:
        return suggest_rewrite(rule, examples)
    except RuntimeError as e:
        raise HTTPException(503, str(e))


def review_notes(db: Session, brand_id: int) -> list[str]:
    """What people wrote while reviewing: change requests, comments, waivers and dispute decisions."""
    ids = [d for (d,) in db.query(Draft.id).filter(Draft.brand_id == brand_id, Draft.deleted_at.is_(None))]
    if not ids:
        return []
    notes = [c.text for c in db.query(Comment).filter(Comment.draft_id.in_(ids)).order_by(Comment.id)]
    notes += [f.note for f in db.query(Finding).filter(Finding.draft_id.in_(ids), Finding.status.in_(("waived", "dismissed")))]
    return [n for n in notes if n and len(n) > 12]


@router.post("/insights/gaps/missing")
def missing(db: Session = Depends(get_db), user: User = Depends(require("reviewer"))):
    """Ask the AI which recurring problems in review notes no rule covers. Results are PROPOSED rules:
    none is used in a check until the owner approves it in the Brand Library."""
    notes = review_notes(db, user.brand_id)
    if len(notes) < 3:
        raise HTTPException(409, "There are not enough review notes yet to look for missing rules.")
    rules = db.query(Rule).filter(Rule.brand_id == user.brand_id).order_by(Rule.code).all()
    try:
        found = find_missing_rules(rules, notes)
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    created = []
    for p in found:
        cat = str(p.get("category", "tone")).lower()
        sev = str(p.get("severity", "medium")).lower()
        rule = Rule(brand_id=user.brand_id, code=next_code(db, Rule, "R", user.brand_id), status="proposed",
                    category=cat if cat in CATEGORIES else "tone", severity=sev if sev in SEVERITIES else "medium",
                    title=str(p.get("title") or p["text"])[:200], text=str(p["text"])[:1000], patterns="")
        db.add(rule)
        db.flush()
        created.append({"code": rule.code, "title": rule.title, "text": rule.text, "because": str(p.get("because") or "")[:300]})
    log(db, user, "missing_rules_found", f"{len(created)} rule(s) proposed from {len(notes)} review notes")
    db.commit()
    return {"rules": created, "notes": len(notes)}
