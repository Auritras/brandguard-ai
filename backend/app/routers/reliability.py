"""Measured reliability: the latest scores of the check on the test drafts in evals/cases, and how they changed.

The numbers come from `python -m evals.run --save`, which CI runs for the exact checks on every push.
Read-only, and the same for every signed-in person: it measures the checker, not anyone's content."""
import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
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


class LiveIn(BaseModel):
    brand: str
    ids: list[str] = Field(max_length=10)


@router.post("/reliability/live")
def live(body: LiveIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Run a few of the test drafts through the exact checks now, against the demo brand's original library,
    and score them the same way as the recorded runs. The page calls this in small batches, so the run
    can be watched. Exact checks only: running the AI on all 80 at once would exceed the free AI limit."""
    import sys
    sys.path.insert(0, str(EVALS.parent))
    from evals.run import score_case

    from ..engine.exact import run_exact
    from ..models import Fact, Rule, Term
    from ..seed import TEMPLATES, demo_brand
    if body.brand not in TEMPLATES:
        raise HTTPException(422, "Unknown demo brand.")
    data = _read(EVALS / "cases" / f"{body.brand}.json", {})
    cases = {c["id"]: c for c in data.get("cases", [])}
    b = demo_brand(db, body.brand).id
    rules = db.query(Rule).filter(Rule.brand_id == b, Rule.status == "approved").all()
    facts = db.query(Fact).filter(Fact.brand_id == b).all()
    terms = db.query(Term).filter(Term.brand_id == b).all()
    out = []
    for cid in body.ids:
        case = cases.get(cid)
        if not case:
            continue
        found = run_exact(case["body"], rules, facts, terms, channel=case.get("channel", ""))
        s = score_case(case, [{"ref_code": f["ref_code"], "quote": f["quote"], "source": "exact"} for f in found], "exact")
        out.append({"id": cid, "caught": len(s["caught"]), "wanted": len(s["wanted"]),
                    "missed": [e["ref"] + ": " + e["quote"] for e in s["missed"]],
                    "extras": [f["ref_code"] + ": " + f["quote"][:60] for f in s["extras"]]})
    return out


@router.get("/reliability/cases")
def cases_list(brand: str, user: User = Depends(current_user)):
    data = _read(EVALS / "cases" / f"{brand}.json", {})
    return [{"id": c["id"], "channel": c.get("channel", ""), "body": c["body"],
             "planted": [e for e in c["expect"] if e["by"] == "exact"], "ai_only": sum(e["by"] == "ai" for e in c["expect"])}
            for c in data.get("cases", [])]
