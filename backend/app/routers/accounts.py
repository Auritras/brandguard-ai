"""Accounts and teams. Signing up creates a new brand with you as its Brand owner; the owner then adds
teammates. Nobody can join a brand without its owner, and no one can see another brand."""
import re

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..limits import COMPARES, DEMO_COPIES, SIGN_UPS, client_ip
from ..auth import current_user, hash_password, make_token, require, verify_password
from ..db import get_db
from ..models import AuditLog, Brand, Draft, User
from ..sandbox import clear_old_sandboxes, create_sandbox
from ..seed import TEMPLATES, seed_library, template_key
from .common import iso, log

router = APIRouter(prefix="/api", tags=["accounts"])
owner = require("reviewer")

ROLES = {"creator": "Creator", "manager": "Manager", "reviewer": "Brand owner"}
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class SignUpIn(BaseModel):
    brand: str = Field(min_length=2, max_length=120)
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(max_length=200)
    password: str = Field(min_length=8, max_length=200)


class MemberIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(max_length=200)
    role: str
    password: str = Field(min_length=8, max_length=200)


class RoleIn(BaseModel):
    role: str


class PasswordIn(BaseModel):
    current: str
    new: str = Field(min_length=8, max_length=200)


def user_out(u: User) -> dict:
    return {"id": u.id, "name": u.name, "email": u.email, "role": u.role,
            "brand": u.brand.name if u.brand else "",
            "demo_key": template_key(u.brand.name) if u.brand and (u.brand.demo or u.brand.sandbox) else "",
            "demo_brand": bool(u.brand and (u.brand.demo or u.brand.sandbox)),
            "sandbox": bool(u.brand and u.brand.sandbox)}


def not_demo(user: User) -> None:
    if user.brand and (user.brand.demo or user.brand.sandbox):
        raise HTTPException(403, "Demo accounts and their team are fixed. Create your own brand to do this.")


def clean_email(db: Session, email: str) -> str:
    email = email.strip().lower()
    if not EMAIL.match(email):
        raise HTTPException(422, "Enter a valid email address.")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(409, "An account with this email already exists. Sign in instead.")
    return email


@router.post("/auth/signup")
def sign_up(body: SignUpIn, request: Request, db: Session = Depends(get_db)):
    SIGN_UPS.check(client_ip(request))
    email = clean_email(db, body.email)
    brand = Brand(name=body.brand.strip())
    db.add(brand)
    db.flush()
    user = User(brand_id=brand.id, name=body.name.strip(), email=email, role="reviewer",
                password_hash=hash_password(body.password))
    db.add(user)
    db.flush()
    seed_library(db, brand.id)  # a starter library to edit, so checks work from the first draft
    log(db, user, "brand_created", brand.name)
    db.commit()
    return {"token": make_token(user), "user": user_out(user)}


@router.get("/team")
def team(db: Session = Depends(get_db), user: User = Depends(current_user)):
    members = db.query(User).filter(User.brand_id == user.brand_id, User.active.isnot(False)).order_by(User.id).all()
    return [{"id": m.id, "name": m.name, "email": m.email, "role": m.role, "you": m.id == user.id} for m in members]


@router.get("/team/removed")
def removed(db: Session = Depends(get_db), user: User = Depends(owner)):
    gone = db.query(User).filter(User.brand_id == user.brand_id, User.active.is_(False)).order_by(User.name).all()
    return [{"id": m.id, "name": m.name, "email": m.email, "role": m.role} for m in gone]


@router.post("/team/{member_id}/restore")
def restore(member_id: int, db: Session = Depends(get_db), user: User = Depends(owner)):
    """Add a removed teammate back with the role and password they had."""
    not_demo(user)
    member = db.get(User, member_id)
    if member is None or member.brand_id != user.brand_id or member.active is not False:
        raise HTTPException(404, "No removed teammate with that id.")
    member.active = True
    log(db, user, "member_restored", f"{member.name} as {ROLES[member.role]}")
    db.commit()
    return team(db, user)


