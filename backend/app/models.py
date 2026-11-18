"""Database tables. Each brand is its own workspace: its people, Brand Library and drafts are only
ever visible to members of that brand."""
from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, LargeBinary, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def now():
    return datetime.now(timezone.utc)


class Brand(Base):
    __tablename__ = "brands"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    demo: Mapped[bool] = mapped_column(Boolean, default=False)  # the Lumio Payroll template that demo copies come from
    sandbox: Mapped[bool] = mapped_column(Boolean, default=False)  # one visitor's private copy of the demo
    # Visual identity for image review: brand colours as "#1b2a4a,#1f9e89", and the official logo.
    palette: Mapped[str] = mapped_column(String(300), default="")
    logo: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True, deferred=True)
    logo_type: Mapped[str] = mapped_column(String(40), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


def brand_column():
    return mapped_column(ForeignKey("brands.id"), index=True, nullable=True)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    brand_id: Mapped[int] = brand_column()
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(300))
    role: Mapped[str] = mapped_column(String(20))  # creator | manager | reviewer
    active: Mapped[bool] = mapped_column(Boolean, default=True)  # removed teammates are switched off, not deleted
    brand: Mapped[Brand] = relationship()


class Rule(Base):
    __tablename__ = "rules"
    id: Mapped[int] = mapped_column(primary_key=True)
    brand_id: Mapped[int] = brand_column()
    code: Mapped[str] = mapped_column(String(20), index=True)  # R-001  (unique within a brand)
    category: Mapped[str] = mapped_column(String(40))  # tone | claims | messaging | accessibility
    title: Mapped[str] = mapped_column(String(200))
    text: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(10), default="medium")  # low | medium | high
    # Optional: one regex per line. If set, the rule is checked exactly by code, never by AI.
    patterns: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(12), default="approved")  # proposed | approved
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    versions: Mapped[list["RuleVersion"]] = relationship(order_by="RuleVersion.number", viewonly=True)


class RuleVersion(Base):
    """A rule as it was before a change: the wording history behind guideline-gap rewrites."""
    __tablename__ = "rule_versions"
    id: Mapped[int] = mapped_column(primary_key=True)
    rule_id: Mapped[int] = mapped_column(ForeignKey("rules.id"), index=True)
    number: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(200))
    text: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(10))
    category: Mapped[str] = mapped_column(String(40))
    patterns: Mapped[str] = mapped_column(Text, default="")
    note: Mapped[str] = mapped_column(String(300), default="")  # why it was changed
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)  # when it was replaced
    user: Mapped["User"] = relationship()


class Fact(Base):
    __tablename__ = "facts"
    id: Mapped[int] = mapped_column(primary_key=True)
    brand_id: Mapped[int] = brand_column()
    code: Mapped[str] = mapped_column(String(20), index=True)  # F-001  (unique within a brand)
    statement: Mapped[str] = mapped_column(Text)
    keywords: Mapped[str] = mapped_column(String(300), default="")  # comma separated
    value: Mapped[str] = mapped_column(String(60), default="")  # the approved number, e.g. "8,200"
    source: Mapped[str] = mapped_column(String(300), default="")
    valid_until: Mapped[date | None] = mapped_column(Date, nullable=True)


class Term(Base):
    __tablename__ = "terms"
    id: Mapped[int] = mapped_column(primary_key=True)
    brand_id: Mapped[int] = brand_column()
    banned: Mapped[str] = mapped_column(String(120))
    preferred: Mapped[str] = mapped_column(String(120))
    note: Mapped[str] = mapped_column(String(300), default="")


class Draft(Base):
    __tablename__ = "drafts"
    id: Mapped[int] = mapped_column(primary_key=True)
    brand_id: Mapped[int] = brand_column()
    title: Mapped[str] = mapped_column(String(200))
    channel: Mapped[str] = mapped_column(String(60), default="")
    audience: Mapped[str] = mapped_column(String(200), default="")
    purpose: Mapped[str] = mapped_column(Text, default="")
    body: Mapped[str] = mapped_column(Text)
    # draft | in_review | changes_requested | authorised_review | approved
    status: Mapped[str] = mapped_column(String(24), default="draft")
    version: Mapped[int] = mapped_column(Integer, default=1)
    checked_version: Mapped[int] = mapped_column(Integer, default=0)
    creator_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)  # when it needs to be approved by
    # Deleted drafts are hidden, not erased, so the append-only history stays whole.
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    creator: Mapped[User] = relationship()


