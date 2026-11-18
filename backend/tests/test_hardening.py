"""Normal-use robustness: two people on one draft, double clicks, oversized input, renamed files, rate limits."""
import pytest
from fastapi import HTTPException

from app.limits import Limit

from test_workflow import make


def test_acting_on_an_out_of_date_page_is_refused_with_who_did_what(client, creator, manager, reviewer):
    d = make(client, creator, "A calm post. Click here to read it.")
    client.post(f"/api/drafts/{d['id']}/check", headers=creator)
    d = client.post(f"/api/drafts/{d['id']}/submit", headers=creator).json()
    seen = client.get(f"/api/drafts/{d['id']}", headers=manager).json()["rev"]  # the manager opens the page...
    r = client.post(f"/api/drafts/{d['id']}/request-changes", headers={**reviewer, "X-Seen-Rev": str(seen)},
                    json={"note": "Please fix the link text."})  # ...the brand owner acts first
    assert r.status_code == 200
    late = client.post(f"/api/drafts/{d['id']}/approve", headers={**manager, "X-Seen-Rev": str(seen)})
    assert late.status_code == 409 and "Meera sent this draft back for changes a moment ago" in late.json()["detail"]
    # with the latest page, the refusal is the ordinary one
    now = client.get(f"/api/drafts/{d['id']}", headers=manager).json()["rev"]
    again = client.post(f"/api/drafts/{d['id']}/approve", headers={**manager, "X-Seen-Rev": str(now)})
    assert again.status_code == 409 and "not waiting" in again.json()["detail"]


def test_double_clicks_do_not_double_up(client, creator):
    d = make(client, creator, "Our clients love it.")
    first = client.post(f"/api/drafts/{d['id']}/check", headers=creator).json()
    second = client.post(f"/api/drafts/{d['id']}/check", headers=creator).json()
    assert sum(h["action"] == "check_run" for h in second["history"]) == 1
    assert [f["id"] for f in first["findings"]] == [f["id"] for f in second["findings"]]
    for _ in range(2):
        out = client.post(f"/api/drafts/{d['id']}/comments", headers=creator, json={"text": "Ready for a look."}).json()
    assert [c["text"] for c in out["comments"]].count("Ready for a look.") == 1


def test_oversized_and_disguised_input(client, creator):
    r = client.post("/api/drafts", headers=creator, json={"title": "Huge", "body": "x" * 20001})
    assert r.status_code == 422
    r = client.post("/api/extract", headers=creator, files={"file": ("brief.pdf", b"PK\x03\x04 a zip, not a pdf", "application/pdf")})
    assert r.status_code == 422 and "not a PDF" in r.json()["detail"]
    r = client.post("/api/extract", headers=creator, files={"file": ("brief.docx", b"%PDF-1.7", "application/octet-stream")})
    assert r.status_code == 422 and "not a Word document" in r.json()["detail"]
    r = client.post("/api/extract", headers=creator, files={"file": ("broken.pdf", b"%PDF-1.7 \x00\x01 garbage", "application/pdf")})
    assert r.status_code == 422  # a corrupt file gets a message, not a crash
    r = client.post("/api/extract", headers=creator, files={"file": ("notes.txt", "नमस्ते 🎉 Lumio".encode(), "text/plain")})
    assert r.json()["text"] == "नमस्ते 🎉 Lumio"


def test_rate_limit(monkeypatch):
    monkeypatch.setenv("BRANDGUARD_RATE_LIMITS", "on")
    lim = Limit(2, 60, "Slow down.")
    lim.check("a")
    lim.check("a")
    lim.check("b")  # someone else is not affected
    with pytest.raises(HTTPException) as e:
        lim.check("a")
    assert e.value.status_code == 429 and "Slow down." in e.value.detail
