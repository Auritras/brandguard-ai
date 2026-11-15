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


def test_ai_fixes_obey_rules_and_do_not_repeat_exact_findings(client, creator, monkeypatch):
    body = "Lumio Payroll is the #1 payroll app, trusted by 10,000 companies. Hurry, our clients love it."
    d = client.post("/api/drafts", headers=creator, json={"title": "Rules in fixes", "body": body}).json()

    def fake_chat(system, user):
        assert "R-002" in user and 'not "clients"' in user  # pattern rules and terms are sent for the fixes
        return {
            "findings": [
                # repeats the exact fact finding on the same passage, same category -> dropped
                {"quote": "trusted by 10,000 companies", "rule_code": "R-009", "reason": "Unsupported number."},
                # kept, and its fix gets the preferred term
                {"quote": "Hurry, our clients love it.", "rule_code": "R-001", "reason": "Pressure.",
                 "suggestion": "Our clients love it."},
            ],
            # swaps "#1" for "leading", which breaks the same rule -> no fix is shown
            "rewrites": [{"index": i, "suggestion": "Lumio Payroll is a leading payroll app."} for i in range(6)],
        }

    monkeypatch.setattr(config, "AI_API_KEY", "test-key")
    monkeypatch.setattr(ai, "_chat", fake_chat)
    d = client.post(f"/api/drafts/{d['id']}/check", headers=creator).json()

    ai_findings = [f for f in d["findings"] if f["source"] == "ai"]
    assert [f["ref_code"] for f in ai_findings] == ["R-001"]
    assert ai_findings[0]["suggestion"] == "Our customers love it."
    superlative = next(f for f in d["findings"] if f["ref_code"] == "R-002")
    assert "leading" not in (superlative["suggestion"] or "")


def test_rate_limited_ai_call_waits_and_retries(monkeypatch):
    import httpx
    from app.engine import ai

    calls = []

    def fake_post(url, headers, json, timeout):
        calls.append(1)
        req = httpx.Request("POST", url)
        if len(calls) < 3:
            return httpx.Response(429, headers={"retry-after": "0"}, json={"error": {"message": "slow down"}}, request=req)
        body = {"choices": [{"message": {"content": '{"findings": [], "rewrites": []}'}}]}
        return httpx.Response(200, json=body, request=req)

    monkeypatch.setattr(ai.httpx, "post", fake_post)
    monkeypatch.setattr(ai.time, "sleep", lambda s: None)
    assert ai._chat("s", "u") == {"findings": [], "rewrites": []}
    assert len(calls) == 3


def test_rate_limit_message_is_friendly_and_hides_provider_details():
    import httpx
    from app.engine import ai

    req = httpx.Request("POST", "https://example.test")
    res = httpx.Response(429, json={"error": {"message": "Rate limit reached in organization org_123"}}, request=req)
    why = ai._why(httpx.HTTPStatusError("429", request=req, response=res))
    assert "org_" not in why and "try the check again" in why
