"""Drafts, findings and the approval workflow.

States: draft -> in_review -> (changes_requested | authorised_review | approved)
Only people move a draft forward. The automated check never approves anything.
"""
import re

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth import current_user, require
from ..db import get_db
from ..engine.extract import extract_text
from ..engine.exact import run_exact
from ..engine.run import run_review
from ..models import AuditLog, Comment, Draft, DraftVersion, Fact, Finding, ReviewRun, Rule, Term, User
from .common import iso, log

router = APIRouter(prefix="/api", tags=["drafts"])

EDITABLE = ("draft", "changes_requested")
BLOCKING = ("open", "disputed")  # a high-severity finding in one of these states blocks approval


class DraftIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    channel: str = ""
    audience: str = ""
    purpose: str = ""
    body: str = Field(min_length=1)


class BodyIn(BaseModel):
    body: str = Field(min_length=1)


class EditIn(BaseModel):
    replacement: str


class ReasonIn(BaseModel):
    reason: str = Field(min_length=3)


class DecideIn(BaseModel):
    decision: str  # uphold | dismiss
    reason: str = Field(min_length=3)


class NoteIn(BaseModel):
    note: str = Field(min_length=3)


class CommentIn(BaseModel):
    text: str = Field(min_length=1)
    finding_id: int | None = None


# ---------- helpers ----------

def get_draft(db: Session, draft_id: int, user: User, lock: bool = False) -> Draft:
    """`lock` holds the draft's row until the request commits, so two people acting on the same
    draft at the same moment are handled one after the other (Postgres; SQLite has no row locks)."""
    draft = db.get(Draft, draft_id, with_for_update=lock)
    if draft is None or (user.role == "creator" and draft.creator_id != user.id):
        raise HTTPException(404, "Draft not found.")
    return draft


def get_finding(db: Session, finding_id: int, user: User) -> tuple[Finding, Draft]:
    finding = db.get(Finding, finding_id)
    if finding is None:
        raise HTTPException(404, "Finding not found.")
    return finding, get_draft(db, finding.draft_id, user, lock=True)


def own_editable(draft: Draft, user: User) -> None:
    if draft.creator_id != user.id:
        raise HTTPException(403, "Only the creator of this draft can do this.")
    if draft.status not in EDITABLE:
        raise HTTPException(409, "This draft is with reviewers and cannot be changed right now.")


def new_version(db: Session, draft: Draft, user: User, body: str, note: str) -> None:
    draft.version += 1
    draft.body = body
    db.add(DraftVersion(draft_id=draft.id, number=draft.version, body=body, note=note, user_id=user.id))


def blocking_findings(db: Session, draft: Draft) -> list[Finding]:
    return db.query(Finding).filter(
        Finding.draft_id == draft.id, Finding.severity == "high", Finding.status.in_(BLOCKING)).all()


def finding_out(f: Finding) -> dict:
    return {"id": f.id, "version": f.version, "source": f.source, "category": f.category, "severity": f.severity,
            "quote": f.quote, "ref_code": f.ref_code, "ref_text": f.ref_text, "reason": f.reason,
            "suggestion": f.suggestion, "status": f.status, "note": f.note}


def summary(db: Session, d: Draft) -> dict:
    findings = db.query(Finding).filter(Finding.draft_id == d.id).all()
    return {"id": d.id, "title": d.title, "channel": d.channel, "status": d.status, "version": d.version,
            "creator": d.creator.name, "updated_at": iso(d.updated_at),
            "open": sum(1 for f in findings if f.status == "open"),
            "disputed": sum(1 for f in findings if f.status == "disputed"),
            "blocking": sum(1 for f in findings if f.severity == "high" and f.status in BLOCKING)}


