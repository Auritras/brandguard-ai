"""Drafts, findings and the approval workflow.

States: draft -> in_review -> (changes_requested | authorised_review | approved)
Only people move a draft forward. The automated check never approves anything.
"""
import contextvars
from types import SimpleNamespace
import json
import re
from datetime import date, timedelta

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth import current_user, make_file_token, read_file_token, require
from ..db import get_db
from ..engine.extract import extract_text
from ..engine.exact import run_exact
from ..engine.image import prepare
from ..engine.run import run_review
from ..models import now, AuditLog, Comment, Draft, DraftImage, DraftVersion, Fact, Finding, ReviewRun, Rule, Term, User
from .. import config
from ..limits import CHECKS
from .common import iso, log, plural

# The version of the draft page the person was looking at when they acted (the newest history line they
# had seen). Set per request from the X-Seen-Rev header; see fresh() below.
SEEN = contextvars.ContextVar("seen_rev", default=None)


async def capture_seen(x_seen_rev: str | None = Header(None)):
    SEEN.set(int(x_seen_rev) if x_seen_rev and x_seen_rev.isdigit() else None)


router = APIRouter(prefix="/api", tags=["drafts"], dependencies=[Depends(capture_seen)])

EDITABLE = ("draft", "changes_requested")
BLOCKING = ("open", "disputed")  # a high-severity finding in one of these states blocks approval


MAX_BODY = 20000  # characters: about eight pages, far more than any post, ad or email


class DraftIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    channel: str = Field("", max_length=60)
    audience: str = Field("", max_length=200)
    purpose: str = Field("", max_length=1000)
    body: str = Field(min_length=1, max_length=MAX_BODY)
    due_date: date | None = None


class BodyIn(BaseModel):
    body: str = Field(min_length=1, max_length=MAX_BODY)
    channel: str = Field("", max_length=60)  # only used by the live check, for channel limits


class DueIn(BaseModel):
    due_date: date | None = None


class EditIn(BaseModel):
    replacement: str = Field(max_length=5000)


class ReasonIn(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)


class DecideIn(BaseModel):
    decision: str  # uphold | dismiss
    reason: str = Field(min_length=3, max_length=1000)


class NoteIn(BaseModel):
    note: str = Field(min_length=3, max_length=2000)


class CommentIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    finding_id: int | None = None


# ---------- helpers ----------

def get_draft(db: Session, draft_id: int, user: User, lock: bool = False) -> Draft:
    """`lock` holds the draft's row until the request commits, so two people acting on the same
    draft at the same moment are handled one after the other (Postgres; SQLite has no row locks)."""
    draft = db.get(Draft, draft_id, with_for_update=lock)
    if draft is None or draft.deleted_at is not None or draft.brand_id != user.brand_id \
            or (user.role == "creator" and draft.creator_id != user.id):
        raise HTTPException(404, "Draft not found.")
    if lock:
        fresh(db, draft, user)
    return draft


QUIET = ("comment_added", "check_run", "demo_started")  # nothing on the page that a decision depends on


def fresh(db: Session, draft: Draft, user: User) -> None:
    """Two people on one draft: if someone else changed it after this person's page was loaded, refuse the
    action and say who did what, instead of acting on a page that is out of date."""
    seen = SEEN.get()
    if seen is None:
        return
    newer = db.query(AuditLog).filter(AuditLog.draft_id == draft.id, AuditLog.id > seen, AuditLog.user_id != user.id,
                                      AuditLog.action.notin_(QUIET)).order_by(AuditLog.id.desc()).first()
    if newer:
        who = newer.user.name.split(" (")[0]
        raise HTTPException(409, f"{who} {ACTION_TEXT.get(newer.action, 'changed this draft')} a moment ago, so your page was "
                                 "out of date. It now shows the latest; check it and try again if it still applies.")


