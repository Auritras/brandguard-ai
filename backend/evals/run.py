"""Measured reliability: run the real review on drafts with planted problems and score what it catches.

    python -m evals.run                 exact checks only (no AI, no key needed; what CI runs)
    python -m evals.run --mode ai       the full check with AI (reads GROQ_API_KEY from .env)
    python -m evals.run --save          also write evals/results/<mode>.json and add a line to history.json

The drafts and what each should be caught for are in evals/cases/<brand>.json. Every draft goes through
the same run_review() the app uses, in a throwaway database seeded with the demo brand's library.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
CASES = HERE / "cases"
RESULTS = HERE / "results"


def _matches(finding: dict, exp: dict) -> bool:
    codes = {exp["ref"], *exp.get("or", [])}
    if finding["ref_code"] not in codes:
        return False
    a, b = finding["quote"].lower(), exp["quote"].lower()
    return a in b or b in a


def score_case(case: dict, findings: list[dict], mode: str) -> dict:
    """Which planted problems were caught, which were missed, and which findings were not planted (false alarms)."""
    wanted = [e for e in case["expect"] if mode == "ai" or e["by"] == "exact"]
    caught, missed = [], []
    for e in wanted:
        (caught if any(_matches(f, e) for f in findings) else missed).append(e)
    # A finding is a false alarm if it matches nothing planted (AI-only plants still count as real in exact mode).
    extras = [f for f in findings if not any(_matches(f, e) for e in case["expect"])]
    return {"id": case["id"], "body": case["body"], "wanted": wanted, "caught": caught, "missed": missed, "extras": extras}


def summarise(brand: str, scored: list[dict]) -> dict:
    per_rule = {}
    for s in scored:
        for e in s["wanted"]:
            row = per_rule.setdefault(e["ref"], {"ref": e["ref"], "planted": 0, "caught": 0})
            row["planted"] += 1
            row["caught"] += e in s["caught"]
    planted = sum(len(s["wanted"]) for s in scored)
    caught = sum(len(s["caught"]) for s in scored)
    findings = caught + sum(len(s["extras"]) for s in scored)
    clean = [s for s in scored if s["id"] in CLEAN_IDS[brand]]
    return {
        "brand": brand,
        "drafts": len(scored),
        "planted": planted,
        "caught": caught,
        "catch_rate": round(100 * caught / planted, 1) if planted else None,
        "false_alarms": sum(len(s["extras"]) for s in scored),
        "precision": round(100 * caught / findings, 1) if findings else None,
        "clean_drafts": len(clean),
        "clean_passed": sum(1 for s in clean if not s["extras"]),
        "per_rule": sorted(per_rule.values(), key=lambda r: r["ref"]),
        "misses": [{"case": s["id"], "ref": e["ref"], "quote": e["quote"], "body": s["body"]} for s in scored for e in s["missed"]],
        "false_alarm_list": [{"case": s["id"], "ref": f["ref_code"], "quote": f["quote"][:120], "source": f["source"], "body": s["body"]}
                             for s in scored for f in s["extras"]],
    }


CLEAN_IDS: dict[str, set] = {}


def load_cases() -> dict[str, list]:
    out = {}
    for path in sorted(CASES.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        out[data["brand"]] = data["cases"]
        CLEAN_IDS[data["brand"]] = {c["id"] for c in data["cases"] if not c["expect"]}
    return out


def run(mode: str = "exact", pause: float = 0.0, quiet: bool = False) -> dict:
    """Score every case file. Uses its own temporary database, so the app's data is never touched."""
    os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "evals.db").replace("\\", "/")
    sys.path.insert(0, str(HERE.parent))
    from app import config  # noqa: E402

    if mode == "exact":
        config.AI_API_KEY = ""
    elif not config.AI_API_KEY:
        env = HERE.parent / ".env"
        if env.exists():
            for line in env.read_text(encoding="utf-8").splitlines():
                if line.startswith("GROQ_API_KEY="):
                    config.AI_API_KEY = line.split("=", 1)[1].strip().strip('"')
        if not config.AI_API_KEY:
            raise SystemExit("--mode ai needs GROQ_API_KEY (in the environment or backend/.env).")

    from app.db import Base, SessionLocal, engine
    from app.engine.run import run_review
    from app.models import Draft, Finding, User
    from app.seed import demo_brand, seed

    Base.metadata.create_all(engine)
    report = {"mode": mode, "date": datetime.now(timezone.utc).isoformat(timespec="seconds"),
              "commit": _commit(), "model": config.AI_MODEL if mode == "ai" else "", "brands": []}
    with SessionLocal() as db:
        seed(db)
        for brand, cases in load_cases().items():
            b = demo_brand(db, brand)
            writer = db.query(User).filter_by(brand_id=b.id, role="creator").first()
            scored = []
            for case in cases:
                d = Draft(brand_id=b.id, creator_id=writer.id, title=case["id"], channel=case.get("channel", ""),
                          audience=case.get("audience", ""), purpose=case.get("purpose", ""), body=case["body"])
                db.add(d)
                db.flush()
                run = run_review(db, d)
                found = [{"ref_code": f.ref_code, "quote": f.quote, "source": f.source}
                         for f in db.query(Finding).filter(Finding.draft_id == d.id)]
                s = score_case(case, found, mode)
                if mode == "ai" and not run.ai_used:
                    s["ai_skipped"] = run.ai_note
                scored.append(s)
                if not quiet:
                    mark = "ok " if not s["missed"] and not s["extras"] else "!! "
                    print(f"{mark}{case['id']}: caught {len(s['caught'])}/{len(s['wanted'])}, false alarms {len(s['extras'])}"
                          + (f"  (AI skipped: {run.ai_note[:80]})" if s.get("ai_skipped") else ""))
                if pause:
                    time.sleep(pause)
            summary = summarise(brand, scored)
            summary["ai_skipped"] = sum(1 for s in scored if s.get("ai_skipped"))
            report["brands"].append(summary)
    return report


