"""The core workflow end to end, with AI switched off (exact checks only)."""

BODY = ("India's #1 payroll app, trusted by 10,000 companies. "
        "Our clients run payroll in 5 minutes. Click here to start.")


def make(client, creator, body=BODY):
    r = client.post("/api/drafts", headers=creator, json={
        "title": "LinkedIn launch post", "channel": "LinkedIn", "audience": "Small business owners",
        "purpose": "Announce the new onboarding flow", "body": body})
    assert r.status_code == 200, r.text
    return r.json()


def by_code(d, code):
    return next(f for f in d["findings"] if f["ref_code"] == code)


def test_full_review_flow(client, creator, manager, reviewer):
    d = make(client, creator)
    did = d["id"]

    # cannot submit before checking
    assert client.post(f"/api/drafts/{did}/submit", headers=creator).status_code == 409

    d = client.post(f"/api/drafts/{did}/check", headers=creator).json()
    codes = {f["ref_code"] for f in d["findings"]}
    assert {"R-002", "F-001", "TERM", "R-005"} <= codes
    assert d["run"]["ai_used"] is False and "skipped" in d["run"]["ai_note"]

    # accept the fact fix: the number is corrected and a new version is saved
    d = client.post(f"/api/findings/{by_code(d, 'F-001')['id']}/accept", headers=creator).json()
    assert "8,200 companies" in d["body"] and d["version"] == 2 and d["needs_check"] is True

    # write own fix for the term
    d = client.post(f"/api/findings/{by_code(d, 'TERM')['id']}/edit", headers=creator, json={"replacement": "customers"}).json()
    assert "Our customers" in d["body"]

    # dispute the superlative
    d = client.post(f"/api/findings/{by_code(d, 'R-002')['id']}/dispute", headers=creator,
                    json={"reason": "We won an industry award."}).json()
    assert by_code(d, "R-002")["status"] == "disputed"

    # re-check, then submit
    d = client.post(f"/api/drafts/{did}/check", headers=creator).json()
    assert by_code(d, "R-002")["status"] == "disputed"  # a disputed finding is not raised again
    d = client.post(f"/api/drafts/{did}/submit", headers=creator).json()
    assert d["status"] == "in_review"
    assert client.put(f"/api/drafts/{did}", headers=creator, json={"body": "x"}).status_code == 409

    # manager cannot decide a high-severity dispute; approving escalates
    fid = by_code(d, "R-002")["id"]
    assert client.post(f"/api/findings/{fid}/decide", headers=manager, json={"decision": "dismiss", "reason": "ok fine"}).status_code == 403
    d = client.post(f"/api/drafts/{did}/approve", headers=manager).json()
    assert d["status"] == "authorised_review"

    # reviewer cannot approve while it is open; waives with a reason; approves
    assert client.post(f"/api/drafts/{did}/approve", headers=reviewer).status_code == 409
    d = client.post(f"/api/findings/{fid}/waive", headers=reviewer, json={"reason": "Award certificate on file."}).json()
    # the click-here finding is medium, so it does not block
    d = client.post(f"/api/drafts/{did}/approve", headers=reviewer).json()
    assert d["status"] == "approved"
    actions = [h["action"] for h in d["history"]]
    assert "finding_waived" in actions and "approved" in actions and "sent_to_authorised_review" in actions


def test_clean_draft_is_approved_by_manager(client, creator, manager):
    d = make(client, creator, "Lumio Payroll helps small businesses pay their employees on time.")
    did = d["id"]
    d = client.post(f"/api/drafts/{did}/check", headers=creator).json()
    assert d["findings"] == []
    client.post(f"/api/drafts/{did}/submit", headers=creator)
    d = client.post(f"/api/drafts/{did}/approve", headers=manager).json()
    assert d["status"] == "approved"


def test_request_changes_returns_draft_to_creator(client, creator, manager):
    d = make(client, creator, "Lumio Payroll is cheap.")
    did = d["id"]
    client.post(f"/api/drafts/{did}/check", headers=creator)
    client.post(f"/api/drafts/{did}/submit", headers=creator)
    d = client.post(f"/api/drafts/{did}/request-changes", headers=manager, json={"note": "Fix the wording."}).json()
    assert d["status"] == "changes_requested"
    d = client.get(f"/api/drafts/{did}", headers=creator).json()
    assert d["can"]["edit"] is True and d["comments"][0]["text"].startswith("Changes requested")


def test_roles_are_enforced(client, creator, manager, reviewer):
    rule = {"category": "tone", "title": "Short sentences", "text": "Keep sentences under 25 words."}
    assert client.post("/api/rules", headers=creator, json=rule).status_code == 403
    assert client.post("/api/rules", headers=manager, json=rule).status_code == 403
    r = client.post("/api/rules", headers=reviewer, json=rule)
    assert r.status_code == 200 and r.json()["code"].startswith("R-")
    # Anyone may write a draft, but never approve their own (see test_brands for the full rule).
    own = client.post("/api/drafts", headers=manager, json={"title": "x y", "body": "b"}).json()
    assert own["can"]["approve"] is False


def test_import_proposes_rules_that_are_not_used_until_approved(client, reviewer, creator):
    text = "Always write in British English. Never use the word synergy in any customer content."
    r = client.post("/api/library/import", headers=reviewer, json={"text": text}).json()
    assert len(r["rules"]) >= 1 and all(x["status"] == "proposed" for x in r["rules"])
    lib = client.get("/api/library", headers=creator).json()
    assert any(x["status"] == "proposed" for x in lib["rules"])


def test_upload_text_file(client, creator):
    r = client.post("/api/extract", headers=creator, files={"file": ("post.txt", b"Hello from a file.", "text/plain")})
    assert r.json()["text"] == "Hello from a file."
    r = client.post("/api/extract", headers=creator, files={"file": ("a.exe", b"x", "application/octet-stream")})
    assert r.status_code == 422


def test_insights_counts_findings_and_scopes_creators(client, creator, manager):
    d = make(client, creator)
    client.post(f"/api/drafts/{d['id']}/check", headers=creator)
    team = client.get("/api/insights", headers=manager).json()
    mine = client.get("/api/insights", headers=creator).json()
    assert team["scope"] == "all drafts" and mine["scope"] == "your drafts"
    assert mine["drafts"] >= 1 and mine["findings"] >= 4
    assert any(r["code"] == "R-002" for r in mine["top_refs"])
    linkedin = next(r for r in mine["channels"] if r["channel"] == "LinkedIn")
    assert linkedin["per_draft"] > 0
    assert sum(mine["outcomes"].values()) == mine["findings"]


def test_check_text_finds_issues_while_typing_and_saves_nothing(client, creator):
    before = len(client.get("/api/drafts", headers=creator).json())
    r = client.post("/api/check-text", headers=creator, json={"body": "Lumio Pay is the #1 app. Lumio Payroll is fine. Click here!!"})
    assert r.status_code == 200
    found = {f["ref_code"]: f for f in r.json()}
    assert {"TERM", "R-002", "R-005"} <= set(found)
    assert found["TERM"]["spans"] == [[0, 9]]  # not inside "Lumio Payroll"
    assert len(client.get("/api/drafts", headers=creator).json()) == before
