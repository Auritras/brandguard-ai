"""Brand Library: approved rules, facts and terms. Members of a brand read its library; only that brand's
owner (reviewer) writes. Nothing here can see or touch another brand's library."""
import re
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth import current_user, require
from ..db import get_db
from ..engine.ai import propose_rules
from ..models import Fact, Rule, Term, User
from .common import log

router = APIRouter(prefix="/api", tags=["library"])
owner = require("reviewer")

CATEGORIES = {"tone", "claims", "messaging", "accessibility"}
SEVERITIES = {"low", "medium", "high"}


class RuleIn(BaseModel):
    category: str
    title: str = Field(min_length=2, max_length=200)
    text: str = Field(min_length=5)
    severity: str = "medium"
    patterns: str = ""


class FactIn(BaseModel):
    statement: str = Field(min_length=5)
    keywords: str = ""
    value: str = ""
    source: str = ""
    valid_until: date | None = None


class TermIn(BaseModel):
    banned: str = Field(min_length=1, max_length=120)
    preferred: str = Field(min_length=1, max_length=120)
    note: str = ""


class ImportIn(BaseModel):
    text: str = Field(min_length=20)


def rule_out(r: Rule) -> dict:
    return {"id": r.id, "code": r.code, "category": r.category, "title": r.title, "text": r.text,
            "severity": r.severity, "patterns": r.patterns, "status": r.status,
            "checked_by": "code" if (r.patterns or "").strip() else "AI"}


def fact_out(f: Fact) -> dict:
    return {"id": f.id, "code": f.code, "statement": f.statement, "keywords": f.keywords, "value": f.value,
            "source": f.source, "valid_until": f.valid_until.isoformat() if f.valid_until else None,
            "expired": bool(f.valid_until and f.valid_until < date.today())}


def term_out(t: Term) -> dict:
    return {"id": t.id, "banned": t.banned, "preferred": t.preferred, "note": t.note}


def own(db: Session, model, item_id: int, user: User, label: str):
    """Fetch one row of this user's brand; another brand's row is treated as missing."""
    item = db.get(model, item_id)
    if item is None or item.brand_id != user.brand_id:
        raise HTTPException(404, f"{label} not found.")
    return item


def next_code(db: Session, model, prefix: str, brand_id: int) -> str:
    highest = 0
    for (code,) in db.query(model.code).filter(model.brand_id == brand_id):
        m = re.fullmatch(prefix + r"-(\d+)", code)
        if m:
            highest = max(highest, int(m.group(1)))
    return f"{prefix}-{highest + 1:03d}"


def clean_rule(body: RuleIn) -> dict:
    if body.category not in CATEGORIES:
        raise HTTPException(422, f"Category must be one of: {', '.join(sorted(CATEGORIES))}.")
    if body.severity not in SEVERITIES:
        raise HTTPException(422, "Severity must be low, medium or high.")
    for line in body.patterns.splitlines():
        if line.strip():
            try:
                re.compile(line.strip())
            except re.error as e:
                raise HTTPException(422, f"Pattern \"{line.strip()}\" is not valid: {e}")
    return body.model_dump()


