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
