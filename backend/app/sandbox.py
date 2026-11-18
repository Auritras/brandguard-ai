"""Private demo copies. Each visitor who tries the demo gets their own copy of the Lumio Payroll demo
brand: its three accounts, Brand Library, drafts, findings, versions, comments and history. Nothing a
visitor does reaches the template or anyone else's copy.

Copies are made by duplicating rows (no AI calls), so one is ready in a moment. Dates are moved
forward so the newest activity in the copy reads as recent. Copies older than a day are removed.
"""
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from .auth import hash_password
from .models import (AuditLog, Brand, Comment, Draft, DraftImage, DraftVersion, Fact, Finding, ReviewRun, Rule, RuleVersion,
                     Term, User, now)
from .seed import demo_brand

KEEP_FOR = timedelta(hours=24)
TIMES = ("created_at", "updated_at", "deleted_at")


def _utc(dt):
    return dt.replace(tzinfo=timezone.utc) if dt is not None and dt.tzinfo is None else dt


def _fields(obj) -> dict:
    return {c.key: getattr(obj, c.key) for c in obj.__mapper__.column_attrs if c.key != "id"}


def _copy(db: Session, rows, shift, **remap) -> dict:
    """Copy rows, applying `remap` (column -> {old id: new id}) and moving times by `shift`.
    Returns {old id: new id}."""
    pairs = []
    for row in rows:
        data = _fields(row)
        for col, mapping in remap.items():
            if callable(mapping):
                data[col] = mapping(data[col])
            elif data.get(col) is not None:
                data[col] = mapping.get(data[col])
        for t in TIMES:
            if data.get(t) is not None:
                data[t] = _utc(data[t]) + shift
        new = type(row)(**data)
        db.add(new)
        pairs.append((row.id, new))
    db.flush()
    return {old: new.id for old, new in pairs}


def create_sandbox(db: Session, key: str = "lumio") -> Brand:
    template = demo_brand(db, key)
    t = template.id
    drafts = db.query(Draft).filter(Draft.brand_id == t, Draft.deleted_at.is_(None)).order_by(Draft.id).all()
    draft_ids = [d.id for d in drafts]
    logs = db.query(AuditLog).filter(AuditLog.brand_id == t).order_by(AuditLog.id).all()
    newest = max([_utc(d.updated_at) for d in drafts] + [_utc(a.created_at) for a in logs] or [now()])
    shift = now() - newest - timedelta(minutes=20)

    brand = Brand(name=template.name, demo=False, sandbox=True,
                  palette=template.palette, logo=template.logo, logo_type=template.logo_type)
    db.add(brand)
    db.flush()
    b = brand.id
    tag = secrets.token_hex(6)

    users = db.query(User).filter(User.brand_id == t).order_by(User.id).all()
    user_map = {}
    for u in users:
        copy = User(brand_id=b, name=u.name, role=u.role, active=True,
                    email=f"{u.role}-{tag}@sandbox.brandguard.test",
                    password_hash=hash_password(secrets.token_urlsafe(24)))  # sign-in is by token only
        db.add(copy)
        db.flush()
        user_map[u.id] = copy.id

    rule_map = {}
    for model in (Rule, Fact, Term):
        m = _copy(db, db.query(model).filter(model.brand_id == t).order_by(model.id), timedelta(0), brand_id=lambda _: b)
        if model is Rule:
            rule_map = m
    if rule_map:
        _copy(db, db.query(RuleVersion).filter(RuleVersion.rule_id.in_(list(rule_map))).order_by(RuleVersion.id),
              shift, rule_id=rule_map, user_id=user_map)
    draft_map = _copy(db, drafts, shift, brand_id=lambda _: b, creator_id=user_map)
    if draft_ids:
        _copy(db, db.query(DraftVersion).filter(DraftVersion.draft_id.in_(draft_ids)).order_by(DraftVersion.id),
              shift, draft_id=draft_map, user_id=user_map)
        _copy(db, db.query(ReviewRun).filter(ReviewRun.draft_id.in_(draft_ids)).order_by(ReviewRun.id),
              shift, draft_id=draft_map)
        image_map = _copy(db, db.query(DraftImage).filter(DraftImage.draft_id.in_(draft_ids)).order_by(DraftImage.id),
                          shift, draft_id=draft_map)
        finding_map = _copy(db, db.query(Finding).filter(Finding.draft_id.in_(draft_ids)).order_by(Finding.id),
                            shift, draft_id=draft_map, decided_by=user_map, image_id=image_map)
        _copy(db, db.query(Comment).filter(Comment.draft_id.in_(draft_ids)).order_by(Comment.id),
              shift, draft_id=draft_map, finding_id=finding_map, user_id=user_map)
    _copy(db, [a for a in logs if a.draft_id is None or a.draft_id in draft_map], shift,
          brand_id=lambda _: b, draft_id=draft_map, user_id=user_map)
    return brand


def delete_brand_data(db: Session, brand_id: int, keep_users: bool = False) -> None:
    """Remove a brand's drafts and everything hanging off them, its library and history."""
    draft_ids = [d for (d,) in db.query(Draft.id).filter(Draft.brand_id == brand_id)]
    if draft_ids:
        db.query(Comment).filter(Comment.draft_id.in_(draft_ids)).delete(synchronize_session=False)
        for model in (Finding, DraftImage, ReviewRun, DraftVersion, AuditLog):
            db.query(model).filter(model.draft_id.in_(draft_ids)).delete(synchronize_session=False)
        db.query(Draft).filter(Draft.id.in_(draft_ids)).delete(synchronize_session=False)
    db.query(AuditLog).filter(AuditLog.brand_id == brand_id).delete(synchronize_session=False)
    rule_ids = [r for (r,) in db.query(Rule.id).filter(Rule.brand_id == brand_id)]
    if rule_ids:
        db.query(RuleVersion).filter(RuleVersion.rule_id.in_(rule_ids)).delete(synchronize_session=False)
    for model in (Rule, Fact, Term):
        db.query(model).filter(model.brand_id == brand_id).delete(synchronize_session=False)
    if not keep_users:
        db.query(User).filter(User.brand_id == brand_id).delete(synchronize_session=False)
        db.query(Brand).filter(Brand.id == brand_id).delete(synchronize_session=False)


def clear_old_sandboxes(db: Session, older_than: timedelta = KEEP_FOR) -> int:
    cutoff = now() - older_than
    old = [b for b in db.query(Brand).filter(Brand.sandbox.is_(True)) if _utc(b.created_at) < cutoff]
    for brand in old:
        delete_brand_data(db, brand.id)
    return len(old)
