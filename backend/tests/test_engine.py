from datetime import date
from types import SimpleNamespace as NS

from app.engine.exact import check_facts, check_rule_patterns, check_terms
from app.engine.verify import locate, verify_ai_findings

TERMS = [NS(id=1, banned="Lumio Pay", preferred="Lumio Payroll", note=""), NS(id=2, banned="clients", preferred="customers", note="")]
RULES = [NS(code="R-002", category="claims", title="No superlatives", text="No #1.", severity="high", patterns=r"#\s?1\b" + "\n" + r"\bthe best\b"),
         NS(code="R-006", category="accessibility", title="No shouting", text="No caps.", severity="low", patterns=r"\b[A-Z]{3,}(?:\s+[A-Z]{2,}){2,}\b")]
FACTS = [NS(code="F-001", statement="Used by 8,200 companies.", keywords="companies,customers", value="8,200", source="Report", valid_until=date(2027, 3, 31)),
         NS(code="F-004", statement="Rated 4.6 out of 5.", keywords="rated,out of 5", value="4.6", source="Survey", valid_until=date(2026, 9, 30))]
TODAY = date(2026, 11, 13)


def test_banned_term_gets_preferred_suggestion():
    f = check_terms("Our clients love it. Clients stay.", TERMS)
    assert [(x["quote"], x["suggestion"]) for x in f] == [("clients", "customers"), ("Clients", "Customers")]


def test_correct_full_name_is_not_flagged():
    assert check_terms("Lumio Payroll is here.", TERMS) == []
    assert len(check_terms("Lumio Pay is here.", TERMS)) == 1


def test_pattern_rule_and_case_sensitivity():
    f = check_rule_patterns("India's #1 app. Simply the best. BUY IT NOW today.", RULES)
    assert {x["quote"] for x in f} == {"#1", "the best", "BUY IT NOW"}
    assert check_rule_patterns("buy it now today", RULES) == []


def test_wrong_number_is_corrected_to_the_approved_fact():
    f = check_facts("Trusted by 10,000 companies across India.", FACTS, TODAY)
    assert len(f) == 1 and f[0]["ref_code"] == "F-001" and f[0]["severity"] == "high"
    assert f[0]["suggestion"] == "Trusted by 8,200 companies across India."


def test_right_number_passes_and_expired_fact_is_flagged():
    assert check_facts("Trusted by 8,200 companies.", FACTS, TODAY) == []
    f = check_facts("Customers rated us 4.6 out of 5.", FACTS, TODAY)
    assert len(f) == 1 and "expired" in f[0]["reason"]


def test_locate_tolerates_whitespace_and_curly_quotes():
    body = "We’re the  fastest\npayroll tool."
    assert locate("We're the fastest payroll tool.", body) == body
    assert locate("not in the draft", body) is None


def test_verification_drops_invented_quotes_and_codes():
    body = "Hurry, only today! Lumio is an HR suite."
    refs = {"R-001": {"text": "tone", "category": "tone", "severity": "medium"}}
    raw = [
        {"quote": "Hurry, only today!", "rule_code": "R-001", "reason": "Pressure.", "suggestion": "Try it today."},
        {"quote": "This sentence is not there.", "rule_code": "R-001", "reason": "x"},
        {"quote": "Lumio is an HR suite.", "rule_code": "R-999", "reason": "x"},
        {"quote": "Hurry, only today!", "rule_code": "R-001", "reason": ""},
        "garbage",
    ]
    kept, dropped = verify_ai_findings(raw, body, refs)
    assert len(kept) == 1 and kept[0]["source"] == "ai" and kept[0]["severity"] == "medium"
    assert len(dropped) == 4
