import os
import tempfile

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "test.db").replace("\\", "/")
os.environ["GROQ_API_KEY"] = ""

import pytest
from fastapi.testclient import TestClient

from app.config import DEMO_PASSWORD
from app.main import app


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


def login(client, role):
    r = client.post("/api/auth/login", json={"email": f"{role}@brandguard.test", "password": DEMO_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["token"]}


@pytest.fixture(scope="session")
def creator(client):
    return login(client, "creator")


@pytest.fixture(scope="session")
def manager(client):
    return login(client, "manager")


@pytest.fixture(scope="session")
def reviewer(client):
    return login(client, "reviewer")
