"""Reset the demo: delete every draft, restore the Brand Library, and build a fresh set of drafts,
one at each stage of review, so whoever opens the site next finds a complete demo.

Run from the backend folder, pointing DATABASE_URL at the database to reset:

    python -m app.reset_demo --env-file .env          # asks you to type "reset" first
    python -m app.reset_demo --env-file .env --no-ai   # exact checks only: faster, same every time

The drafts are made by going through the real API as Asha, Rohan and Meera, so every finding,
version, comment and history line is genuine. Afterwards each draft's history is spread over the
past few days so the times read naturally. The three demo accounts are kept.
"""
import argparse
import os
import sys
from datetime import datetime, timedelta, timezone


def load_env_file(path: str) -> None:
    """Minimal KEY=VALUE reader, so no extra package is needed. Existing variables win."""
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


# Each scenario: title, channel, audience, purpose, body, (days ago it started, days ago it finished)
LINKEDIN = (
    "Big news!! Lumio Pay is now India's #1 payroll app, trusted by 10,000 companies.\n\n"
    "Our clients run payroll in 5 minutes, guaranteed. Customers rated us 4.6 out of 5, and unlike slow legacy tools, "
    "we never make you wait.\n\n"
    "Hurry, prices go up soon and you will regret missing out. Click here to book a demo."
)
INSTAGRAM = (
    "Payday in one tap! Lumio Payroll runs payroll for your staff in under 5 minutes, "
    "so Friday stays calm. See how it works in the setup guide on our website."
)
ADVERT = (
    "Lumio Payroll is the leading payroll software for small businesses in India. "
    "Switch from spreadsheets today and get payroll right, guaranteed. "
    "Pricing starts at Rs 49 per employee per month."
)
EMAIL = (
    "Hi there, this is a reminder from Lumio Payroll: your next payday is Friday.\n\n"
    "Run payroll by Thursday 6 pm and 100% of payslips are ready on time. "
    "Reply to this e-mail if you need help."
)
BLOG = (
    "Year-end is busy. Here is a short checklist to close the year calmly: check employee details, "
    "confirm tax declarations and run a test payroll before the last week of December. Read more."
)
PRICING = (
    "Simple, affordable payroll for small businesses. "
    "Pricing starts at Rs 49 per employee per month."
)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--env-file", help="read DATABASE_URL (and GROQ_API_KEY) from this file")
    ap.add_argument("--no-ai", action="store_true", help="skip the AI checks for these drafts")
    ap.add_argument("--yes", action="store_true", help="do not ask for confirmation")
    args = ap.parse_args()
    if args.env_file:
        load_env_file(args.env_file)
    if args.no_ai:
        os.environ["GROQ_API_KEY"] = ""

    # Imported only now, so the settings above are in place first.
    from fastapi.testclient import TestClient
    from sqlalchemy import text

    from . import models
    from .config import AI_API_KEY, DEMO_PASSWORD
    from .db import Base, SessionLocal, engine
    from .main import app
    from .seed import seed

    target = engine.url.render_as_string(hide_password=True)
    print(f"Database: {target}")
    print(f"AI checks: {'on' if AI_API_KEY else 'off'}")
    if not args.yes and input('This deletes every draft and restores the Brand Library. Type "reset" to go on: ').strip() != "reset":
        sys.exit("Nothing changed.")

    # 1. Empty the drafts and the library; keep the accounts.
    Base.metadata.create_all(engine)
    tables = ["comments", "findings", "review_runs", "draft_versions", "audit_log", "drafts", "rules", "facts", "terms"]
    with engine.begin() as conn:
        if engine.dialect.name == "postgresql":
            conn.execute(text(f"TRUNCATE {', '.join(tables)} RESTART IDENTITY CASCADE"))
        else:
            for t in tables:
                conn.execute(text(f"DELETE FROM {t}"))
    with SessionLocal() as db:
        seed(db)
    print("Drafts deleted, Brand Library restored.")

    # 2. Build the drafts through the real API.
    with TestClient(app) as c:
        def who(role):
            r = c.post("/api/auth/login", json={"email": f"{role}@brandguard.test", "password": DEMO_PASSWORD})
            r.raise_for_status()
            return {"Authorization": "Bearer " + r.json()["token"]}

        asha, rohan, meera = who("creator"), who("manager"), who("reviewer")

        def call(method, path, headers, **body):
            r = c.request(method, f"/api{path}", headers=headers, json=body or None)
            if r.status_code >= 400:
                raise RuntimeError(f"{method} {path} failed: {r.status_code} {r.text}")
            return r.json()

        def new(title, channel, audience, purpose, body):
            d = call("POST", "/drafts", asha, title=title, channel=channel, audience=audience, purpose=purpose, body=body)
            return call("POST", f"/drafts/{d['id']}/check", asha)

        def find(d, code, quote_has=""):
            return next((f for f in d["findings"] if f["status"] == "open" and f["ref_code"] == code and quote_has in f["quote"]), None)

        def accept(d, code, quote_has=""):
            f = find(d, code, quote_has)
            if f and f["suggestion"]:
                return call("POST", f"/findings/{f['id']}/accept", asha)
            return d

        def own_fix(d, code, word, replacement):
            f = find(d, code)
            if f and word in f["quote"]:
                return call("POST", f"/findings/{f['id']}/edit", asha, replacement=f["quote"].replace(word, replacement))
            return d

        def dispute(d, code, reason):
            f = next((f for f in d["findings"] if f["status"] == "open" and f["ref_code"] == code), None)
            return call("POST", f"/findings/{f['id']}/dispute", asha, reason=reason) if f else d

        def recheck_and_submit(d):
            if d["needs_check"]:
                d = call("POST", f"/drafts/{d['id']}/check", asha)
            return call("POST", f"/drafts/{d['id']}/submit", asha)

        def approve_fully(d, waiver):
            d = call("POST", f"/drafts/{d['id']}/approve", rohan)
            if d["status"] == "authorised_review":
                for f in d["findings"]:
                    if f["severity"] == "high" and f["status"] in ("open", "disputed"):
                        call("POST", f"/findings/{f['id']}/waive", meera, reason=waiver)
                d = call("POST", f"/drafts/{d['id']}/approve", meera)
            return d

        timeline = {}

        # Approved by Rohan alone: nothing high-risk was left.
        d = new("Website: pricing page intro", "Website", "Small business owners comparing payroll tools",
                "Explain pricing in one line", PRICING)
        d = recheck_and_submit(d)
        d = approve_fully(d, "Pricing wording matches the approved pricing fact.")
        timeline[d["id"]] = (9, 8)

        # Approved after escalation: Rohan escalates, Meera waives the high-risk finding and approves.
        d = new("Email: payday reminder", "Email", "Existing customers",
                "Remind customers to run payroll before payday", EMAIL)
        d = accept(d, "TERM", "e-mail")
        d = recheck_and_submit(d)
        call("POST", f"/drafts/{d['id']}/comments", rohan, text="Reads well. The 100% line needs Meera's sign-off.")
        d = approve_fully(d, "Payslips are generated automatically once payroll runs; legal approved this wording for reminders.")
        timeline[d["id"]] = (6, 4)

        # Escalated and waiting for Meera: a disputed high-risk claim.
        d = new("Advertisement: switch from spreadsheets", "Advertisement", "Small businesses still on spreadsheets",
                "Get spreadsheet users to start a free trial", ADVERT)
        d = own_fix(d, "R-003", "guaranteed", "every month")
        d = dispute(d, "R-002", "We won the 2026 Small Business Payroll Award. Legal is adding it as an approved fact.")
        d = recheck_and_submit(d)
        call("POST", f"/drafts/{d['id']}/comments", rohan, text="Strong ad. The award claim needs Meera before it can run.")
        d = call("POST", f"/drafts/{d['id']}/approve", rohan)
        timeline[d["id"]] = (3, 2)

        # Sent back to Asha by Rohan.
        d = new("Blog: year-end payroll checklist", "Blog", "Small business owners",
                "Help customers close the payroll year without mistakes", BLOG)
        d = recheck_and_submit(d)
        d = call("POST", f"/drafts/{d['id']}/request-changes", rohan,
                 note="Please replace 'Read more' with a real link name, and add the January filing deadline.")
        timeline[d["id"]] = (2, 1)

        # Waiting for Rohan: Asha fixed the term and sent it.
        d = new("Instagram: payday in one tap", "Instagram", "Small business owners on Instagram",
                "Show how quick a payroll run is", INSTAGRAM)
        d = accept(d, "TERM", "staff")
        d = recheck_and_submit(d)
        timeline[d["id"]] = (1, 0.8)

        # With Asha: checked, nothing handled yet. The richest one to try.
        d = new("LinkedIn post: new onboarding", "LinkedIn", "Owners of small businesses in India",
                "Announce the faster onboarding and get sign-ups for a demo", LINKEDIN)
        timeline[d["id"]] = (0.1, 0.05)

    # 3. Spread each draft's history over its days, in the order things happened.
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        for draft_id, (start_days, end_days) in timeline.items():
            start, end = now - timedelta(days=start_days), now - timedelta(days=end_days)
            logs = db.query(models.AuditLog).filter_by(draft_id=draft_id).order_by(models.AuditLog.id).all()
            step = (end - start) / max(1, len(logs) - 1)
            times = [start + step * i for i in range(len(logs))]
            for log, t in zip(logs, times):
                log.created_at = t

            def times_for(actions):
                return [t for log, t in zip(logs, times) if log.action in actions]

            for obj, t in zip(db.query(models.DraftVersion).filter_by(draft_id=draft_id).order_by(models.DraftVersion.number),
                              times_for({"draft_created", "finding_accepted", "finding_edited", "draft_edited"})):
                obj.created_at = t
            for obj, t in zip(db.query(models.ReviewRun).filter_by(draft_id=draft_id).order_by(models.ReviewRun.id),
                              times_for({"check_run"})):
                obj.created_at = t
            for obj, t in zip(db.query(models.Comment).filter_by(draft_id=draft_id).order_by(models.Comment.id),
                              times_for({"comment_added", "changes_requested"})):
                obj.created_at = t
            draft = db.get(models.Draft, draft_id)
            draft.created_at, draft.updated_at = start, end
        db.commit()

        print("\nDemo drafts:")
        for d in db.query(models.Draft).order_by(models.Draft.updated_at.desc()):
            print(f"  {d.id}. {d.title}  ->  {d.status}")


if __name__ == "__main__":
    main()
