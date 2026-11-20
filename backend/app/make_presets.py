"""Bake the sign-in page's preset comparisons into the website, so they show at once even while the API
is asleep. Only text someone types goes to the server.

    cd backend && python -m app.make_presets

Writes frontend/src/presets.json from a fresh demo database. tests/test_brands.py fails if the file
no longer matches what the API says, so it cannot drift from the rules.
"""
import json
import os
import tempfile
from pathlib import Path

PRESETS = [
    ("Hype post", "OMG!! Our new mango fizz is the most fun you'll have all week. Grab yours today!"),
    ("Drink ad", "BUY NOW!! Our healthy new mango fizz is the best drink in town. Click here to grab yours."),
    ("Payroll ad", "Lumio Pay is India's #1 payroll app, trusted by 10,000 companies. Guaranteed accuracy. Click here!"),
    ("Neutral", "Something new is coming this summer. Sign up on our website to hear about it first."),
]
OUT = Path(__file__).resolve().parents[2] / "frontend" / "src" / "presets.json"


def build(client) -> list[dict]:
    out = []
    for label, text in PRESETS:
        r = client.post("/api/demo/compare", json={"text": text})
        r.raise_for_status()
        out.append({"label": label, "text": text, "result": r.json()})
    return out


if __name__ == "__main__":
    os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "presets.db").replace("\\", "/")
    os.environ["GROQ_API_KEY"] = ""
    os.environ["BRANDGUARD_RATE_LIMITS"] = "off"
    from fastapi.testclient import TestClient

    from .main import app
    with TestClient(app) as c:
        OUT.write_text(json.dumps(build(c), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("Wrote", OUT)
