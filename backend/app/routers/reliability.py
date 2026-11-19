"""Measured reliability: the latest scores of the check on the test drafts in evals/cases, and how they changed.

The numbers come from `python -m evals.run --save`, which CI runs for the exact checks on every push.
Read-only, and the same for every signed-in person: it measures the checker, not anyone's content."""
import json
from pathlib import Path

from fastapi import APIRouter, Depends

from ..auth import current_user
from ..models import User

router = APIRouter(prefix="/api", tags=["reliability"])

EVALS = Path(__file__).resolve().parents[2] / "evals"


def _read(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


@router.get("/reliability")
def reliability(user: User = Depends(current_user)):
    cases = {}
    for path in sorted((EVALS / "cases").glob("*.json")):
        data = _read(path, {})
        for c in data.get("cases", []):
            cases[c["id"]] = c
    runs = {}
    for mode in ("exact", "ai"):
        report = _read(EVALS / "results" / f"{mode}.json", None)
        if report:
            for b in report["brands"]:
                for row in b.get("misses", []) + b.get("false_alarm_list", []):
                    row.setdefault("body", cases.get(row["case"], {}).get("body", ""))
        runs[mode] = report
    return {
        "runs": runs,
        "history": _read(EVALS / "results" / "history.json", []),
        "cases": len(cases),
        "clean": sum(1 for c in cases.values() if not c.get("expect")),
    }


@router.get("/reliability/summary")
def summary():
    """The headline numbers for the sign-in page (public: they describe the checker, not anyone's data)."""
    out = {}
    for mode in ("exact", "ai"):
        report = _read(EVALS / "results" / f"{mode}.json", None)
        if report:
            out[mode] = {"caught": sum(b["caught"] for b in report["brands"]), "planted": sum(b["planted"] for b in report["brands"])}
    cases = sum(len(_read(p, {}).get("cases", [])) for p in (EVALS / "cases").glob("*.json"))
    return {**out, "cases": cases}
