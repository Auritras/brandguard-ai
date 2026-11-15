"""Every demo visitor gets a private copy of the demo brand."""
from datetime import timedelta


def start(client, role="creator"):
    r = client.post("/api/demo/start", json={"role": role})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["token"]}, r.json()["user"]


def test_demo_copy_is_complete_and_private(client, creator, manager):
    # Something in the template: a draft with findings, history and a comment.
    d = client.post("/api/drafts", headers=creator, json={"title": "Template post", "body": "Lumio Pay is the #1 app. Click here."}).json()
    d = client.post(f"/api/drafts/{d['id']}/check", headers=creator).json()
    client.post(f"/api/drafts/{d['id']}/comments", headers=manager, json={"text": "Looks busy."})
    template_count = len(client.get("/api/drafts", headers=manager).json())

    me, user = start(client, "creator")
    assert user["sandbox"] is True and user["demo_brand"] is True and user["brand"] == "Lumio Payroll"
    mine = client.get("/api/drafts", headers=me).json()
    copy = next(x for x in mine if x["title"] == "Template post")
    assert copy["id"] != d["id"] and copy["open"] == d["open"]
    full = client.get(f"/api/drafts/{copy['id']}", headers=me).json()
    assert len(full["findings"]) == len(d["findings"]) and full["history"] and full["comments"][0]["text"] == "Looks busy."
    assert len(client.get("/api/library", headers=me).json()["rules"]) == len(client.get("/api/library", headers=creator).json()["rules"])

    # Working in the copy changes nothing in the template.
    f = next(x for x in full["findings"] if x["suggestion"] or True)
    client.post(f"/api/findings/{f['id']}/dispute", headers=me, json={"reason": "Fine for this test."})
    assert client.get(f"/api/drafts/{d['id']}", headers=creator).json()["findings"] == d["findings"]
    assert len(client.get("/api/drafts", headers=manager).json()) == template_count
    # ... and another visitor's copy cannot see it.
    other, _ = start(client, "creator")
    assert client.get(f"/api/drafts/{copy['id']}", headers=other).status_code == 404


def test_switch_person_inside_a_copy(client):
    me, _ = start(client, "creator")
    r = client.post("/api/demo/switch", headers=me, json={"role": "reviewer"})
    assert r.status_code == 200 and r.json()["user"]["role"] == "reviewer" and r.json()["user"]["sandbox"]
    meera = {"Authorization": "Bearer " + r.json()["token"]}
    # Same copy: the drafts are the same ones.
    assert {x["id"] for x in client.get("/api/drafts", headers=meera).json()} >= {x["id"] for x in client.get("/api/drafts", headers=me).json()}


def test_copies_have_fixed_accounts_but_free_drafts(client, creator):
    me, _ = start(client, "creator")
    assert client.put("/api/me/password", headers=me, json={"current": "x", "new": "something-long"}).status_code == 403
    d = client.post("/api/drafts", headers=me, json={"title": "Mine to bin", "body": "Hello."}).json()
    assert d["can"]["delete"] is True
    assert client.delete(f"/api/drafts/{d['id']}", headers=me).status_code == 200
    # Switching only works from a copy.
    assert client.post("/api/demo/switch", headers=creator, json={"role": "manager"}).status_code == 403


def test_old_copies_are_cleared(client):
    from app.db import SessionLocal
    from app.models import Brand
    from app.sandbox import clear_old_sandboxes

    me, user = start(client, "creator")
    with SessionLocal() as db:
        assert clear_old_sandboxes(db, timedelta(hours=1)) == 0  # copies younger than that survive
        db.commit()
    assert client.get("/api/drafts", headers=me).status_code == 200
    with SessionLocal() as db:
        cleared = clear_old_sandboxes(db, timedelta(0))
        db.commit()
        assert cleared >= 1 and db.query(Brand).filter(Brand.sandbox.is_(True)).count() == 0
    assert client.get("/api/drafts", headers=me).status_code == 401


def test_demo_template_is_read_only_outside_the_reset(client, creator, monkeypatch):
    from app import config

    d = client.post("/api/drafts", headers=creator, json={"title": "Before lock", "body": "Hello."}).json()
    monkeypatch.setattr(config, "TEMPLATE_WRITES", False)
    assert client.get(f"/api/drafts/{d['id']}", headers=creator).status_code == 200  # reading still works
    r = client.post(f"/api/drafts/{d['id']}/check", headers=creator)
    assert r.status_code == 403 and "Try the demo" in r.json()["detail"]
    assert client.post("/api/drafts", headers=creator, json={"title": "Blocked", "body": "Hi."}).status_code == 403
    # Copies are unaffected.
    me, _ = start(client, "creator")
    assert client.post("/api/drafts", headers=me, json={"title": "Fine", "body": "Hi."}).status_code == 200


def test_same_text_is_judged_by_each_brands_own_rules(client):
    lumio, _ = start(client, "creator")
    fizz_r = client.post("/api/demo/start", json={"role": "creator", "brand": "fizzbox"})
    assert fizz_r.status_code == 200 and fizz_r.json()["user"]["brand"] == "Fizzbox"
    fizz = {"Authorization": "Bearer " + fizz_r.json()["token"]}

    hype = "Big news!! Grab yours NOW. Our healthy new drink is here for our customers."
    at_lumio = {f["ref_code"] for f in client.post("/api/check-text", headers=lumio, json={"body": hype}).json()}
    at_fizz = {f["ref_code"] for f in client.post("/api/check-text", headers=fizz, json={"body": hype}).json()}
    assert "R-007" in at_lumio          # Lumio: one exclamation mark at most
    assert "R-003" in at_fizz           # Fizzbox: "healthy" is a health claim
    assert "TERM" in at_fizz            # Fizzbox says fans, not customers
    assert "R-003" not in at_lumio      # Lumio has no health rule ("healthy" is fine there)
    # Fizzbox welcomes short calls to action in capitals, but not long shouting.
    shout = {f["ref_code"] for f in client.post("/api/check-text", headers=fizz, json={"body": "BUY NOW!"}).json()}
    assert shout == set()
    long_shout = {f["ref_code"] for f in client.post("/api/check-text", headers=fizz, json={"body": "THIS IS THE BEST SUMMER EVER"}).json()}
    assert "R-006" in long_shout


def test_demo_brands_are_listed_and_unknown_ones_refused(client):
    brands = client.get("/api/health").json()["demo"]["brands"]
    assert [b["name"] for b in brands] == ["Lumio Payroll", "Fizzbox"]
    assert [a["name"] for a in brands[1]["accounts"]] == ["Kabir (Creator)", "Tara (Manager)", "Neel (Brand owner)"]
    assert client.post("/api/demo/start", json={"role": "creator", "brand": "nope"}).status_code == 422
