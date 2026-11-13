"""Small helpers shared by the routers."""
from sqlalchemy.orm import Session

from ..models import AuditLog, User


def log(db: Session, user: User, action: str, detail: str = "", draft_id: int | None = None) -> None:
    """Append one line to the audit log. Nothing in the API edits or deletes these."""
    db.add(AuditLog(draft_id=draft_id, user_id=user.id, action=action, detail=detail))


def iso(dt):
    return dt.isoformat() if dt else None
