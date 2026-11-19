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


def test_channel_limits(client, creator):
    tags = " ".join(f"#fizz{i}" for i in range(31))
    d = client.post("/api/drafts", headers=creator, json={"title": "Too many tags", "channel": "Instagram", "body": "Summer! " + tags}).json()
    d = client.post(f"/api/drafts/{d['id']}/check", headers=creator).json()
    ch = next(f for f in d["findings"] if f["ref_code"] == "CH-HASHTAGS")
    assert ch["quote"] == "31 hashtags" and ch["severity"] == "high"
    assert client.post(f"/api/findings/{ch['id']}/edit", headers=creator, json={"replacement": "x"}).status_code == 409
    live = client.post("/api/check-text", headers=creator, json={"body": "x" * 3001, "channel": "LinkedIn"}).json()
    assert any(f["ref_code"] == "CH-LENGTH" for f in live)


def test_accept_all_low_risk_fixes_in_one_version(client, creator):
    d = make(client, creator, "Our clients pay their staff with Lumio Pay. It is the best.")
    d = client.post(f"/api/drafts/{d['id']}/check", headers=creator).json()
    d = client.post(f"/api/drafts/{d['id']}/accept-certain", headers=creator).json()
    assert d["body"] == "Our customers pay their employees with Lumio Payroll. It is the best." and d["version"] == 2
    assert any(f["ref_code"] == "R-002" and f["status"] == "open" for f in d["findings"])  # high risk stays for a person
    assert client.post(f"/api/drafts/{d['id']}/accept-low", headers=creator).status_code == 409


def test_recheck_finds_approved_content_with_an_expired_fact(client, creator, manager):
    d = make(client, creator, "Customers rated us 4.6 out of 5.")
    client.post(f"/api/drafts/{d['id']}/check", headers=creator)
    client.post(f"/api/drafts/{d['id']}/submit", headers=creator)
    assert client.post(f"/api/drafts/{d['id']}/approve", headers=manager).json()["status"] == "approved"
    alerts = client.get("/api/recheck", headers=manager).json()
    hit = next(a for a in alerts if a["id"] == d["id"])
    assert hit["issues"][0]["ref_code"] == "F-004" and "expired" in hit["issues"][0]["reason"]


def test_share_link_opens_the_record_without_signing_in(client, creator):
    d = make(client, creator, "A calm post.")
    link = client.post(f"/api/drafts/{d['id']}/share", headers=creator).json()["path"]
    did, token = link.split("/share/")[1].split("?t=")
    r = client.get(f"/api/public/record/{did}?t={token}")
    assert r.status_code == 200 and r.json()["title"] == "LinkedIn launch post" and not any(r.json()["can"].values())
    assert client.get(f"/api/public/record/{did}?t=wrong").status_code == 401
    assert client.get(f"/api/public/record/{int(did) + 1}?t={token}").status_code == 401  # one link, one record


def test_due_date_and_csv_rules(client, creator, reviewer):
    d = make(client, creator, "A calm post.")
    d = client.put(f"/api/drafts/{d['id']}/due", headers=creator, json={"due_date": "2026-12-01"}).json()
    assert d["due_date"] == "2026-12-01"
    bad = client.post("/api/rules/bulk", headers=reviewer, json={"rules": [{"category": "tone", "title": "X", "text": "Some rule.", "patterns": "(["}]})
    assert bad.status_code == 422
    ok = client.post("/api/rules/bulk", headers=reviewer, json={"rules": [{"category": "tone", "title": "No slang", "text": "Avoid slang like 'lit'."}]})
    assert ok.json()["rules"][0]["status"] == "proposed"


def test_a_fix_inside_a_flagged_sentence_keeps_the_sentence_fix_working(client, creator):
    d = make(client, creator, "Lumio Pay is trusted by 10,000 companies.")
    d = client.post(f"/api/drafts/{d['id']}/check", headers=creator).json()
    term = next(f for f in d["findings"] if f["ref_code"] == "TERM")
    d = client.post(f"/api/findings/{term['id']}/accept", headers=creator).json()  # "Lumio Pay" -> "Lumio Payroll"
    fact = next(f for f in d["findings"] if f["ref_code"] == "F-001")
    assert fact["quote"] == "Lumio Payroll is trusted by 10,000 companies."
    d = client.post(f"/api/findings/{fact['id']}/accept", headers=creator).json()
    assert d["body"] == "Lumio Payroll is trusted by 8,200 companies."


def test_carry_over_does_not_touch_a_longer_word(client, creator):
    d = make(client, creator, "Lumio Payroll, not Lumio Pay, has 10,000 companies.")
    d = client.post(f"/api/drafts/{d['id']}/check", headers=creator).json()
    d = client.post(f"/api/drafts/{d['id']}/accept-certain", headers=creator).json()
    assert d["body"] == "Lumio Payroll, not Lumio Payroll, has 8,200 companies."
    assert "Payrollroll" not in d["body"]


def test_certain_fixes_include_figures_but_never_ai_rewrites_and_score_follows(client, creator):
    d = make(client, creator, "Our clients love it. Trusted by 10,000 companies. It is the best.")
    d = client.post(f"/api/drafts/{d['id']}/check", headers=creator).json()
    before = d["score"]
    assert before < 100
    d = client.post(f"/api/drafts/{d['id']}/accept-certain", headers=creator).json()
    assert "customers" in d["body"] and "8,200 companies" in d["body"]
    assert any(f["ref_code"] == "R-002" and f["status"] == "open" for f in d["findings"])  # left for a person
    assert d["score"] > before


def test_rewriting_a_sentence_rechecks_every_other_finding_on_it(client, creator):
    """The case from the critique: one fix rewrites the whole sentence. The term and the wrong figure in it
    must not stay open with fixes that would put the old text (and "#1") back."""
    d = make(client, creator, "Lumio Pay is now India's #1 payroll app, trusted by 10,000 companies. Book a demo.")
    d = client.post(f"/api/drafts/{d['id']}/check", headers=creator).json()
    fact = next(f for f in d["findings"] if f["ref_code"] == "F-001")
    d = client.post(f"/api/findings/{fact['id']}/edit", headers=creator,
                    json={"replacement": "Lumio Payroll is trusted by 8,200 companies in India."}).json()
    still = {f["ref_code"]: f for f in d["findings"] if f["status"] == "open"}
    assert "TERM" not in still and "R-002" not in still  # both fixed by the rewrite, so closed
    closed = [f for f in d["findings"] if f["ref_code"] in ("TERM", "R-002")]
    assert all("Fixed along with F-001" in f["note"] for f in closed)


def test_a_rewrite_that_keeps_a_problem_keeps_its_finding_at_the_new_place(client, creator):
    d = make(client, creator, "Lumio Pay is now India's #1 payroll app, trusted by 10,000 companies.")
    d = client.post(f"/api/drafts/{d['id']}/check", headers=creator).json()
    fact = next(f for f in d["findings"] if f["ref_code"] == "F-001")
    d = client.post(f"/api/findings/{fact['id']}/accept", headers=creator).json()  # fixes the figure only
    still = {f["ref_code"]: f for f in d["findings"] if f["status"] == "open"}
    assert still["TERM"]["quote"] == "Lumio Pay" and still["R-002"]["quote"] == "#1"
    for f in still.values():
        assert "10,000" not in (f["suggestion"] or "")  # no stale fix that would undo the accepted one