ACTION_TEXT = {"approved": "approved this draft", "sent_to_authorised_review": "approved and escalated this draft",
               "changes_requested": "sent this draft back for changes", "finding_waived": "waived a finding",
               "dispute_rejected": "rejected a dispute", "dispute_accepted": "dismissed a finding",
               "submitted_for_review": "sent this draft for review", "draft_edited": "edited the text",
               "finding_accepted": "accepted a fix", "finding_edited": "changed the text", "finding_disputed": "disputed a finding",
               "image_added": "added an image", "image_removed": "removed an image", "draft_deleted": "deleted this draft"}


def get_finding(db: Session, finding_id: int, user: User) -> tuple[Finding, Draft]:
    finding = db.get(Finding, finding_id)
    if finding is None:
        raise HTTPException(404, "Finding not found.")
    return finding, get_draft(db, finding.draft_id, user, lock=True)


def not_own(draft: Draft, user: User) -> None:
    """Four eyes: approvals, waivers and dispute decisions always come from someone other than the writer."""
    if draft.creator_id == user.id:
        raise HTTPException(403, "You wrote this draft, so someone else on your team has to review it.")


def own_editable(draft: Draft, user: User) -> None:
    if draft.creator_id != user.id:
        raise HTTPException(403, "Only the creator of this draft can do this.")
    if draft.status not in EDITABLE:
        raise HTTPException(409, "This draft is with reviewers and cannot be changed right now.")


def find_quote(body: str, quote: str) -> int:
    """Where a finding's quote is in the text, as a whole word or phrase ("Lumio Pay" is not found inside
    "Lumio Payroll"). -1 if it is not there."""
    hits = spans(body, quote)
    return hits[0][0] if hits else -1


def replace_at(body: str, start: int, old: str, new: str) -> str:
    return body[:start] + new + body[start + len(old):]


def carry_over(db: Session, draft: Draft, before: str, start: int, old: str, new: str, done: Finding) -> None:
    """A fix replaced `old` at `start` in `before` with `new`. Other open findings whose quoted passage
    contains that spot (a term inside a sentence flagged for its number, say) follow the change, so their
    own fixes still apply."""
    end = start + len(old)
    for f in db.query(Finding).filter(Finding.draft_id == draft.id, Finding.status == "open", Finding.image_id.is_(None)):
        p = before.find(f.quote)
        if f is done or p == -1 or not (p <= start and end <= p + len(f.quote)) or f.quote == old:
            continue
        f.quote = before[p:start] + new + before[end:p + len(f.quote)]
        if f.suggestion:
            f.suggestion = re.sub(r"(?<![\w-])" + re.escape(old) + r"(?![\w-])", new.replace("\\", "\\\\"), f.suggestion, count=1)


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
            "suggestion": f.suggestion, "status": f.status, "note": f.note, "image_id": f.image_id,
            "certain": is_certain(f)}


def image_out(img: DraftImage) -> dict:
    try:
        analysis = json.loads(img.analysis) if img.analysis else None
    except ValueError:
        analysis = None
    return {"id": img.id, "filename": img.filename, "width": img.width, "height": img.height, "alt_text": img.alt_text,
            "url": f"/api/images/{img.id}?t={make_file_token('img', img.id)}", "analysis": analysis}


def summary(db: Session, d: Draft) -> dict:
    findings = db.query(Finding).filter(Finding.draft_id == d.id).all()
    return {"id": d.id, "title": d.title, "channel": d.channel, "status": d.status, "version": d.version,
            "creator": d.creator.name, "updated_at": iso(d.updated_at), "created_at": iso(d.created_at),
            "due_date": d.due_date.isoformat() if d.due_date else None,
            "open": sum(1 for f in findings if f.status == "open"),
            "disputed": sum(1 for f in findings if f.status == "disputed"),
            "blocking": sum(1 for f in findings if f.severity == "high" and f.status in BLOCKING),
            "score": score(d, findings)}


WEIGHT = {"high": 15, "medium": 6, "low": 2}


def score(d: Draft, findings: list) -> int | None:
    """How ready the draft is to send, 0 to 100: 100, less 15 for each open high-risk finding, 6 for each
    medium and 2 for each low. A summary of what is left to handle, not a judgement of the writing.
    None until the draft has been checked."""
    if not d.checked_version:
        return None
    return max(0, 100 - sum(WEIGHT.get(f.severity, 0) for f in findings if f.status in BLOCKING))


