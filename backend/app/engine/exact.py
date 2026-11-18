"""Exact checks: plain code, no AI. The same draft always gives the same findings."""
import re
from datetime import date

SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+|\n+")
NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")


def sentences(body: str) -> list[str]:
    return [s.strip() for s in SENTENCE_SPLIT.split(body) if s.strip()]


def sentence_containing(body: str, start: int, end: int) -> str:
    """The sentence of `body` that holds the character range start..end."""
    pos = 0
    for part in SENTENCE_SPLIT.split(body):
        idx = body.find(part, pos)
        if idx == -1:
            continue
        if idx <= start and end <= idx + len(part):
            return part.strip()
        pos = idx + len(part)
    return body[start:end]


def _norm(number: str) -> str:
    return number.replace(",", "").rstrip(".")


def _match_case(original: str, replacement: str) -> str:
    if original[:1].isupper() and replacement[:1].islower():
        return replacement[:1].upper() + replacement[1:]
    return replacement


def check_terms(body: str, terms) -> list[dict]:
    out, seen = [], set()
    for term in terms:
        pattern = re.compile(r"(?<![\w-])" + re.escape(term.banned) + r"(?![\w-])", re.IGNORECASE)
        for m in pattern.finditer(body):
            quote = m.group(0)
            # "Lumio Pay" must not fire inside the correct "Lumio Payroll"
            if body[m.start():m.start() + len(term.preferred)].lower() == term.preferred.lower():
                continue
            if (quote, term.id) in seen:
                continue
            seen.add((quote, term.id))
            out.append({
                "source": "exact", "category": "terminology", "severity": "low",
                "quote": quote, "ref_code": "TERM",
                "ref_text": f"Say \"{term.preferred}\", not \"{term.banned}\". {term.note}".strip(),
                "reason": f"\"{quote}\" is on the list of terms we do not use.",
                "suggestion": _match_case(quote, term.preferred),
            })
    return out


def check_rule_patterns(body: str, rules) -> list[dict]:
    out, seen = [], set()
    for rule in rules:
        for line in (rule.patterns or "").splitlines():
            line = line.strip()
            if not line:
                continue
            # Patterns that test for capital letters must stay case-sensitive.
            flags = 0 if "[A-Z]" in line else re.IGNORECASE
            try:
                pattern = re.compile(line, flags)
            except re.error:
                continue
            for m in pattern.finditer(body):
                quote = m.group(0)
                if not quote.strip() or (quote, rule.code) in seen:
                    continue
                seen.add((quote, rule.code))
                out.append({
                    "source": "exact", "category": rule.category, "severity": rule.severity,
                    "quote": quote, "ref_code": rule.code, "ref_text": rule.text,
                    "reason": f"\"{quote}\" breaks the rule \"{rule.title}\".",
                    "suggestion": "",
                    "_sentence": sentence_containing(body, m.start(), m.end()),
                })
    return out


WINDOW = 20  # characters between a number and a fact keyword for them to belong together


def claimed_by_others(fact, facts, low_sentence: str) -> set[str]:
    """Approved values of other facts whose keywords also appear in this sentence."""
    out = set()
    for other in facts:
        if other.code == fact.code or not other.value:
            continue
        if any(k.strip().lower() in low_sentence for k in (other.keywords or "").split(",") if k.strip()):
            out.add(_norm(other.value))
    return out


