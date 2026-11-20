"""Each brand is a private workspace: sign-up makes a new brand, and brands never see each other."""
import uuid


def sign_up(client, brand="Acme Tea"):
    email = f"owner-{uuid.uuid4().hex[:8]}@acme.test"
    r = client.post("/api/auth/signup", json={"brand": brand, "name": "Priya", "email": email, "password": "long-enough-1"})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["token"]}, r.json()["user"], email


def test_sign_up_creates_a_brand_with_its_own_library(client):
    owner, user, _ = sign_up(client)
    assert user["role"] == "reviewer" and user["brand"] == "Acme Tea" and user["demo_brand"] is False
    lib = client.get("/api/library", headers=owner).json()
    assert [r["code"] for r in lib["rules"]][:2] == ["R-001", "R-002"]  # starter copy, own codes
    assert client.get("/api/drafts", headers=owner).json() == []


def test_brands_cannot_see_or_change_each_other(client, creator, reviewer):
    owner, _, _ = sign_up(client, "Other Brand")
    # The demo brand's draft is invisible to the new brand.
    demo = client.post("/api/drafts", headers=creator, json={"title": "Demo only", "body": "Lumio Pay is great."}).json()
    assert client.get(f"/api/drafts/{demo['id']}", headers=owner).status_code == 404
    assert all(d["id"] != demo["id"] for d in client.get("/api/drafts", headers=owner).json())
    # Editing or deleting another brand's rule fails as if it did not exist.
    demo_rule = client.get("/api/library", headers=reviewer).json()["rules"][0]
    assert client.delete(f"/api/rules/{demo_rule['id']}", headers=owner).status_code == 404
    assert any(r["id"] == demo_rule["id"] for r in client.get("/api/library", headers=reviewer).json()["rules"])
    # A rule added in the new brand does not appear in the demo brand.
    client.post("/api/rules", headers=owner, json={"category": "tone", "title": "Say hi", "text": "Always greet the reader.", "severity": "low"})
    assert not any(r["title"] == "Say hi" for r in client.get("/api/library", headers=reviewer).json()["rules"])
    # Brand health only counts the brand's own drafts.
    assert client.get("/api/insights", headers=owner).json()["drafts"] == 0


def test_owner_adds_teammates_who_join_only_that_brand(client):
    owner, _, owner_email = sign_up(client, "Team Brand")
    email = f"writer-{uuid.uuid4().hex[:8]}@acme.test"
    r = client.post("/api/team", headers=owner, json={"name": "Ravi", "email": email, "role": "creator", "password": "long-enough-2"})
    assert r.status_code == 200 and {m["name"] for m in r.json()} == {"Priya", "Ravi"}
    login = client.post("/api/auth/login", json={"email": email, "password": "long-enough-2"}).json()
    writer = {"Authorization": "Bearer " + login["token"]}
    assert login["user"]["brand"] == "Team Brand"
    # A creator cannot add people, the email must be unused, and the last owner cannot demote themself.
    assert client.post("/api/team", headers=writer, json={"name": "X", "email": "x@acme.test", "role": "reviewer", "password": "long-enough-3"}).status_code == 403
    assert client.post("/api/team", headers=owner, json={"name": "Dup", "email": email, "role": "creator", "password": "long-enough-4"}).status_code == 409
    me = next(m for m in r.json() if m["you"])
    assert client.put(f"/api/team/{me['id']}", headers=owner, json={"role": "creator"}).status_code == 409
    # The writer's draft is checked against Team Brand's library and is visible to its owner only.
    d = client.post("/api/drafts", headers=writer, json={"title": "Hello", "body": "Click here to read more."}).json()
    d = client.post(f"/api/drafts/{d['id']}/check", headers=writer).json()
    assert any(f["ref_code"] == "R-005" for f in d["findings"])
    assert client.get(f"/api/drafts/{d['id']}", headers=owner).status_code == 200


def test_sign_up_rejects_taken_email_and_weak_password(client):
    r = client.post("/api/auth/signup", json={"brand": "X Co", "name": "Sam", "email": "creator@brandguard.test", "password": "long-enough-1"})
    assert r.status_code == 409
    r = client.post("/api/auth/signup", json={"brand": "X Co", "name": "Sam", "email": "sam@x.test", "password": "short"})
    assert r.status_code == 422