def is_certain(f: Finding) -> bool:
    """Fixes made by plain code, not by AI: a preferred term, or the approved figure for a wrong number."""
    return bool(f.suggestion) and f.image_id is None and (f.ref_code == "TERM" or f.ref_code.startswith("F-"))


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
        "mine": is_owner,
        # The newest history line: sent back with each action, so changes by others are noticed (see fresh()).
        "rev": db.query(AuditLog.id).filter(AuditLog.draft_id == d.id).order_by(AuditLog.id.desc()).limit(1).scalar() or 0,
        "findings": [finding_out(f) for f in findings],
        "images": [image_out(i) for i in db.query(DraftImage).filter(DraftImage.draft_id == d.id).order_by(DraftImage.id)],
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
            "delete": is_owner and d.status == "draft" and not (user.brand and user.brand.demo) and not db.query(AuditLog).filter(
                AuditLog.draft_id == d.id, AuditLog.action == "submitted_for_review").first(),
            "submit": is_owner and d.status in EDITABLE,
            "decide_disputes": not is_owner and user.role in ("manager", "reviewer") and d.status in ("in_review", "authorised_review"),
            "approve": not is_owner and ((user.role == "manager" and d.status == "in_review")
                                         or (user.role == "reviewer" and d.status in ("in_review", "authorised_review"))),
            "request_changes": not is_owner and ((user.role == "manager" and d.status == "in_review")
                                                 or (user.role == "reviewer" and d.status in ("in_review", "authorised_review"))),
            "waive": not is_owner and user.role == "reviewer" and d.status in ("in_review", "authorised_review"),
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
    q = db.query(Draft).filter(Draft.brand_id == user.brand_id, Draft.deleted_at.is_(None))
    if user.role == "creator":
        q = q.filter(Draft.creator_id == user.id)
    return [summary(db, d) for d in q.order_by(Draft.updated_at.desc())]


# What counts as "waiting for you": the same rule the drafts list uses for its orange marks.
WAITING = {"creator": ("changes_requested",), "manager": ("in_review",), "reviewer": ("authorised_review", "in_review")}


@router.get("/waiting")
def waiting(db: Session = Depends(get_db), user: User = Depends(current_user)):
    q = db.query(Draft).filter(Draft.brand_id == user.brand_id, Draft.deleted_at.is_(None),
                               Draft.status.in_(WAITING.get(user.role, ())))
    if user.role == "creator":
        q = q.filter(Draft.creator_id == user.id)
    return {"count": q.count()}