@router.get("/team/stats")
def team_stats(db: Session = Depends(get_db), user: User = Depends(current_user)):
    """For each teammate: what is waiting for them now, what they have done, and when they last acted.
    All from the drafts and the brand's history; visible to everyone in the brand."""
    from collections import Counter, defaultdict
    from .drafts import WAITING
    members = db.query(User).filter(User.brand_id == user.brand_id, User.active.isnot(False)).all()
    drafts = db.query(Draft).filter(Draft.brand_id == user.brand_id, Draft.deleted_at.is_(None)).all()
    done, last = defaultdict(Counter), {}
    for a in db.query(AuditLog).filter(AuditLog.brand_id == user.brand_id).order_by(AuditLog.id):
        done[a.user_id][a.action] += 1
        if a.action != "demo_started":
            last[a.user_id] = a.created_at
    out = {}
    for m in members:
        if m.role == "creator":  # their own drafts sent back to them
            waits = [d for d in drafts if d.creator_id == m.id and d.status in WAITING["creator"]]
        else:  # drafts to review, never their own (nobody approves their own work)
            waits = [d for d in drafts if d.status in WAITING.get(m.role, ()) and d.creator_id != m.id]
        c = done[m.id]
        out[m.id] = {
            "waiting": len(waits),
            "written": c["draft_created"], "sent": c["submitted_for_review"],
            "approved": c["approved"] + c["sent_to_authorised_review"], "waived": c["finding_waived"],
            "sent_back": c["changes_requested"], "comments": c["comment_added"],
            "last_active": iso(last.get(m.id)),
        }
    return out


@router.post("/team")
def add_member(body: MemberIn, db: Session = Depends(get_db), user: User = Depends(owner)):
    not_demo(user)
    if body.role not in ROLES:
        raise HTTPException(422, "Role must be creator, manager or reviewer.")
    email = body.email.strip().lower()
    member = db.query(User).filter(User.email == email).first()
    if member and member.brand_id == user.brand_id and member.active is False:
        # Someone removed earlier comes back with a new role and starting password.
        member.active, member.name, member.role = True, body.name.strip(), body.role
        member.password_hash = hash_password(body.password)
    else:
        member = User(brand_id=user.brand_id, name=body.name.strip(), email=clean_email(db, email),
                      role=body.role, password_hash=hash_password(body.password))
        db.add(member)
    log(db, user, "member_added", f"{member.name} as {ROLES[body.role]}")
    db.commit()
    return team(db, user)


@router.put("/team/{member_id}")
def change_role(member_id: int, body: RoleIn, db: Session = Depends(get_db), user: User = Depends(owner)):
    not_demo(user)
    member = db.get(User, member_id)
    if member is None or member.brand_id != user.brand_id:
        raise HTTPException(404, "Team member not found.")
    if body.role not in ROLES:
        raise HTTPException(422, "Role must be creator, manager or reviewer.")
    if member.id == user.id and body.role != "reviewer":
        others = db.query(User).filter(User.brand_id == user.brand_id, User.role == "reviewer", User.id != user.id).count()
        if not others:
            raise HTTPException(409, "Add another Brand owner before changing your own role.")
    member.role = body.role
    log(db, user, "role_changed", f"{member.name} is now {ROLES[body.role]}")
    db.commit()
    return team(db, user)


@router.delete("/team/{member_id}")
def remove_member(member_id: int, db: Session = Depends(get_db), user: User = Depends(owner)):
    """Switches the account off. Their name stays on the drafts and history they took part in."""
    not_demo(user)
    member = db.get(User, member_id)
    if member is None or member.brand_id != user.brand_id or member.active is False:
        raise HTTPException(404, "Team member not found.")
    if member.id == user.id:
        raise HTTPException(409, "You cannot remove yourself.")
    member.active = False
    log(db, user, "member_removed", member.name)
    db.commit()
    return team(db, user)