def test_demo_team_cannot_be_changed(client, reviewer):
    r = client.post("/api/team", headers=reviewer, json={"name": "Zara", "email": "z@x.test", "role": "creator", "password": "long-enough-1"})
    assert r.status_code == 403
    rohan = next(m for m in client.get("/api/team", headers=reviewer).json() if m["role"] == "manager")
    assert client.put(f"/api/team/{rohan['id']}", headers=reviewer, json={"role": "creator"}).status_code == 403


def test_account_basics_password_remove_teammate_delete_draft(client, creator, reviewer):
    owner, _, owner_email = sign_up(client, "Basics Brand")
    # Change password: the old one stops working, the new one works.
    assert client.put("/api/me/password", headers=owner, json={"current": "wrong-one", "new": "brand-new-pass"}).status_code == 400
    assert client.put("/api/me/password", headers=owner, json={"current": "long-enough-1", "new": "brand-new-pass"}).status_code == 200
    assert client.post("/api/auth/login", json={"email": owner_email, "password": "long-enough-1"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": owner_email, "password": "brand-new-pass"}).status_code == 200
    # Demo accounts keep their shared password.
    assert client.put("/api/me/password", headers=creator, json={"current": "brandguard-demo", "new": "something-else"}).status_code == 403

    # Remove a teammate: they can no longer sign in or use an old session; adding them again restores them.
    email = f"temp-{uuid.uuid4().hex[:8]}@acme.test"
    team = client.post("/api/team", headers=owner, json={"name": "Temp", "email": email, "role": "creator", "password": "temp-pass-1"}).json()
    temp_id = next(m["id"] for m in team if m["name"] == "Temp")
    temp = {"Authorization": "Bearer " + client.post("/api/auth/login", json={"email": email, "password": "temp-pass-1"}).json()["token"]}
    d = client.post("/api/drafts", headers=temp, json={"title": "By temp", "body": "Hello there."}).json()
    team = client.delete(f"/api/team/{temp_id}", headers=owner).json()
    assert all(m["id"] != temp_id for m in team)
    assert client.post("/api/auth/login", json={"email": email, "password": "temp-pass-1"}).status_code == 403
    assert client.get("/api/drafts", headers=temp).status_code == 401
    assert client.get(f"/api/drafts/{d['id']}", headers=owner).json()["creator"] == "Temp"  # their work stays
    me = next(m for m in client.get("/api/team", headers=owner).json() if m["you"])
    assert client.delete(f"/api/team/{me['id']}", headers=owner).status_code == 409
    back = client.post("/api/team", headers=owner, json={"name": "Temp", "email": email, "role": "manager", "password": "temp-pass-2"})
    assert back.status_code == 200 and client.post("/api/auth/login", json={"email": email, "password": "temp-pass-2"}).status_code == 200

    # Delete a draft: only unsent drafts, only by their creator; it disappears from lists and reports.
    writer_email = f"writer-{uuid.uuid4().hex[:8]}@acme.test"
    client.post("/api/team", headers=owner, json={"name": "Wen", "email": writer_email, "role": "creator", "password": "writer-pass-1"})
    writer = {"Authorization": "Bearer " + client.post("/api/auth/login", json={"email": writer_email, "password": "writer-pass-1"}).json()["token"]}
    mine = client.post("/api/drafts", headers=writer, json={"title": "Throwaway", "body": "Just testing."}).json()
    assert mine["can"]["delete"] is True
    assert client.delete(f"/api/drafts/{mine['id']}", headers=owner).status_code == 403
    assert client.delete(f"/api/drafts/{mine['id']}", headers=writer).status_code == 200
    assert client.get(f"/api/drafts/{mine['id']}", headers=writer).status_code == 404
    assert all(x["id"] != mine["id"] for x in client.get("/api/drafts", headers=writer).json())
    sent = client.post("/api/drafts", headers=writer, json={"title": "Sent one", "body": "Book a demo today."}).json()
    client.post(f"/api/drafts/{sent['id']}/check", headers=writer)
    client.post(f"/api/drafts/{sent['id']}/submit", headers=writer)
    assert client.delete(f"/api/drafts/{sent['id']}", headers=writer).status_code == 409

    # The shared demo brand keeps its drafts for the next visitor.
    demo = client.post("/api/drafts", headers=creator, json={"title": "Demo draft", "body": "Hello."}).json()
    assert demo["can"]["delete"] is False
    assert client.delete(f"/api/drafts/{demo['id']}", headers=creator).status_code == 403


def test_waiting_count_and_onboarding(client, creator, manager):
    before = client.get("/api/waiting", headers=manager).json()["count"]
    d = client.post("/api/drafts", headers=creator, json={"title": "For Rohan", "body": "Book a demo today."}).json()
    client.post(f"/api/drafts/{d['id']}/check", headers=creator)
    client.post(f"/api/drafts/{d['id']}/submit", headers=creator)
    assert client.get("/api/waiting", headers=manager).json()["count"] == before + 1

    owner, _, _ = sign_up(client, "Fresh Brand")
    o = client.get("/api/onboarding", headers=owner).json()
    assert o == {"show": True, "library_changed": False, "has_draft": False, "has_team": False}
    client.post("/api/terms", headers=owner, json={"banned": "kinda", "preferred": "somewhat"})
    client.post("/api/drafts", headers=owner, json={"title": "First", "body": "Hello."})
    o = client.get("/api/onboarding", headers=owner).json()
    assert o["library_changed"] and o["has_draft"] and not o["has_team"]
    assert client.get("/api/onboarding", headers=manager).json()["show"] is False  # not on the demo brand


def test_owner_can_write_but_never_approve_their_own_draft(client):
    owner, _, _ = sign_up(client, "Solo Brand")
    d = client.post("/api/drafts", headers=owner, json={"title": "Mine", "body": "Book a demo today."})
    assert d.status_code == 200
    did = d.json()["id"]
    client.post(f"/api/drafts/{did}/check", headers=owner)
    d = client.post(f"/api/drafts/{did}/submit", headers=owner).json()
    assert d["status"] == "in_review" and d["can"]["approve"] is False
    assert client.post(f"/api/drafts/{did}/approve", headers=owner).status_code == 403
    # A teammate can approve it.
    email = f"mgr-{uuid.uuid4().hex[:8]}@acme.test"
    client.post("/api/team", headers=owner, json={"name": "Mo", "email": email, "role": "manager", "password": "manager-pass"})
    mgr = {"Authorization": "Bearer " + client.post("/api/auth/login", json={"email": email, "password": "manager-pass"}).json()["token"]}
    assert client.post(f"/api/drafts/{did}/approve", headers=mgr).json()["status"] == "approved"


def test_my_activity_counts_only_my_own_actions(client, creator, manager):
    mine = client.get("/api/me/activity", headers=creator).json()
    theirs = client.get("/api/me/activity", headers=manager).json()
    assert mine["totals"]["written"] >= 1 and theirs["totals"]["written"] == 0
    assert all(set(r) >= {"action", "draft", "at"} for r in mine["recent"])


def test_compare_shows_each_demo_brand_flagging_differently(client):
    out = client.post("/api/demo/compare", json={"text": "BUY NOW! It is the best and healthy."}).json()
    by = {b["key"]: {f["ref_code"] for f in b["findings"]} for b in out}
    assert "R-002" in by["lumio"] and "R-003" in by["fizzbox"]  # "the best" for Lumio, "healthy" for Fizzbox
    assert client.post("/api/demo/compare", json={"text": "x" * 1001}).status_code == 422


def test_team_stats_show_what_waits_for_whom(client, creator, manager, reviewer):
    from test_workflow import make
    d = make(client, creator, "A calm post about payroll.")
    client.post(f"/api/drafts/{d['id']}/check", headers=creator)
    client.post(f"/api/drafts/{d['id']}/submit", headers=creator)
    team = client.get("/api/team", headers=creator).json()
    stats = client.get("/api/team/stats", headers=creator).json()
    mgr = next(m for m in team if m["role"] == "manager")
    me = next(m for m in team if m["you"])
    assert stats[str(mgr["id"])]["waiting"] >= 1 and stats[str(me["id"])]["written"] >= 1
    assert stats[str(me["id"])]["last_active"]


def test_lumio_flags_buy_now_but_not_payroll_acronyms(client, creator):
    def codes(text):
        r = client.post("/api/check-text", headers=creator, json={"body": text, "channel": "LinkedIn"})
        return [f["ref_code"] for f in r.json()]
    assert "R-006" in codes("Payroll in minutes. BUY NOW.")
    assert "R-006" not in codes("Pay salaries by UPI ID and file GST TDS returns on time.")


def test_baked_presets_match_the_api(client):
    """The sign-in page shows built-in verdicts for its presets; they must equal what the API says now.
    If this fails, run: cd backend && python -m app.make_presets"""
    import json
    from pathlib import Path
    baked = json.loads((Path(__file__).resolve().parents[2] / "frontend" / "src" / "presets.json").read_text(encoding="utf-8"))
    for p in baked:
        assert client.post("/api/demo/compare", json={"text": p["text"]}).json() == p["result"], p["label"]
