"""Reset the demo brand (Lumio Payroll): delete its drafts, restore its Brand Library, and build a
fresh set of drafts, one at each stage of review, so whoever opens the site next finds a complete
demo. Brands that people created themselves are not touched.

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
import time
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

HANDOUT = (
    "Welcome to Lumio Payroll. This handout walks your team through the first payroll run: add employees, "
    "set salary components, then run payroll and share payslips. Our clients usually finish setup in an afternoon."
)
WELCOME = (
    "Welcome to Lumio Payroll. Your account is ready. Start by adding your employees, then run your first payroll "
    "when you are ready. Our help centre has a short guide for each step."
)
HERO = "Payroll for small businesses, done in minutes. Trusted by 10,000 companies across India."
HOW_TO = (
    "Running payroll in India means handling PF, ESI and professional tax every month. Lumio Payroll works these "
    "out for you from each employee's salary details. Click here for the full guide."
)
HIRING = (
    "We are hiring. Lumio Payroll is looking for a payroll specialist to help small businesses pay their people "
    "right. Join the best team in payroll and help 8,200 companies every month."
)
FESTIVE_AD = (
    "This festive season, switch to Lumio Payroll risk-free. Customers rated us 4.6 out of 5. "
    "Pricing starts at Rs 49 per employee per month."
)
FESTIVE_POST = (
    "Festive bonus season is here!! HURRY UP AND RUN PAYROLL NOW so your staff get their bonus on time. "
    "Cheap, simple and quick."
)


# Fizzbox: the loud, playful drinks brand. Calls to action in capitals are fine here; health claims
# and anything aimed at children are not.
FIZZ_LAUNCH = (
    "Big news, fizz fam!! Our healthy new mango fizz is HERE and it's the tastiest drink in India. Grab yours NOW.\n\n"
    "Only 30 calories a can, so it's basically guilt-free. It boosts immunity too, and it's perfect for kids after school. "
    "Sugar-free fans, we have you covered.\n\n"
    "Way better than SodaCo, and loved by consumers everywhere. Please be advised that stock is limited. "
    "Click here to find a store."
)
FIZZ_BILLBOARD = "Zero sugar. Full fizz. 0 g sugar in every can of Fizzbox Zero. BUY NOW!"
FIZZ_WELCOME = (
    "Hey, welcome to the Fizzbox crew! Your first can is on us at any of our 1,200 stores. "
    "Grab it TODAY and tell us your favourite flavour."
)
FIZZ_ABOUT = (
    "Fizzbox is a refreshing beverage that boosts immunity and helps you detox. "
    "Loved by consumers across India."
)
FIZZ_HIRING = (
    "We are hiring! Join the Fizzbox crew as a campus ambassador. Love drinks? Love people? "
    "APPLY TODAY on our careers page."
)
FIZZ_SELL_SHEET = (
    "Fizzbox Classic: 45 calories per 330 ml can. Fizzbox Zero: 0 g sugar per can. "
    "Already in 1,200 stores across India. Order through your usual distributor."
)
FIZZ_DIWALI = (
    "Light up Diwali with Fizzbox! Stock up NOW for the party. "
    "Our mango fizz is so good it's basically guilt-free."
)
FIZZ_CRICKET = (
    "Cricket season means Fizzbox season!! Way better than SodaCo and every other fizzy drink out there. "
    "GRAB A COLD ONE NOW AT YOUR NEAREST STORE."
)
FIZZ_CANTEEN = (
    "Special offer for school canteens: give the kids a cold Fizzbox with lunch! "
    "Order 10 crates and get one free."
)
FIZZ_FAQ = (
    "Is Fizzbox Zero really zero sugar? Yes: 0 g sugar per can. "
    "How many calories are in Fizzbox Classic? 45 in every 330 ml can."
)
FIZZ_BLOG = (
    "Please be advised that we hereby utilise natural fruit flavours in all of our drinks. "
    "Read more."
)


PF_BLOG = ("PF is due by the 15th of every month. Miss it and interest starts from day one. "
           "Lumio Payroll works out the amount for each employee and reminds you a week before. "
           "Read more about PF deadlines in our guide.")

TAX_EMAIL = ("The new tax slabs apply from April. Lumio Payroll updates every payslip for you, so there is nothing to change "
             "on your side. Read more about the new slabs on our help page.")

FIZZ_GYM = ("Leg day done? Grab a Fizzbox Zero! 0 g sugar per can, all the fizz, and totally guilt-free. "
            "Find it in the gym fridge or your nearest store.")


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
    os.environ["BRANDGUARD_TEMPLATE_WRITES"] = "1"  # only this script may change the demo template

    # Imported only now, so the settings above are in place first.
    from fastapi.testclient import TestClient
    from . import models
    from .config import AI_API_KEY, DEMO_PASSWORD
    from .db import Base, SessionLocal, engine
    from .main import app
    from .migrate import migrate
    from .sandbox import clear_old_sandboxes, delete_brand_data
    from .samples import sample_png
    from .seed import TEMPLATES, demo_brand, seed, seed_library

    target = engine.url.render_as_string(hide_password=True)
    print(f"Database: {target}")
    print(f"AI checks: {'on' if AI_API_KEY else 'off'}")
    if not args.yes and input('This deletes every draft in the demo brands (Lumio Payroll and Fizzbox), restores their '
                              "Brand Libraries and clears visitors' demo copies. Brands people created are not touched. "
                              'Type "reset" to go on: ').strip() != "reset":
        sys.exit("Nothing changed.")

    # 1. Empty each demo brand's drafts and library; keep their accounts and every other brand.
    Base.metadata.create_all(engine)
    migrate(engine)
    with SessionLocal() as db:
        seed(db)
        template_ids = {key: demo_brand(db, key).id for key in TEMPLATES}
        for key, brand_id in template_ids.items():
            delete_brand_data(db, brand_id, keep_users=True)
            seed_library(db, brand_id, key)
        cleared = clear_old_sandboxes(db, timedelta(0))  # copies of the old demo are out of date
        db.commit()
    print(f"Visitors' demo copies cleared: {cleared}.")
    print("Demo drafts deleted, demo Brand Library restored.")

    # 2. Build the drafts through the real API.
    with TestClient(app) as c:
        def who(role, key="lumio"):
            email = next(e for _n, e, r in TEMPLATES[key][1] if r == role)
            r = c.post("/api/auth/login", json={"email": email, "password": DEMO_PASSWORD})
            r.raise_for_status()
            return {"Authorization": "Bearer " + r.json()["token"]}

        asha, rohan, meera = who("creator"), who("manager"), who("reviewer")

        def call(method, path, headers, **body):
            r = c.request(method, f"/api{path}", headers=headers, json=body or None)
            if r.status_code >= 400:
                raise RuntimeError(f"{method} {path} failed: {r.status_code} {r.text}")
            if AI_API_KEY and path.endswith("/check"):
                time.sleep(5)  # stay inside the AI provider's free per-minute limit
            return r.json()

        def new(title, channel, audience, purpose, body, image=None):
            d = call("POST", "/drafts", asha, title=title, channel=channel, audience=audience, purpose=purpose, body=body)
            if image:  # the brand's sample post image, with its planted problems, reviewed in the same check
                name, data = image
                r = c.post(f"/api/drafts/{d['id']}/images", headers=asha, files={"file": (name, data, "image/png")})
                if r.status_code >= 400:
                    raise RuntimeError(f"image upload failed: {r.status_code} {r.text}")
            return call("POST", f"/drafts/{d['id']}/check", asha)

        def dismiss(d, code, reason, by):
            f = next((f for f in d["findings"] if f["status"] == "disputed" and f["ref_code"] == code), None)
            return call("POST", f"/findings/{f['id']}/decide", by, decision="dismiss", reason=reason) if f else d

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

        # More of the demo brand's channels, at a mix of stages.
        d = new("Document: customer onboarding handout", "Document", "New customers' finance teams",
                "Walk a new customer through their first payroll run", HANDOUT)
        d = accept(d, "TERM", "clients")
        d = recheck_and_submit(d)
        d = approve_fully(d, "Setup time comes from our onboarding team's own tracking; fine for a handout.")
        timeline[d["id"]] = (12, 11)

        d = new("Email: welcome to Lumio Payroll", "Email", "Customers who just signed up",
                "Help new customers take their first step", WELCOME)
        d = recheck_and_submit(d)
        d = approve_fully(d, "Plain welcome copy; nothing to support.")
        timeline[d["id"]] = (11, 10.5)

        d = new("Website: homepage hero", "Website", "Visitors to the home page",
                "Say what Lumio is in one line and build trust", HERO)
        d = dispute(d, "F-001", "Sales says we crossed 10,000 companies this month. We have asked for the fact to be updated.")
        d = recheck_and_submit(d)
        call("POST", f"/drafts/{d['id']}/comments", rohan, text="Copy is good. The customer count is Meera's call until the fact changes.")
        d = call("POST", f"/drafts/{d['id']}/approve", rohan)
        timeline[d["id"]] = (2.5, 2.2)

        d = new("Blog: how payroll works in India", "Blog", "First-time employers",
                "Explain PF, ESI and professional tax simply", HOW_TO)
        d = dispute(d, "R-005", "On the blog this line is a button that names the guide, so screen readers read the guide's title.")
        d = recheck_and_submit(d)
        timeline[d["id"]] = (1.5, 1.2)

        d = new("LinkedIn: we're hiring a payroll specialist", "LinkedIn", "Payroll professionals",
                "Attract applicants for a payroll specialist role", HIRING)
        d = own_fix(d, "R-002", "the best", "a friendly")
        d = recheck_and_submit(d)
        timeline[d["id"]] = (0.6, 0.5)

        d = new("Advertisement: festive season offer", "Advertisement", "Small businesses before the festive season",
                "Get sign-ups during the festive season", FESTIVE_AD)
        timeline[d["id"]] = (0.5, 0.45)

        d = new("Instagram: festive bonus reminder", "Instagram", "Small business owners on Instagram",
                "Remind owners to pay festive bonuses on time", FESTIVE_POST)
        timeline[d["id"]] = (0.3, 0.25)

        # Two more blog and email pieces where "Read more about ..." was disputed and the manager agreed:
        # with the open dispute above, the rule on descriptive links shows up under Guideline gaps.
        d = new("Blog: PF deadlines explained", "Blog", "Small business owners",
                "Explain the monthly PF deadline", PF_BLOG)
        d = dispute(d, "R-005", "The button says 'Read more about PF deadlines', so it names where it goes.")
        d = recheck_and_submit(d)
        d = dismiss(d, "R-005", "Agreed: the link names the guide, so screen readers are fine.", rohan)
        d = approve_fully(d, "Link text names the guide.")
        timeline[d["id"]] = (7, 6.5)

        d = new("Email: new tax slabs", "Email", "Existing customers", "Tell customers about the new tax slabs", TAX_EMAIL)
        d = dispute(d, "R-005", "'Read more about the new slabs' is the full button text, not 'Read more' on its own.")
        d = recheck_and_submit(d)
        d = dismiss(d, "R-005", "Fair. The button text says where it goes.", rohan)
        d = approve_fully(d, "Fine as written.")
        timeline[d["id"]] = (5, 4.6)

        # With Asha: checked, nothing handled yet. The richest one to try, with its banner image.
        d = new("LinkedIn post: new onboarding", "LinkedIn", "Owners of small businesses in India",
                "Announce the faster onboarding and get sign-ups for a demo", LINKEDIN,
                image=("payroll-banner.png", sample_png("lumio")))
        timeline[d["id"]] = (0.1, 0.05)

        # Fizzbox. The helpers above act as whoever these three names point at, so point them at
        # Fizzbox's people: Kabir writes, Tara manages, Neel owns the brand.
        asha, rohan, meera = who("creator", "fizzbox"), who("manager", "fizzbox"), who("reviewer", "fizzbox")

        d = new("Email: fan club welcome", "Email", "New Fizzbox fans", "Welcome new fans and send them to a store", FIZZ_WELCOME)
        d = recheck_and_submit(d)
        d = approve_fully(d, "Store count matches the approved fact.")
        timeline[d["id"]] = (5, 4.5)

        d = new("Website: about us", "Website", "Visitors to the website", "Say what Fizzbox is", FIZZ_ABOUT)
        d = accept(d, "TERM", "beverage")
        d = accept(d, "TERM", "consumers")
        d = dispute(d, "R-003", "Each can has vitamin C, which supports normal immune function. Legal is checking the wording.")
        d = recheck_and_submit(d)
        call("POST", f"/drafts/{d['id']}/comments", rohan, text="Health wording is Neel's call.")
        d = call("POST", f"/drafts/{d['id']}/approve", rohan)
        timeline[d["id"]] = (3, 2.5)

        d = new("Blog: how we make our fizz", "Blog", "Fans who like to know what is inside",
                "Explain the natural flavours", FIZZ_BLOG)
        d = recheck_and_submit(d)
        d = call("POST", f"/drafts/{d['id']}/request-changes", rohan,
                 note="Way too formal for us. Make it sound like a friend, and name the link.")
        timeline[d["id"]] = (2, 1.5)

        d = new("Advertisement: zero sugar billboard", "Advertisement", "Commuters", "Launch Fizzbox Zero", FIZZ_BILLBOARD)
        d = recheck_and_submit(d)
        timeline[d["id"]] = (1, 0.7)

        d = new("Document: retailer sell sheet", "Document", "Shop owners and distributors",
                "Get retailers to stock Fizzbox", FIZZ_SELL_SHEET)
        d = recheck_and_submit(d)
        d = approve_fully(d, "Every number matches an approved fact.")
        timeline[d["id"]] = (10, 9.5)

        d = new("Website: FAQ", "Website", "Fans with questions", "Answer the sugar and calorie questions", FIZZ_FAQ)
        d = recheck_and_submit(d)
        d = approve_fully(d, "Numbers match the label.")
        timeline[d["id"]] = (8, 7.6)

        d = new("Email: school canteen offer", "Email", "School canteen managers", "Sell crates to schools", FIZZ_CANTEEN)
        d = recheck_and_submit(d)
        d = call("POST", f"/drafts/{d['id']}/request-changes", rohan,
                 note="We never market to children. Please drop the school angle and aim this at office canteens instead.")
        timeline[d["id"]] = (4, 3.4)

        d = new("Instagram: Diwali fizz party", "Instagram", "Fans planning Diwali parties", "Sell party packs for Diwali", FIZZ_DIWALI)
        d = dispute(d, "R-003", "It's a playful figure of speech for a party treat, not a health claim.")
        d = recheck_and_submit(d)
        d = call("POST", f"/drafts/{d['id']}/approve", rohan)
        timeline[d["id"]] = (1.8, 1.4)

        d = new("Instagram: post-gym fizz", "Instagram", "Fans who work out", "Sell Fizzbox Zero after workouts", FIZZ_GYM)
        d = dispute(d, "R-003", "'Guilt-free' is about the zero sugar, which is on the label, not a health claim.")
        d = recheck_and_submit(d)
        d = call("POST", f"/drafts/{d['id']}/approve", rohan)
        d = dismiss(d, "R-003", "Zero sugar is on the label; 'guilt-free' here is about that, so it can run.", meera)
        for f in d["findings"]:
            if f["severity"] == "high" and f["status"] in ("open", "disputed"):
                call("POST", f"/findings/{f['id']}/waive", meera, reason="Zero sugar matches the approved fact.")
        d = call("POST", f"/drafts/{d['id']}/approve", meera)
        timeline[d["id"]] = (6, 5.5)

        d = new("LinkedIn: hiring campus ambassadors", "LinkedIn", "College students", "Recruit campus ambassadors", FIZZ_HIRING)
        d = recheck_and_submit(d)
        timeline[d["id"]] = (0.9, 0.6)

        d = new("Advertisement: cricket season", "Advertisement", "Cricket fans", "Push sales during the cricket season", FIZZ_CRICKET)
        timeline[d["id"]] = (0.3, 0.25)

        # With Kabir: checked, nothing handled yet. The richest one to try: hype that Lumio would flag is
        # fine here, but health claims, children, a competitor, the calorie number and stiff wording are not.
        d = new("Instagram: summer launch", "Instagram", "Teens and young adults", "Launch the mango flavour", FIZZ_LAUNCH,
                image=("mango-fizz-post.png", sample_png("fizzbox")))
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
        # A visitor who started a demo while this script was running got a half-built copy: clear it,
        # so their next click makes a complete one.
        late = clear_old_sandboxes(db, timedelta(0))
        db.commit()
        if late:
            print(f"Copies made during the reset cleared: {late}.")

        for key, brand_id in template_ids.items():
            print(f"\nDemo drafts, {TEMPLATES[key][0]}:")
            for d in db.query(models.Draft).filter(models.Draft.brand_id == brand_id).order_by(models.Draft.updated_at.desc()):
                print(f"  {d.id}. {d.title}  ->  {d.status}")


if __name__ == "__main__":
    main()
