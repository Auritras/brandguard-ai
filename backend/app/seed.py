"""Demo data for a FICTIONAL brand, "Lumio Payroll".

Written by the team for the demo. It is synthetic: not real company data.
"""
from datetime import date

from sqlalchemy import update
from sqlalchemy.orm import Session

from .auth import hash_password
from .config import DEMO_PASSWORD
from .models import AuditLog, Brand, Draft, Fact, Rule, Term, User

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


# ---------------------------------------------------------------------------------------------
# A second, contrasting demo brand: FICTIONAL "Fizzbox", a playful soft-drinks company. Where Lumio
# wants calm, plain copy, Fizzbox wants loud and fun: short calls to action like "Buy NOW" and
# exclamation marks are on-brand. Its strict side is health claims and children.

FIZZ_USERS = [
    ("Kabir (Creator)", "creator@fizzbox.test", "creator"),
    ("Tara (Manager)", "manager@fizzbox.test", "manager"),
    ("Neel (Brand owner)", "reviewer@fizzbox.test", "reviewer"),
]

FIZZ_RULES = [
    ("R-001", "tone", "Loud, playful, friendly",
     "Write like a friend who is excited: short, upbeat and fun. Urgency and calls to action such as "
     "'Buy NOW' or 'Grab yours today!' are welcome. Do not sound like a corporate notice.",
     "medium", ""),
    ("R-002", "tone", "No stiff corporate wording",
     "Avoid formal or legal-sounding words such as 'utilise', 'hereby', 'kindly', 'please be advised' and 'leverage'.",
     "low", "\n".join([r"\butili[sz]e[sd]?\b", r"\bhereby\b", r"\bkindly\b", r"\bplease be advised\b", r"\bleverag(e|es|ed|ing)\b"])),
    ("R-003", "claims", "No health claims",
     "Never say or suggest a drink is healthy or has health effects: no 'healthy', 'boosts immunity', 'detox', "
     "'guilt-free' or 'good for you'.",
     "high", "\n".join([r"\bhealthy\b", r"\bboosts? (?:your )?immun\w*", r"\bdetox\w*", r"\bguilt[- ]free\b", r"\bgood for you\b"])),
    ("R-004", "claims", "Sugar and calorie numbers need an approved fact",
     "Any number about sugar, calories or ingredients must match an approved fact.",
     "high", ""),
    ("R-005", "messaging", "Never aimed at children",
     "Do not target or show children under 13; Fizzbox is marketed to teens and adults.",
     "high", ""),
    ("R-006", "accessibility", "Caps for short calls to action only",
     "Capitals are fine for a short call to action (up to four words, like 'BUY NOW'). Longer runs of capitals are hard to read.",
     "low", r"\b[A-Z]{2,}(?:\s+[A-Z]+){4,}\b"),
    ("R-007", "accessibility", "Descriptive links",
     "Link text must say where the link goes. Do not use 'click here' or 'read more' on their own.",
     "medium", "\n".join([r"\bclick here\b", r"\bread more\b"])),
    ("R-008", "messaging", "Respect competitors",
     "Do not name or mock other drinks brands.",
     "high", ""),
]

FIZZ_FACTS = [
    ("F-001", "Fizzbox Zero has 0 g sugar per can.", "sugar", "0", "Product label, 2026", date(2027, 12, 31)),
    ("F-002", "Each 330 ml can of Fizzbox Classic has 45 calories.", "calories,kcal", "45", "Nutrition panel, 2026", date(2027, 12, 31)),
    ("F-003", "Fizzbox is sold in 1,200 stores across India.", "stores,shops", "1,200", "Distribution report, Q3 2026", date(2027, 3, 31)),
]

FIZZ_TERMS = [
    ("beverage", "drink", "We say drink."),
    ("consumers", "fans", "The people who buy Fizzbox are our fans."),
    ("customers", "fans", "The people who buy Fizzbox are our fans."),
    ("sugar-free", "zero sugar", "Matches the label."),
]

# Every demo brand: key -> (brand name, people, rules, facts, terms)
TEMPLATES = {
    "lumio": ("Lumio Payroll", USERS, RULES, FACTS, TERMS),
    "fizzbox": ("Fizzbox", FIZZ_USERS, FIZZ_RULES, FIZZ_FACTS, FIZZ_TERMS),
}
DEMO_BRAND = TEMPLATES["lumio"][0]


def template_key(name: str) -> str:
    return next((k for k, t in TEMPLATES.items() if t[0] == name), "lumio")


def demo_brand(db: Session, key: str = "lumio") -> Brand:
    """The read-only template a demo brand's visitor copies are made from."""
    name = TEMPLATES[key][0]
    brand = db.query(Brand).filter_by(demo=True, name=name).first()
    if brand is None:
        brand = Brand(name=name, demo=True)
        db.add(brand)
        db.flush()
    return brand


def seed_library(db: Session, brand_id: int, key: str = "lumio") -> None:
    """A Brand Library from a template: rules, facts and terms, which the owner then edits."""
    _name, _users, rules, facts, terms = TEMPLATES[key]
    for code, cat, title, text, sev, patterns in rules:
        db.add(Rule(brand_id=brand_id, code=code, category=cat, title=title, text=text, severity=sev, patterns=patterns))
    for code, statement, keywords, value, source, until in facts:
        db.add(Fact(brand_id=brand_id, code=code, statement=statement, keywords=keywords, value=value,
                    source=source, valid_until=until))
    for banned, preferred, note in terms:
        db.add(Term(brand_id=brand_id, banned=banned, preferred=preferred, note=note))


def seed(db: Session) -> None:
    lumio = demo_brand(db)
    # Anything made before brands existed belongs to the Lumio demo brand.
    for model in (User, Rule, Fact, Term, Draft, AuditLog):
        if db.query(model.id).filter(model.brand_id.is_(None)).first():  # write only when needed
            db.execute(update(model).where(model.brand_id.is_(None)).values(brand_id=lumio.id))
    for key, (_name, users, *_rest) in TEMPLATES.items():
        brand = demo_brand(db, key)
        for name, email, role in users:
            if db.query(User).filter_by(email=email).first() is None:
                db.add(User(brand_id=brand.id, name=name, email=email, role=role, password_hash=hash_password(DEMO_PASSWORD)))
        if db.query(Rule).filter_by(brand_id=brand.id).count() == 0:
            seed_library(db, brand.id, key)
        if not brand.palette:  # brand colours and logo for image review
            from .samples import PALETTES, logo_png
            brand.palette, brand.logo, brand.logo_type = PALETTES[key], logo_png(key), "image/png"
    db.commit()