def detail(db: Session, d: Draft, user: User) -> dict:
    findings = db.query(Finding).filter(Finding.draft_id == d.id).order_by(Finding.id).all()
    run = db.query(ReviewRun).filter(ReviewRun.draft_id == d.id).order_by(ReviewRun.id.desc()).first()
    order = {"high": 0, "medium": 1, "low": 2}
    findings.sort(key=lambda f: (f.status != "open", order.get(f.severity, 3), f.id))
    is_owner = d.creator_id == user.id
    return {
        **summary(db, d),
        "audience": d.audience, "purpose": d.purpose, "body": d.body,
        "checked_version": d.checked_version, "needs_check": d.checked_version != d.version,
        "findings": [finding_out(f) for f in findings],
        "run": None if run is None else {
            "version": run.version, "ai_used": run.ai_used, "ai_provider": run.ai_provider, "ai_model": run.ai_model,
            "ai_note": run.ai_note, "exact_count": run.exact_count, "ai_count": run.ai_count,
            "dropped_count": run.dropped_count, "created_at": iso(run.created_at)},
        "comments": [{"id": c.id, "finding_id": c.finding_id, "user": c.user.name, "role": c.user.role,
                      "text": c.text, "created_at": iso(c.created_at)}
                     for c in db.query(Comment).filter(Comment.draft_id == d.id).order_by(Comment.id)],
        "versions": [{"number": v.number, "note": v.note, "user": v.user.name, "body": v.body, "created_at": iso(v.created_at)}
                     for v in db.query(DraftVersion).filter(DraftVersion.draft_id == d.id).order_by(DraftVersion.number.desc())],
        "history": [{"user": a.user.name, "role": a.user.role, "action": a.action, "detail": a.detail, "created_at": iso(a.created_at)}
                    for a in db.query(AuditLog).filter(AuditLog.draft_id == d.id).order_by(AuditLog.id.desc())],
        "can": {
            "edit": is_owner and d.status in EDITABLE,
            "submit": is_owner and d.status in EDITABLE,
            "decide_disputes": user.role in ("manager", "reviewer") and d.status in ("in_review", "authorised_review"),
            "approve": (user.role == "manager" and d.status == "in_review")
                       or (user.role == "reviewer" and d.status in ("in_review", "authorised_review")),
            "request_changes": (user.role == "manager" and d.status == "in_review")
                               or (user.role == "reviewer" and d.status in ("in_review", "authorised_review")),
            "waive": user.role == "reviewer" and d.status in ("in_review", "authorised_review"),
        },
    }


# ---------- drafts ----------

@router.post("/extract")
async def extract(file: UploadFile = File(...), user: User = Depends(current_user)):
    try:
        return {"text": extract_text(file.filename or "", await file.read())}
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception:
        raise HTTPException(422, "This file could not be read. Try saving it again or paste the text instead.")


@router.get("/drafts")
def list_drafts(db: Session = Depends(get_db), user: User = Depends(current_user)):
    q = db.query(Draft)
    if user.role == "creator":
        q = q.filter(Draft.creator_id == user.id)
    return [summary(db, d) for d in q.order_by(Draft.updated_at.desc())]


@router.post("/drafts")
def create_draft(body: DraftIn, db: Session = Depends(get_db), user: User = Depends(require("creator"))):
    draft = Draft(creator_id=user.id, **body.model_dump())
    db.add(draft)
    db.flush()
    db.add(DraftVersion(draft_id=draft.id, number=1, body=draft.body, note="First version", user_id=user.id))
    log(db, user, "draft_created", draft.title, draft.id)
    db.commit()
    return detail(db, draft, user)


