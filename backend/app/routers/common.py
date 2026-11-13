"""Small helpers shared by the routers."""
from datetime import timezone

from sqlalchemy.orm import Session

from ..models import AuditLog, User


def log(db: Session, user: User, action: str, detail: str = "", draft_id: int | None = None) -> None:
    """Append one line to the audit log. Nothing in the API edits or deletes these."""
    db.add(AuditLog(draft_id=draft_id, user_id=user.id, action=action, detail=detail))


def iso(dt):
    """Times are stored in UTC. SQLite drops the timezone, so put it back before sending."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()
