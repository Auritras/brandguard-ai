"""Demo data for a FICTIONAL brand, "Lumio Payroll".

Written by the team for the demo. It is synthetic: not real company data.
"""
from datetime import date

from sqlalchemy.orm import Session

from .auth import hash_password
from .config import DEMO_PASSWORD
from .models import Fact, Rule, Term, User

USERS = [
    ("Asha (Creator)", "creator@brandguard.test", "creator"),
    ("Rohan (Manager)", "manager@brandguard.test", "manager"),
    ("Meera (Brand owner)", "reviewer@brandguard.test", "reviewer"),
]

# code, category, title, text, severity, patterns (one regex per line; empty = judged by AI)
RULES = [
    ("R-001", "tone", "Plain, confident, friendly",
     "Write in plain, confident, friendly language. No hype, no fear-based urgency, no pressure tactics.",
     "medium", ""),
    ("R-002", "claims", "No unsupported superlatives",
     "Do not call Lumio '#1', 'the best', 'leading' or similar unless an approved fact supports it.",
     "high", "\n".join([r"#\s?1\b", r"\bnumber one\b", r"\bthe best\b", r"\bleading\b", r"\bworld[- ]class\b", r"\bunbeatable\b"])),
    ("R-003", "claims", "No promised outcomes",
     "Never promise an outcome. Avoid 'guarantee', 'risk-free', '100%' and 'never fails'.",
     "high", "\n".join([r"\bguarantee[ds]?\b", r"\brisk[- ]free\b", r"\b100\s?%", r"\bnever fails?\b"])),
    ("R-004", "messaging", "What Lumio is",
     "Describe Lumio as payroll software for small businesses. Do not position it as an HR suite, an accounting tool or an enterprise product.",
     "medium", ""),
    ("R-005", "accessibility", "Descriptive links",
     "Link text must say where the link goes. Do not use 'click here' or 'read more' on their own.",
     "medium", "\n".join([r"\bclick here\b", r"\bread more\b"])),
    ("R-006", "accessibility", "No shouting",
     "Do not write whole phrases in capital letters; screen readers may spell them out.",
     "low", r"\b[A-Z]{3,}(?:\s+[A-Z]{2,}){2,}\b"),
    ("R-007", "tone", "One exclamation mark at most",
     "Use at most one exclamation mark in a piece of content.",
     "low", r"!(?=[^!]*!)"),
    ("R-008", "messaging", "Respect competitors",
     "Do not name or disparage competitors.",
     "high", ""),
    ("R-009", "claims", "Claims need an approved fact",
     "Any statistic, ranking, award or measurable claim must be supported by an approved fact. If no approved fact covers it, it must be removed or approved first.",
     "high", ""),
]

# code, statement, keywords, approved value, source, valid until
FACTS = [
    ("F-001", "Lumio Payroll is used by 8,200 companies.", "companies,customers,businesses",
     "8,200", "Customer count report, Q3 2026", date(2027, 3, 31)),
    ("F-002", "A payroll run takes under 5 minutes on average.", "minutes",
     "5", "Product analytics, September 2026", date(2027, 1, 31)),
    ("F-003", "Pricing starts at Rs 49 per employee per month.", "per employee,pricing,starts at",
     "49", "Pricing page, approved October 2026", date(2027, 6, 30)),
    ("F-004", "Customers rated Lumio 4.6 out of 5 in the 2025 annual survey.", "rated,rating,out of 5",
     "4.6", "Annual customer survey 2025", date(2026, 9, 30)),
]

TERMS = [
    ("Lumio Pay", "Lumio Payroll", "Always use the full product name."),
    ("clients", "customers", "We say customers."),
    ("cheap", "affordable", ""),
    ("e-mail", "email", ""),
    ("staff", "employees", "We say employees."),
]


def seed(db: Session) -> None:
    if db.query(User).count() == 0:
        for name, email, role in USERS:
            db.add(User(name=name, email=email, role=role, password_hash=hash_password(DEMO_PASSWORD)))
    if db.query(Rule).count() == 0:
        for code, cat, title, text, sev, patterns in RULES:
            db.add(Rule(code=code, category=cat, title=title, text=text, severity=sev, patterns=patterns))
        for code, statement, keywords, value, source, until in FACTS:
            db.add(Fact(code=code, statement=statement, keywords=keywords, value=value, source=source, valid_until=until))
        for banned, preferred, note in TERMS:
            db.add(Term(banned=banned, preferred=preferred, note=note))
    db.commit()