@router.get("/drafts/{draft_id}")
def read_draft(draft_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return detail(db, get_draft(db, draft_id, user), user)


@router.put("/drafts/{draft_id}")
def edit_draft(draft_id: int, body: BodyIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    draft = get_draft(db, draft_id, user)
    own_editable(draft, user)
    if body.body != draft.body:
        new_version(db, draft, user, body.body, "Edited by hand")
        log(db, user, "draft_edited", f"Version {draft.version}", draft.id)
        db.commit()
    return detail(db, draft, user)


def spans(body: str, quote: str) -> list[list[int]]:
    """Every place the quote appears, without matching inside a longer word ("Lumio Pay" in "Lumio Payroll")."""
    left = r"(?<![\w-])" if re.match(r"\w", quote) else ""
    right = r"(?![\w-])" if re.search(r"\w$", quote) else ""
    return [[m.start(), m.end()] for m in re.finditer(left + re.escape(quote) + right, body)][:20]


@router.post("/check-text")
def check_text(body: BodyIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Exact checks only, on unsaved text, for checking while typing. Nothing is stored or sent to AI."""
    text = body.body[:20000]
    rules = db.query(Rule).filter(Rule.status == "approved").all()
    found = run_exact(text, rules, db.query(Fact).all(), db.query(Term).all())
    return [{"quote": f["quote"], "severity": f["severity"], "ref_code": f["ref_code"], "reason": f["reason"],
             "suggestion": f["suggestion"], "spans": spans(text, f["quote"])} for f in found]


@router.post("/drafts/{draft_id}/check")
def check_draft(draft_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    draft = get_draft(db, draft_id, user)
    own_editable(draft, user)
    run = run_review(db, draft)
    log(db, user, "check_run",
        f"Version {draft.version}: {run.exact_count} exact, {run.ai_count} AI, {run.dropped_count} AI finding(s) dropped by verification",
        draft.id)
    db.commit()
    return detail(db, draft, user)


# ---------- findings: the creator's choices ----------

def apply_fix(db: Session, finding: Finding, draft: Draft, user: User, replacement: str, status: str) -> None:
    if finding.status != "open":
        raise HTTPException(409, "This finding has already been handled.")
    if finding.quote not in draft.body:
        raise HTTPException(409, "The quoted text is no longer in the draft. Run the check again.")
    new_version(db, draft, user, draft.body.replace(finding.quote, replacement, 1),
                f"{'Accepted' if status == 'accepted' else 'Own fix for'} {finding.ref_code}")
    finding.status, finding.decided_by = status, user.id
    finding.note = f"Replaced with: {replacement}"
    log(db, user, f"finding_{status}", f"{finding.ref_code}: \"{finding.quote}\" -> \"{replacement}\"", draft.id)
    db.commit()


@router.post("/findings/{finding_id}/accept")
def accept(finding_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    finding, draft = get_finding(db, finding_id, user)
    own_editable(draft, user)
    if not finding.suggestion:
        raise HTTPException(409, "There is no suggested fix for this one. Write your own fix or dispute it.")
    apply_fix(db, finding, draft, user, finding.suggestion, "accepted")
    return detail(db, draft, user)


@router.post("/findings/{finding_id}/edit")
def edit(finding_id: int, body: EditIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    finding, draft = get_finding(db, finding_id, user)
    own_editable(draft, user)
    apply_fix(db, finding, draft, user, body.replacement, "edited")
    return detail(db, draft, user)


@router.post("/findings/{finding_id}/dispute")
def dispute(finding_id: int, body: ReasonIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    finding, draft = get_finding(db, finding_id, user)
    own_editable(draft, user)
    if finding.status != "open":
        raise HTTPException(409, "This finding has already been handled.")
    finding.status, finding.note, finding.decided_by = "disputed", body.reason, user.id
    log(db, user, "finding_disputed", f"{finding.ref_code}: {body.reason}", draft.id)
    db.commit()
    return detail(db, draft, user)


# ---------- findings: reviewers' decisions ----------

@router.post("/findings/{finding_id}/decide")
def decide(finding_id: int, body: DecideIn, db: Session = Depends(get_db),
           user: User = Depends(require("manager", "reviewer"))):
    finding, draft = get_finding(db, finding_id, user)
    if draft.status not in ("in_review", "authorised_review"):
        raise HTTPException(409, "Disputes are decided while the draft is in review.")
    if finding.status != "disputed":
        raise HTTPException(409, "This finding is not disputed.")
    if finding.severity == "high" and user.role != "reviewer":
        raise HTTPException(403, "A high-severity dispute needs an authorised reviewer.")
    if body.decision == "uphold":
        finding.status = "open"
        finding.note = f"Dispute rejected: {body.reason} (Creator said: {finding.note})"
    elif body.decision == "dismiss":
        finding.status = "dismissed"
        finding.note = f"Finding dismissed: {body.reason} (Creator said: {finding.note})"
    else:
        raise HTTPException(422, "Decision must be 'uphold' or 'dismiss'.")
    finding.decided_by = user.id
    log(db, user, f"dispute_{'rejected' if body.decision == 'uphold' else 'accepted'}",
        f"{finding.ref_code}: {body.reason}", draft.id)
    db.commit()
    return detail(db, draft, user)


@router.post("/findings/{finding_id}/waive")
def waive(finding_id: int, body: ReasonIn, db: Session = Depends(get_db), user: User = Depends(require("reviewer"))):
    finding, draft = get_finding(db, finding_id, user)
    if draft.status not in ("in_review", "authorised_review"):
        raise HTTPException(409, "Findings are waived while the draft is in review.")
    if finding.status not in BLOCKING:
        raise HTTPException(409, "This finding is not open.")
    finding.status, finding.note, finding.decided_by = "waived", f"Waived: {body.reason}", user.id
    log(db, user, "finding_waived", f"{finding.ref_code}: {body.reason}", draft.id)
    db.commit()
    return detail(db, draft, user)


# ---------- workflow ----------

@router.post("/drafts/{draft_id}/submit")
def submit(draft_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    draft = get_draft(db, draft_id, user, lock=True)
    own_editable(draft, user)
    if draft.checked_version != draft.version:
        raise HTTPException(409, "Run the check on this version before sending it for review.")
    draft.status = "in_review"
    log(db, user, "submitted_for_review", f"Version {draft.version}", draft.id)
    db.commit()
    return detail(db, draft, user)


@router.post("/drafts/{draft_id}/request-changes")
def request_changes(draft_id: int, body: NoteIn, db: Session = Depends(get_db),
                    user: User = Depends(require("manager", "reviewer"))):
    draft = get_draft(db, draft_id, user, lock=True)
    allowed = ("in_review",) if user.role == "manager" else ("in_review", "authorised_review")
    if draft.status not in allowed:
        raise HTTPException(409, "This draft is not waiting for your review.")
    draft.status = "changes_requested"
    db.add(Comment(draft_id=draft.id, user_id=user.id, text=f"Changes requested: {body.note}"))
    log(db, user, "changes_requested", body.note, draft.id)
    db.commit()
    return detail(db, draft, user)


@router.post("/drafts/{draft_id}/approve")
def approve(draft_id: int, db: Session = Depends(get_db), user: User = Depends(require("manager", "reviewer"))):
    draft = get_draft(db, draft_id, user, lock=True)
    blocking = blocking_findings(db, draft)
    if user.role == "manager":
        if draft.status != "in_review":
            raise HTTPException(409, "This draft is not waiting for manager review.")
        if blocking:
            draft.status = "authorised_review"
            log(db, user, "sent_to_authorised_review",
                f"Manager approved; {len(blocking)} high-severity finding(s) still need an authorised reviewer", draft.id)
        else:
            draft.status = "approved"
            log(db, user, "approved", f"Version {draft.version} approved and locked", draft.id)
    else:
        if draft.status not in ("in_review", "authorised_review"):
            raise HTTPException(409, "This draft is not waiting for review.")
        if blocking:
            raise HTTPException(409, f"{len(blocking)} high-severity finding(s) are still open. Waive each with a reason, "
                                     "decide the dispute, or request changes.")
        draft.status = "approved"
        log(db, user, "approved", f"Version {draft.version} approved and locked", draft.id)
    db.commit()
    return detail(db, draft, user)


@router.post("/drafts/{draft_id}/comments")
def add_comment(draft_id: int, body: CommentIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    draft = get_draft(db, draft_id, user)
    db.add(Comment(draft_id=draft.id, finding_id=body.finding_id, user_id=user.id, text=body.text))
    log(db, user, "comment_added", body.text[:120], draft.id)
    db.commit()
    return detail(db, draft, user)
