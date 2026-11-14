"""Brand health: what the review record says about the brand's content. Read-only.

Creators see numbers for their own drafts; managers and reviewers see the whole team."""
from collections import Counter
from datetime import timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..models import AuditLog, Draft, Fact, Finding, Rule, Term, User

router = APIRouter(prefix="/api", tags=["insights"])

OUTCOMES = ("open", "accepted", "edited", "disputed", "dismissed", "waived")


def _utc(dt):
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


@router.get("/insights")
def insights(db: Session = Depends(get_db), user: User = Depends(current_user)):
    q = db.query(Draft).filter(Draft.brand_id == user.brand_id)
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
