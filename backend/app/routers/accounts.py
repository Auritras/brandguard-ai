"""Accounts and teams. Signing up creates a new brand with you as its Brand owner; the owner then adds
teammates. Nobody can join a brand without its owner, and no one can see another brand."""
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth import current_user, hash_password, make_token, require
from ..db import get_db
from ..models import Brand, User
from ..seed import seed_library
from .common import log

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


def user_out(u: User) -> dict:
    return {"id": u.id, "name": u.name, "email": u.email, "role": u.role,
            "brand": u.brand.name if u.brand else "", "demo_brand": bool(u.brand and u.brand.demo)}


def not_demo(user: User) -> None:
    if user.brand and user.brand.demo:
        raise HTTPException(403, "The demo brand's team is shared by every visitor and cannot be changed. Create your own brand to add people.")


def clean_email(db: Session, email: str) -> str:
    email = email.strip().lower()
    if not EMAIL.match(email):
        raise HTTPException(422, "Enter a valid email address.")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(409, "An account with this email already exists. Sign in instead.")
    return email


@router.post("/auth/signup")
def sign_up(body: SignUpIn, db: Session = Depends(get_db)):
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
    members = db.query(User).filter(User.brand_id == user.brand_id).order_by(User.id).all()
    return [{"id": m.id, "name": m.name, "email": m.email, "role": m.role, "you": m.id == user.id} for m in members]


@router.post("/team")
def add_member(body: MemberIn, db: Session = Depends(get_db), user: User = Depends(owner)):
    not_demo(user)
    if body.role not in ROLES:
        raise HTTPException(422, "Role must be creator, manager or reviewer.")
    member = User(brand_id=user.brand_id, name=body.name.strip(), email=clean_email(db, body.email),
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