class DraftVersion(Base):
    __tablename__ = "draft_versions"
    id: Mapped[int] = mapped_column(primary_key=True)
    draft_id: Mapped[int] = mapped_column(ForeignKey("drafts.id"), index=True)
    number: Mapped[int] = mapped_column(Integer)
    body: Mapped[str] = mapped_column(Text)
    note: Mapped[str] = mapped_column(String(300), default="")
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    user: Mapped[User] = relationship()


class ReviewRun(Base):
    """One automated check of one version. Doubles as the AI disclosure record."""
    __tablename__ = "review_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    draft_id: Mapped[int] = mapped_column(ForeignKey("drafts.id"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    ai_used: Mapped[bool] = mapped_column(Boolean, default=False)
    ai_provider: Mapped[str] = mapped_column(String(60), default="")
    ai_model: Mapped[str] = mapped_column(String(80), default="")
    ai_note: Mapped[str] = mapped_column(Text, default="")  # what was sent, or why AI was skipped
    exact_count: Mapped[int] = mapped_column(Integer, default=0)
    ai_count: Mapped[int] = mapped_column(Integer, default=0)
    dropped_count: Mapped[int] = mapped_column(Integer, default=0)  # AI findings that failed verification
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Finding(Base):
    __tablename__ = "findings"
    id: Mapped[int] = mapped_column(primary_key=True)
    draft_id: Mapped[int] = mapped_column(ForeignKey("drafts.id"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(String(10))  # exact | ai
    category: Mapped[str] = mapped_column(String(40))
    severity: Mapped[str] = mapped_column(String(10))
    quote: Mapped[str] = mapped_column(Text)
    ref_code: Mapped[str] = mapped_column(String(20))  # rule code, fact code, or TERM
    ref_text: Mapped[str] = mapped_column(Text, default="")  # the rule/fact wording at the time
    reason: Mapped[str] = mapped_column(Text)
    suggestion: Mapped[str] = mapped_column(Text, default="")
    # open | accepted | edited | disputed | dismissed | waived
    status: Mapped[str] = mapped_column(String(12), default="open")
    note: Mapped[str] = mapped_column(Text, default="")  # dispute reason / decision reason / waiver reason
    decided_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    image_id: Mapped[int | None] = mapped_column(ForeignKey("draft_images.id"), nullable=True)  # found in this image
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class DraftImage(Base):
    """An image attached to a draft. Stored shrunk (at most 1280 px a side); `analysis` caches what the
    image review measured, keyed by `analysed_key`, so re-running a check does not call the AI again."""
    __tablename__ = "draft_images"
    id: Mapped[int] = mapped_column(primary_key=True)
    draft_id: Mapped[int] = mapped_column(ForeignKey("drafts.id"), index=True)
    filename: Mapped[str] = mapped_column(String(200), default="")
    mime: Mapped[str] = mapped_column(String(40))
    data: Mapped[bytes] = mapped_column(LargeBinary, deferred=True)
    width: Mapped[int] = mapped_column(Integer, default=0)
    height: Mapped[int] = mapped_column(Integer, default=0)
    alt_text: Mapped[str] = mapped_column(Text, default="")
    analysis: Mapped[str] = mapped_column(Text, default="")
    analysed_key: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Comment(Base):
    __tablename__ = "comments"
    id: Mapped[int] = mapped_column(primary_key=True)
    draft_id: Mapped[int] = mapped_column(ForeignKey("drafts.id"), index=True)
    finding_id: Mapped[int | None] = mapped_column(ForeignKey("findings.id"), nullable=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    user: Mapped[User] = relationship()


class AuditLog(Base):
    """Append-only: the API exposes no update or delete for this table."""
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    brand_id: Mapped[int] = brand_column()
    draft_id: Mapped[int | None] = mapped_column(ForeignKey("drafts.id"), nullable=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(60))
    detail: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    user: Mapped[User] = relationship()