def check_facts(body: str, facts, today: date | None = None) -> list[dict]:
    """Numbers next to a fact's keywords must equal the approved value, and the fact must not be expired."""
    today = today or date.today()
    out, seen = [], set()
    for sentence in sentences(body):
        low = sentence.lower()
        numbers = list(NUMBER.finditer(sentence))
        if not numbers:
            continue
        for fact in facts:
            keywords = [k.strip().lower() for k in (fact.keywords or "").split(",") if k.strip()]
            hit = next((k for k in keywords if k in low), None)
            if hit is None or not fact.value:
                continue
            if (sentence, fact.code) in seen:
                continue
            approved = _norm(fact.value)
            found = [_norm(n.group(0)) for n in numbers]
            if approved in found:
                if fact.valid_until and fact.valid_until < today:
                    seen.add((sentence, fact.code))
                    out.append({
                        "source": "exact", "category": "claims", "severity": "medium",
                        "quote": sentence, "ref_code": fact.code,
                        "ref_text": f"{fact.statement} (Source: {fact.source}; valid until {fact.valid_until.isoformat()})",
                        "reason": f"This figure comes from an approved fact that expired on {fact.valid_until.isoformat()}. It may be out of date.",
                        "suggestion": "",
                    })
                continue
            # Mismatch: only numbers right next to the keyword count, and not ones
            # that another fact mentioned in the same sentence already explains.
            key_start = low.find(hit)
            key_end = key_start + len(hit)
            near = [n for n in numbers
                    if (0 <= key_start - n.end() <= WINDOW or 0 <= n.start() - key_end <= WINDOW)
                    and _norm(n.group(0)) not in claimed_by_others(fact, facts, low)]
            if not near:
                continue
            nearest = min(near, key=lambda n: min(abs(key_start - n.end()), abs(n.start() - key_end)))
            fixed = sentence[:nearest.start()] + fact.value + sentence[nearest.end():]
            seen.add((sentence, fact.code))
            out.append({
                "source": "exact", "category": "claims", "severity": "high",
                "quote": sentence, "ref_code": fact.code,
                "ref_text": f"{fact.statement} (Source: {fact.source})",
                "reason": f"The draft says {nearest.group(0)}, but the approved figure is {fact.value}.",
                "suggestion": fixed,
            })
    return out


HASHTAG = re.compile(r"(?<![\w&])#[^\s#.,!?;:()\[\]\"']+", re.UNICODE)

# Published platform limits. Over a hard limit, the post cannot be published as written.
CHANNEL_LIMITS = {
    "Instagram": [("CH-LENGTH", 2200, "high", "Instagram captions can be at most 2,200 characters (Instagram's limit)."),
                  ("CH-HASHTAGS", 30, "high", "Instagram allows at most 30 hashtags on a post (Instagram's limit).")],
    "LinkedIn": [("CH-LENGTH", 3000, "high", "LinkedIn posts can be at most 3,000 characters (LinkedIn's limit).")],
    "Advertisement": [("CH-LENGTH", 125, "low", "Ad text over about 125 characters is cut off with \"See more\" in most "
                                                 "social feeds (Meta's guidance for primary text).")],
}


def check_channel(body: str, channel: str) -> list[dict]:
    """Limits of the channel the draft is for: length, and the number of hashtags."""
    out = []
    for code, limit, severity, text in CHANNEL_LIMITS.get(channel or "", []):
        if code == "CH-LENGTH" and len(body) > limit:
            out.append({"source": "exact", "category": "channel", "severity": severity,
                        "quote": f"The whole text ({len(body):,} characters)", "ref_code": code, "ref_text": text,
                        "reason": f"This {channel} text is {len(body):,} characters long; the limit is {limit:,}. "
                                  f"Shorten it by {len(body) - limit:,} characters.", "suggestion": ""})
        if code == "CH-HASHTAGS":
            tags = HASHTAG.findall(body)
            if len(tags) > limit:
                out.append({"source": "exact", "category": "channel", "severity": severity,
                            "quote": f"{len(tags)} hashtags", "ref_code": code, "ref_text": text,
                            "reason": f"The post has {len(tags)} hashtags; {channel} allows {limit}. Remove {len(tags) - limit}.",
                            "suggestion": ""})
    return out


def run_exact(body: str, rules, facts, terms, today: date | None = None, channel: str = "") -> list[dict]:
    pattern_rules = [r for r in rules if (r.patterns or "").strip()]
    return (check_terms(body, terms) + check_rule_patterns(body, pattern_rules) + check_facts(body, facts, today)
            + check_channel(body, channel))
