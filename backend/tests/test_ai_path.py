"""The AI path with a fake model reply: good findings are kept, invented ones are dropped."""
from app import config
from app.engine import ai


def test_ai_findings_are_verified_and_disclosed(client, creator, monkeypatch):
    body = "Hurry, prices go up soon and you will regret missing out. Lumio Payroll is the #1 choice."
    d = client.post("/api/drafts", headers=creator, json={"title": "Email teaser", "channel": "Email", "body": body}).json()

    def fake_chat(system, user):
        assert "R-001" in user and body in user  # rules and the draft are sent
        assert "creator@brandguard.test" not in user  # no user details are sent
        return {
            "findings": [
                {"quote": "Hurry, prices go up soon and you will regret missing out.", "rule_code": "R-001",
                 "reason": "This pressures the reader.", "suggestion": "Prices change next month, so now is a good time to look."},
                {"quote": "A sentence the model made up.", "rule_code": "R-001", "reason": "Invented quote."},
                {"quote": "Lumio Payroll is the #1 choice.", "rule_code": "R-404", "reason": "Invented rule."},
            ],
            "rewrites": [{"index": 0, "suggestion": "Lumio Payroll is a popular choice."}],
        }

    monkeypatch.setattr(config, "AI_API_KEY", "test-key")
    monkeypatch.setattr(ai, "_chat", fake_chat)
    d = client.post(f"/api/drafts/{d['id']}/check", headers=creator).json()

    ai_findings = [f for f in d["findings"] if f["source"] == "ai"]
    assert len(ai_findings) == 1 and ai_findings[0]["ref_code"] == "R-001"
    assert d["run"]["ai_used"] is True and d["run"]["ai_count"] == 1 and d["run"]["dropped_count"] == 2
    assert "Sent to" in d["run"]["ai_note"]

    # the exact "#1" finding received the AI's sentence rewrite as its suggested fix
    superlative = next(f for f in d["findings"] if f["ref_code"] == "R-002")
    assert superlative["quote"] == "Lumio Payroll is the #1 choice."
    assert superlative["suggestion"] == "Lumio Payroll is a popular choice."


def test_ai_failure_falls_back_to_exact_checks(client, creator, monkeypatch):
    d = client.post("/api/drafts", headers=creator, json={"title": "Fallback", "body": "Our clients love it."}).json()

    def broken(system, user):
        raise RuntimeError("rate limited")

    monkeypatch.setattr(config, "AI_API_KEY", "test-key")
    monkeypatch.setattr(ai, "_chat", broken)
    d = client.post(f"/api/drafts/{d['id']}/check", headers=creator).json()
    assert d["run"]["ai_used"] is False and "failed" in d["run"]["ai_note"]
    assert [f["ref_code"] for f in d["findings"]] == ["TERM"]
