"""Guideline gaps: rules people keep arguing with are found, a rewrite can be suggested and accepted, the
rule keeps its history, and the numbers are split before and after the change."""
from app import config
from app.engine import ai

from test_workflow import by_code, make


def disputed_and_dismissed(client, creator, manager, reviewer, body, code, why):
    d = make(client, creator, body)
    d = client.post(f"/api/drafts/{d['id']}/check", headers=creator).json()
    d = client.post(f"/api/findings/{by_code(d, code)['id']}/dispute", headers=creator, json={"reason": why}).json()
    d = client.post(f"/api/drafts/{d['id']}/submit", headers=creator).json()
    d = client.post(f"/api/findings/{by_code(d, code)['id']}/decide", headers=manager,
                    json={"decision": "dismiss", "reason": "Fair, the link names the guide."}).json()
    return d


def test_unclear_rule_is_found_and_rewritten(client, creator, manager, reviewer, monkeypatch):
    for n in range(2):
        disputed_and_dismissed(client, creator, manager, reviewer, f"Payroll guide part {n}. Read more about tax slabs.", "R-005",
                               "The button says 'Read more about tax slabs', which names the guide.")
    g = client.get("/api/insights/gaps", headers=reviewer).json()
    r5 = next(r for r in g["rules"] if r["code"] == "R-005")
    assert r5["unclear"] and r5["counts"]["dismissed"] >= 2 and r5["examples"]
    assert g["rules"][0]["unclear"]  # unclear rules come first

    # only the brand owner can ask for a rewrite; without AI it says so plainly
    assert client.post(f"/api/rules/{r5['id']}/suggest-rewrite", headers=manager).status_code == 403
    assert client.post(f"/api/rules/{r5['id']}/suggest-rewrite", headers=reviewer).status_code == 503

    def fake_chat(system, user):
        assert "Read more about tax slabs" in user and "R-005" in user
        return {"title": "Descriptive links", "text": "Link text must say where it goes. 'Read more' is fine only when the same words name the page, as in 'Read more about tax slabs'.",
                "patterns": r"\bclick here\b" + "\n" + r"\bread more\b(?!\s+about)", "why": "Reviewers accepted 'read more about X'."}
    monkeypatch.setattr(config, "AI_API_KEY", "test-key")
    monkeypatch.setattr(ai, "_chat", fake_chat)
    s = client.post(f"/api/rules/{r5['id']}/suggest-rewrite", headers=reviewer).json()
    assert "tax slabs" in s["text"] and s["patterns"]

    lib = client.get("/api/library", headers=reviewer).json()
    rule = next(r for r in lib["rules"] if r["code"] == "R-005")
    put = client.put(f"/api/rules/{rule['id']}", headers=reviewer, json={
        "category": rule["category"], "severity": rule["severity"], "title": s["title"], "text": s["text"],
        "patterns": s["patterns"], "note": "Rewritten after guideline-gap review: " + s["why"]})
    assert put.status_code == 200 and put.json()["versions"] == 1
    hist = client.get(f"/api/rules/{rule['id']}/history", headers=creator).json()
    assert hist[0]["text"].startswith("Link text must say where the link goes") and "guideline-gap" in hist[0]["note"]

    g = client.get("/api/insights/gaps", headers=reviewer).json()
    r5 = next(r for r in g["rules"] if r["code"] == "R-005")
    assert r5["changed_at"] and r5["before"]["friction"] >= 2 and r5["after"]["total"] == 0

    # the new wording is what the check uses now: "read more about ..." is no longer flagged
    d = make(client, creator, "Payroll guide. Read more about tax slabs.")
    d = client.post(f"/api/drafts/{d['id']}/check", headers=creator).json()
    assert not any(f["ref_code"] == "R-005" for f in d["findings"])


def test_missing_rules_become_proposals(client, reviewer, manager, monkeypatch):
    monkeypatch.setattr(config, "AI_API_KEY", "test-key")
    monkeypatch.setattr(ai, "_chat", lambda system, user: {"rules": [
        {"category": "messaging", "title": "Mention the free trial length", "text": "Say the trial is 14 days.", "severity": "low",
         "because": "Two change requests asked for it."}]})
    for n in range(3):
        d = client.get("/api/drafts", headers=manager).json()[0]
        client.post(f"/api/drafts/{d['id']}/comments", headers=manager, json={"text": f"Please say how long the free trial is ({n})."})
    assert client.post("/api/insights/gaps/missing", headers=manager).status_code == 403
    out = client.post("/api/insights/gaps/missing", headers=reviewer).json()
    assert out["rules"][0]["title"] == "Mention the free trial length"
    lib = client.get("/api/library", headers=reviewer).json()
    proposed = [r for r in lib["rules"] if r["status"] == "proposed" and r["title"] == "Mention the free trial length"]
    assert proposed  # waiting for approval, not used in checks yet