@router.get("/me/activity")
def activity(db: Session = Depends(get_db), user: User = Depends(current_user)):
    """What this person has done in their brand, from the audit log: totals and the latest actions."""
    rows = db.query(AuditLog).filter(AuditLog.user_id == user.id).order_by(AuditLog.id.desc()).all()
    count = lambda *actions: sum(1 for r in rows if r.action in actions)  # noqa: E731
    titles = {d.id: d.title for d in db.query(Draft).filter(Draft.id.in_({r.draft_id for r in rows if r.draft_id}))} if rows else {}
    return {
        "since": iso(user.brand.created_at) if user.brand else None,
        "totals": {
            "written": count("draft_created"),
            "checks": count("check_run"),
            "fixed": count("finding_accepted", "finding_edited"),
            "sent": count("submitted_for_review"),
            "approved": count("approved", "sent_to_authorised_review"),
            "waived": count("finding_waived"),
            "sent_back": count("changes_requested"),
            "comments": count("comment_added"),
        },
        "recent": [{"action": r.action, "detail": r.detail[:140], "draft_id": r.draft_id,
                    "draft": titles.get(r.draft_id, ""), "at": iso(r.created_at)}
                   for r in rows if r.action not in ("demo_started",)][:8],
    }


@router.put("/me/password")
def change_password(body: PasswordIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    not_demo(user)
    if not verify_password(body.current, user.password_hash):
        raise HTTPException(400, "Your current password is not right.")
    user.password_hash = hash_password(body.new)
    log(db, user, "password_changed")
    db.commit()
    return {"ok": True}


@router.get("/onboarding")
def onboarding(db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Progress on a new brand's first steps. The demo brand has none to show."""
    b = user.brand_id
    library = db.query(AuditLog).filter(AuditLog.brand_id == b, AuditLog.action.in_(
        ("rule_added", "rule_edited", "rule_approved", "rule_deleted", "fact_added", "fact_edited", "fact_deleted",
         "term_added", "term_deleted", "guidelines_imported"))).first() is not None
    return {
        "show": bool(user.brand and not user.brand.demo and not user.brand.sandbox and user.role == "reviewer"),
        "library_changed": library,
        "has_draft": db.query(Draft).filter(Draft.brand_id == b).first() is not None,
        "has_team": db.query(User).filter(User.brand_id == b, User.active.isnot(False)).count() > 1,
    }


class DemoIn(BaseModel):
    role: str
    brand: str = "lumio"  # which demo brand to copy (see seed.TEMPLATES)


@router.post("/demo/start")
def start_demo(body: DemoIn, request: Request, db: Session = Depends(get_db)):
    """A fresh private copy of the demo, signed in as the chosen role."""
    DEMO_COPIES.check(client_ip(request))
    if body.role not in ROLES:
        raise HTTPException(422, "Role must be creator, manager or reviewer.")
    if body.brand not in TEMPLATES:
        raise HTTPException(422, f"Demo brand must be one of: {', '.join(TEMPLATES)}.")
    clear_old_sandboxes(db)
    brand = create_sandbox(db, body.brand)
    user = db.query(User).filter(User.brand_id == brand.id, User.role == body.role).first()
    log(db, user, "demo_started")
    db.commit()
    return {"token": make_token(user), "user": user_out(user)}


class CompareIn(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


@router.post("/demo/compare")
def compare(body: CompareIn, request: Request, db: Session = Depends(get_db)):
    """The sign-in page's pitch: the same text through each demo brand's exact checks, side by side.
    No sign-in, no AI, nothing stored."""
    COMPARES.check(client_ip(request))
    from ..engine.exact import run_exact
    from ..models import Fact, Rule, Term
    from ..seed import demo_brand
    from .drafts import spans
    out = []
    for key, (name, *_rest) in TEMPLATES.items():
        b = demo_brand(db, key).id
        found = run_exact(body.text, db.query(Rule).filter(Rule.brand_id == b, Rule.status == "approved").all(),
                          db.query(Fact).filter(Fact.brand_id == b).all(), db.query(Term).filter(Term.brand_id == b).all())
        out.append({"key": key, "name": name, "findings": [
            {"quote": f["quote"], "severity": f["severity"], "ref_code": f["ref_code"], "reason": f["reason"], "suggestion": f["suggestion"],
             "spans": spans(body.text, f["quote"])} for f in found]})
    return out


@router.post("/demo/switch")
def switch_demo(body: DemoIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Become another person in the same demo copy, without signing out."""
    if not (user.brand and user.brand.sandbox):
        raise HTTPException(403, "Switching people only works inside a demo copy.")
    other = db.query(User).filter(User.brand_id == user.brand_id, User.role == body.role).first()
    if other is None:
        raise HTTPException(404, "That person is not in this demo.")
    return {"token": make_token(other), "user": user_out(other)}