def _commit() -> str:
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True,
                              cwd=HERE, timeout=5).stdout.strip()
    except Exception:
        return ""


def save(report: dict) -> None:
    RESULTS.mkdir(exist_ok=True)
    (RESULTS / f"{report['mode']}.json").write_text(json.dumps(report, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    hist_path = RESULTS / "history.json"
    history = json.loads(hist_path.read_text(encoding="utf-8")) if hist_path.exists() else []
    for b in report["brands"]:
        history.append({"date": report["date"], "commit": report["commit"], "mode": report["mode"], "brand": b["brand"],
                        "catch_rate": b["catch_rate"], "precision": b["precision"], "false_alarms": b["false_alarms"],
                        "planted": b["planted"], "caught": b["caught"]})
    hist_path.write_text(json.dumps(history[-200:], indent=1) + "\n", encoding="utf-8")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--mode", choices=("exact", "ai"), default="exact")
    p.add_argument("--save", action="store_true")
    p.add_argument("--pause", type=float, default=None, help="seconds between drafts (default 4 in ai mode, to respect the free AI limit)")
    p.add_argument("--min-catch", type=float, default=None, help="exit with an error if any brand's catch rate is below this")
    a = p.parse_args()
    report = run(a.mode, a.pause if a.pause is not None else (4.0 if a.mode == "ai" else 0.0))
    print()
    for b in report["brands"]:
        print(f"{b['brand']:8} caught {b['caught']}/{b['planted']} ({b['catch_rate']}%), precision {b['precision']}%, "
              f"false alarms {b['false_alarms']}, clean drafts passed {b['clean_passed']}/{b['clean_drafts']}")
        for m in b["misses"]:
            print(f"   missed  {m['case']} {m['ref']}: {m['quote']}")
        for f in b["false_alarm_list"]:
            print(f"   extra   {f['case']} {f['ref']} ({f['source']}): {f['quote']}")
    if a.save:
        save(report)
    if a.min_catch is not None and any((b["catch_rate"] or 0) < a.min_catch for b in report["brands"]):
        raise SystemExit(f"Catch rate below {a.min_catch}%.")


if __name__ == "__main__":
    main()
