def test_health(client):
    assert client.get("/api/health").json()["ok"] is True


def test_login_and_me(client, creator):
    assert client.get("/api/me", headers=creator).json()["role"] == "creator"


def test_wrong_password(client):
    r = client.post("/api/auth/login", json={"email": "creator@brandguard.test", "password": "nope"})
    assert r.status_code == 401


def test_needs_login(client):
    assert client.get("/api/me").status_code == 401