@router.get("/library")
def get_library(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return {
        "rules": [rule_out(r) for r in db.query(Rule).filter(Rule.brand_id == user.brand_id).order_by(Rule.status.desc(), Rule.code)],
        "facts": [fact_out(f) for f in db.query(Fact).filter(Fact.brand_id == user.brand_id).order_by(Fact.code)],
        "terms": [term_out(t) for t in db.query(Term).filter(Term.brand_id == user.brand_id).order_by(Term.banned)],
    }


@router.post("/rules")
def create_rule(body: RuleIn, db: Session = Depends(get_db), user: User = Depends(owner)):
    rule = Rule(brand_id=user.brand_id, code=next_code(db, Rule, "R", user.brand_id), status="approved", **clean_rule(body))
    db.add(rule)
    log(db, user, "rule_added", f"{rule.code} {rule.title}")
    db.commit()
    return rule_out(rule)


@router.put("/rules/{rule_id}")
def update_rule(rule_id: int, body: RuleIn, db: Session = Depends(get_db), user: User = Depends(owner)):
    rule = own(db, Rule, rule_id, user, "Rule")
    for key, value in clean_rule(body).items():
        setattr(rule, key, value)
    log(db, user, "rule_edited", f"{rule.code} {rule.title}")
    db.commit()
    return rule_out(rule)


@router.post("/rules/{rule_id}/approve")
def approve_rule(rule_id: int, db: Session = Depends(get_db), user: User = Depends(owner)):
    rule = own(db, Rule, rule_id, user, "Rule")
    rule.status = "approved"
    log(db, user, "rule_approved", f"{rule.code} {rule.title}")
    db.commit()
    return rule_out(rule)


@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: int, db: Session = Depends(get_db), user: User = Depends(owner)):
    rule = own(db, Rule, rule_id, user, "Rule")
    log(db, user, "rule_deleted", f"{rule.code} {rule.title}")
    db.delete(rule)
    db.commit()
    return {"ok": True}


@router.post("/library/import")
def import_guidelines(body: ImportIn, db: Session = Depends(get_db), user: User = Depends(owner)):
    """Turn pasted guideline text into PROPOSED rules. None is used in a review until the owner approves it."""
    proposals, note = propose_rules(body.text)
    created = []
    for p in proposals:
        category = str(p.get("category", "tone")).lower()
        severity = str(p.get("severity", "medium")).lower()
        rule = Rule(
            brand_id=user.brand_id, code=next_code(db, Rule, "R", user.brand_id), status="proposed",
            category=category if category in CATEGORIES else "tone",
            severity=severity if severity in SEVERITIES else "medium",
            title=str(p.get("title") or p.get("text"))[:200], text=str(p.get("text")), patterns="",
        )
        db.add(rule)
        db.flush()
        created.append(rule)
    log(db, user, "guidelines_imported", f"{len(created)} rule(s) proposed")
    db.commit()
    return {"note": note, "rules": [rule_out(r) for r in created]}


@router.post("/facts")
def create_fact(body: FactIn, db: Session = Depends(get_db), user: User = Depends(owner)):
    fact = Fact(brand_id=user.brand_id, code=next_code(db, Fact, "F", user.brand_id), **body.model_dump())
    db.add(fact)
    log(db, user, "fact_added", f"{fact.code} {fact.statement}")
    db.commit()
    return fact_out(fact)


@router.put("/facts/{fact_id}")
def update_fact(fact_id: int, body: FactIn, db: Session = Depends(get_db), user: User = Depends(owner)):
    fact = own(db, Fact, fact_id, user, "Fact")
    for key, value in body.model_dump().items():
        setattr(fact, key, value)
    log(db, user, "fact_edited", f"{fact.code} {fact.statement}")
    db.commit()
    return fact_out(fact)


@router.delete("/facts/{fact_id}")
def delete_fact(fact_id: int, db: Session = Depends(get_db), user: User = Depends(owner)):
    fact = own(db, Fact, fact_id, user, "Fact")
    log(db, user, "fact_deleted", f"{fact.code} {fact.statement}")
    db.delete(fact)
    db.commit()
    return {"ok": True}


@router.post("/terms")
def create_term(body: TermIn, db: Session = Depends(get_db), user: User = Depends(owner)):
    term = Term(brand_id=user.brand_id, **body.model_dump())
    db.add(term)
    log(db, user, "term_added", f"{term.banned} -> {term.preferred}")
    db.commit()
    return term_out(term)


@router.delete("/terms/{term_id}")
def delete_term(term_id: int, db: Session = Depends(get_db), user: User = Depends(owner)):
    term = own(db, Term, term_id, user, "Term")
    log(db, user, "term_deleted", f"{term.banned} -> {term.preferred}")
    db.delete(term)
    db.commit()
    return {"ok": True}