@router.post("/drafts")
def create_draft(body: DraftIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    draft = Draft(brand_id=user.brand_id, creator_id=user.id, **body.model_dump())
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
    draft = get_draft(db, draft_id, user, lock=True)
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
    text = body.body[:MAX_BODY]
    b = user.brand_id
    rules = db.query(Rule).filter(Rule.brand_id == b, Rule.status == "approved").all()
    found = run_exact(text, rules, db.query(Fact).filter(Fact.brand_id == b).all(), db.query(Term).filter(Term.brand_id == b).all(),
                      channel=body.channel)
    return [{"quote": f["quote"], "severity": f["severity"], "ref_code": f["ref_code"], "reason": f["reason"],
             "suggestion": f["suggestion"], "spans": spans(text, f["quote"])} for f in found]


@router.delete("/drafts/{draft_id}")
def delete_draft(draft_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Only the creator, and only before it was ever sent for review. The draft is hidden, not erased."""
    draft = get_draft(db, draft_id, user, lock=True)
    if draft.creator_id != user.id:
        raise HTTPException(403, "Only the creator of this draft can delete it.")
    if user.brand and user.brand.demo:
        raise HTTPException(403, "Drafts in the shared demo brand stay for the next visitor. Create your own brand to delete drafts.")
    sent = db.query(AuditLog).filter(AuditLog.draft_id == draft.id, AuditLog.action == "submitted_for_review").first()
    if draft.status != "draft" or sent:
        raise HTTPException(409, "This draft has been sent for review, so it stays on the record.")
    draft.deleted_at = now()
    log(db, user, "draft_deleted", draft.title, draft.id)
    db.commit()
    return {"ok": True}


@router.post("/drafts/{draft_id}/check")
def check_draft(draft_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    draft = get_draft(db, draft_id, user, lock=True)
    own_editable(draft, user)
    # A double click, or a second tab, should not run (and pay for) the same check twice.
    last = db.query(ReviewRun).filter(ReviewRun.draft_id == draft.id).order_by(ReviewRun.id.desc()).first()
    if last and last.version == draft.version and draft.checked_version == draft.version and (last.ai_used or not config.AI_API_KEY) \
            and now() - (last.created_at if last.created_at.tzinfo else last.created_at.replace(tzinfo=now().tzinfo)) < timedelta(seconds=15):
        return detail(db, draft, user)
    CHECKS.check(f"user:{user.id}")
    run = run_review(db, draft)
    log(db, user, "check_run",
        f"Version {draft.version}: {run.exact_count} exact, {run.ai_count} AI, {plural(run.dropped_count, 'AI finding')} dropped by verification",
        draft.id)
    db.commit()
    return detail(db, draft, user)


# ---------- findings: the creator's choices ----------

def apply_fix(db: Session, finding: Finding, draft: Draft, user: User, replacement: str, status: str) -> None:
    if finding.status != "open":
        raise HTTPException(409, "This finding has already been handled.")
    if finding.ref_code.startswith("CH-"):
        raise HTTPException(409, "This is about the whole text. Shorten it with Edit text, then run the check again.")
    if finding.image_id is not None:
        return apply_image_fix(db, finding, draft, user, replacement, status)
    before, start = draft.body, find_quote(draft.body, finding.quote)
    if start == -1:
        raise HTTPException(409, "The quoted text is no longer in the draft. Run the check again.")
    new_version(db, draft, user, replace_at(draft.body, start, finding.quote, replacement),
                f"{'Accepted' if status == 'accepted' else 'Own fix for'} {finding.ref_code}")
    carry_over(db, draft, before, start, finding.quote, replacement, finding)
    finding.status, finding.decided_by = status, user.id
    finding.note = f"Replaced with: {replacement}"
    log(db, user, f"finding_{status}", f"{finding.ref_code}: \"{finding.quote}\" -> \"{replacement}\"", draft.id)
    db.commit()


def apply_image_fix(db: Session, finding: Finding, draft: Draft, user: User, replacement: str, status: str) -> None:
    """Only the missing description can be fixed here. Everything else is in the pixels: replace the
    image, or dispute the finding."""
    img = db.get(DraftImage, finding.image_id)
    if img is None or img.draft_id != draft.id:
        raise HTTPException(409, "That image has been removed. Run the check again.")
    if finding.ref_code != "VIS-ALT":
        raise HTTPException(409, "This is inside the image, so it cannot be fixed here. Replace the image, or dispute the finding.")
    if not replacement.strip():
        raise HTTPException(422, "Write a description for the image.")
    img.alt_text = replacement.strip()[:1000]
    new_version(db, draft, user, draft.body, f"{'Accepted' if status == 'accepted' else 'Own'} image description")
    finding.status, finding.decided_by = status, user.id
    finding.note = f"Description: {img.alt_text}"
    log(db, user, f"finding_{status}", f"VIS-ALT: image described as \"{img.alt_text[:120]}\"", draft.id)
    db.commit()


@router.post("/drafts/{draft_id}/accept-certain")
@router.post("/drafts/{draft_id}/accept-low")  # the earlier name
def accept_certain(draft_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Apply every certain fix at once, as one new version: preferred terms and approved figures, which come
    from code, not AI. AI-written rewrites are still accepted one by one by a person."""
    draft = get_draft(db, draft_id, user, lock=True)
    own_editable(draft, user)
    todo = [f for f in db.query(Finding).filter(Finding.draft_id == draft.id, Finding.status == "open").order_by(Finding.id)
            if is_certain(f) and find_quote(draft.body, f.quote) != -1]
    if not todo:
        raise HTTPException(409, "There are no certain fixes left to apply.")
    body = draft.body
    done = []
    for f in todo:
        start = find_quote(body, f.quote)
        if start != -1:
            before = body
            body = replace_at(body, start, f.quote, f.suggestion)
            f.status, f.decided_by, f.note = "accepted", user.id, f"Replaced with: {f.suggestion}"
            carry_over(db, draft, before, start, f.quote, f.suggestion, f)
            done.append(f"{f.ref_code}: \"{f.quote}\" -> \"{f.suggestion}\"")
    new_version(db, draft, user, body, f"Applied {len(done)} certain fix(es)")
    log(db, user, "finding_accepted", "; ".join(done)[:1000], draft.id)
    db.commit()
    return detail(db, draft, user)


@router.put("/drafts/{draft_id}/due")
def set_due(draft_id: int, body: DueIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    draft = get_draft(db, draft_id, user, lock=True)
    if draft.status == "approved":
        raise HTTPException(409, "This draft is approved already.")
    draft.due_date = body.due_date
    log(db, user, "due_date_set", body.due_date.isoformat() if body.due_date else "No due date", draft.id)
    db.commit()
    return detail(db, draft, user)


@router.get("/recheck")
def recheck(db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Approved content that no longer matches the Brand Library: a fact it uses has expired, or its
    approved number has changed since. Exact checks only, so this is instant and free."""
    b = user.brand_id
    q = db.query(Draft).filter(Draft.brand_id == b, Draft.deleted_at.is_(None), Draft.status == "approved")
    if user.role == "creator":
        q = q.filter(Draft.creator_id == user.id)
    facts = db.query(Fact).filter(Fact.brand_id == b).all()
    out = []
    for d in q.order_by(Draft.updated_at.desc()):
        issues = [x for x in run_exact(d.body, [], facts, []) if x["ref_code"].startswith("F-")]
        if issues:
            out.append({"id": d.id, "title": d.title, "channel": d.channel,
                        "issues": [{"ref_code": x["ref_code"], "reason": x["reason"]} for x in issues]})
    return out


@router.post("/drafts/{draft_id}/share")
def share(draft_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """A read-only link to this draft's review record, valid for 30 days, for people without an account."""
    draft = get_draft(db, draft_id, user)
    token = make_file_token("record", draft.id, hours=24 * 30)
    log(db, user, "record_shared", "Read-only link, valid 30 days", draft.id)
    db.commit()
    return {"path": f"/share/{draft.id}?t={token}", "days": 30}


@router.get("/public/record/{draft_id}")
def public_record(draft_id: int, t: str = "", db: Session = Depends(get_db)):
    if read_file_token(t, "record") != draft_id:
        raise HTTPException(401, "This link has expired or is not valid. Ask for a new one.")
    draft = db.get(Draft, draft_id)
    if draft is None or draft.deleted_at is not None:
        raise HTTPException(404, "This record is no longer available.")
    viewer = SimpleNamespace(id=-1, role="viewer", brand=None)
    out = detail(db, draft, viewer)
    out["shared"] = True
    return out


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
    not_own(draft, user)
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
    not_own(draft, user)
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
    not_own(draft, user)
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
    not_own(draft, user)
    blocking = blocking_findings(db, draft)
    if user.role == "manager":
        if draft.status != "in_review":
            raise HTTPException(409, "This draft is not waiting for manager review.")
        if blocking:
            draft.status = "authorised_review"
            log(db, user, "sent_to_authorised_review",
                f"Manager approved; {plural(len(blocking), 'high-severity finding')} still {'needs' if len(blocking) == 1 else 'need'} an authorised reviewer", draft.id)
        else:
            draft.status = "approved"
            log(db, user, "approved", f"Version {draft.version} approved and locked", draft.id)
    else:
        if draft.status not in ("in_review", "authorised_review"):
            raise HTTPException(409, "This draft is not waiting for review.")
        if blocking:
            raise HTTPException(409, f"{plural(len(blocking), 'high-severity finding')} {'is' if len(blocking) == 1 else 'are'} still open. Waive each with a reason, "
                                     "decide the dispute, or request changes.")
        draft.status = "approved"
        log(db, user, "approved", f"Version {draft.version} approved and locked", draft.id)
    db.commit()
    return detail(db, draft, user)


# ---------- images ----------

MAX_IMAGES = 4


@router.post("/drafts/{draft_id}/images")
async def add_image(draft_id: int, file: UploadFile = File(...), alt_text: str = Form(""),
                    db: Session = Depends(get_db), user: User = Depends(current_user)):
    draft = get_draft(db, draft_id, user, lock=True)
    own_editable(draft, user)
    if db.query(DraftImage).filter(DraftImage.draft_id == draft.id).count() >= MAX_IMAGES:
        raise HTTPException(409, f"A draft can have up to {MAX_IMAGES} images.")
    try:
        data, mime, w, h = prepare(await file.read())
    except ValueError as e:
        raise HTTPException(422, str(e))
    name = (file.filename or "image")[:200]
    db.add(DraftImage(draft_id=draft.id, filename=name, mime=mime, data=data, width=w, height=h, alt_text=alt_text.strip()[:1000]))
    new_version(db, draft, user, draft.body, f"Image added: {name}")
    log(db, user, "image_added", name, draft.id)
    db.commit()
    return detail(db, draft, user)


class AltIn(BaseModel):
    alt_text: str = Field(max_length=1000)


def own_image(db: Session, image_id: int, user: User) -> tuple[DraftImage, Draft]:
    img = db.get(DraftImage, image_id)
    if img is None:
        raise HTTPException(404, "Image not found.")
    draft = get_draft(db, img.draft_id, user, lock=True)
    own_editable(draft, user)
    return img, draft


@router.put("/images/{image_id}")
def describe_image(image_id: int, body: AltIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    img, draft = own_image(db, image_id, user)
    if body.alt_text.strip() != img.alt_text:
        img.alt_text = body.alt_text.strip()
        new_version(db, draft, user, draft.body, "Image description changed")
        log(db, user, "image_described", img.alt_text[:120], draft.id)
        db.commit()
    return detail(db, draft, user)


@router.delete("/images/{image_id}")
def remove_image(image_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    img, draft = own_image(db, image_id, user)
    # Open findings about the image go with it; decided ones stay on the record without the picture.
    db.query(Finding).filter(Finding.image_id == img.id, Finding.status == "open").delete()
    db.query(Finding).filter(Finding.image_id == img.id).update({Finding.image_id: None})
    name = img.filename
    db.delete(img)
    new_version(db, draft, user, draft.body, f"Image removed: {name}")
    log(db, user, "image_removed", name, draft.id)
    db.commit()
    return detail(db, draft, user)


@router.get("/images/{image_id}")
def image_file(image_id: int, t: str = "", db: Session = Depends(get_db)):
    """Loaded by <img> tags, so it is authorised by the link token from the draft page, not a header."""
    if read_file_token(t, "img") != image_id:
        raise HTTPException(401, "This image link has expired. Reload the page.")
    img = db.get(DraftImage, image_id)
    if img is None:
        raise HTTPException(404, "Image not found.")
    return Response(img.data, media_type=img.mime, headers={"Cache-Control": "private, max-age=3600"})


@router.get("/sample-image")
def sample_image(user: User = Depends(current_user)):
    """The demo's sample post image for this brand, with problems planted for image review to find."""
    from ..samples import sample_png
    from ..seed import template_key
    return Response(sample_png(template_key(user.brand.name if user.brand else "")), media_type="image/png")


@router.post("/drafts/{draft_id}/comments")
def add_comment(draft_id: int, body: CommentIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    draft = get_draft(db, draft_id, user)
    last = db.query(Comment).filter(Comment.draft_id == draft.id).order_by(Comment.id.desc()).first()
    if last and last.user_id == user.id and last.text == body.text:
        return detail(db, draft, user)  # the same comment sent twice (double click, or a retry): keep one
    db.add(Comment(draft_id=draft.id, finding_id=body.finding_id, user_id=user.id, text=body.text))
    log(db, user, "comment_added", body.text[:120], draft.id)
    db.commit()
    return detail(db, draft, user)
