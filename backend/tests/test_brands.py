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
