"""One review run: exact checks -> AI checks -> verification -> saved findings + disclosure record.
Images attached to the draft are reviewed in the same run (engine/image.py), and any text inside them
goes through exactly the same checks as the draft's own text."""
import hashlib
import json
import re
from types import SimpleNamespace

from sqlalchemy.orm import Session

from .. import config
from ..models import Brand, Draft, DraftImage, Fact, Finding, ReviewRun, Rule, Term
from .ai import ai_review
from .exact import check_rule_patterns, check_terms, run_exact
from .image import analyse, image_text, parse_palette
from .verify import verify_ai_findings

# A finding a person has already ruled on is not raised again for the same passage.
SETTLED = ("disputed", "dismissed", "waived")

VISUAL_RULES = {
    "VIS-PALETTE": ("visual", "medium", "The main colours of an image should be brand colours, or neutrals (white, black, greys)."),
    "VIS-CONTRAST": ("accessibility", "medium", "Text in an image needs a contrast ratio of at least 4.5:1 with its background, "
                                                "or 3:1 for large text (WCAG 2.2 AA)."),
    "VIS-LOGO": ("visual", "medium", "Use the logo as supplied: the same proportions and colours, not cropped, rotated or "
                                     "crowded, and large enough to read."),
    "VIS-ALT": ("accessibility", "medium", "Every image needs a short description (alt text) for people who use screen readers."),
}


def clean_ai_text(text: str, pattern_rules, terms) -> str:
    """Put preferred terms into AI-written text, and return "" if it still breaks a pattern rule.
    A suggested fix that breaks a rule is worse than no suggestion."""
    if not text:
        return ""
    for t in check_terms(text, terms):
        text = re.sub(r"(?<![\w-])" + re.escape(t["quote"]) + r"(?![\w-])", t["suggestion"], text)
    return "" if check_rule_patterns(text, pattern_rules) else text


def repeats_exact(item: dict, exact: list, body: str) -> bool:
    a = body.find(item["quote"])
    for x in exact:
        if x["ref_code"] == item["ref_code"] and x["quote"] == item["quote"]:
            return True
        b = body.find(x["quote"])
        overlaps = a != -1 and b != -1 and a < b + len(x["quote"]) and b < a + len(item["quote"])
        if overlaps and x["category"] == item["category"]:
            return True
    return False


def review_text(piece, rules, facts, terms) -> tuple[list[dict], dict, int]:
    """Exact checks, then AI checks, then verification, on one piece of text (`piece.body`).
    Returns (findings, ai result, number of AI findings dropped by verification)."""
    body = piece.body
    # Channel limits (length, hashtags) apply to the post text, not to words inside an image.
    exact = run_exact(body, rules, facts, terms, channel=(piece.channel or "") if getattr(piece, "limits", True) else "")
    ai_rules = [r for r in rules if not (r.patterns or "").strip()]
    pattern_rules = [r for r in rules if (r.patterns or "").strip()]
    style = [f"{r.code} {r.title}: {r.text}" for r in pattern_rules]
    style += [f"Say \"{t.preferred}\", not \"{t.banned}\"." for t in terms]
    result = ai_review(piece, ai_rules, facts, exact, style)

    refs = {r.code: {"text": r.text, "category": r.category, "severity": r.severity} for r in ai_rules}
    refs.update({f.code: {"text": f"{f.statement} (Source: {f.source})", "category": "claims", "severity": "high"} for f in facts})
    kept, dropped = verify_ai_findings(result["findings"], body, refs)

    # AI rewrites for exact findings that had no ready-made fix.
    for rw in result["rewrites"]:
        try:
            target = exact[int(rw["index"])]
            suggestion = str(rw["suggestion"]).strip()
        except (KeyError, ValueError, TypeError, IndexError):
            continue
        sentence = target.get("_sentence")
        suggestion = clean_ai_text(suggestion, pattern_rules, terms)
        if sentence and suggestion and suggestion != sentence and not target["suggestion"] and sentence in body:
            target["quote"], target["suggestion"] = sentence, suggestion

    # The model's own fixes get the same treatment: preferred terms, and no fix that breaks a rule.
    for k in kept:
        k["suggestion"] = clean_ai_text(k.get("suggestion") or "", pattern_rules, terms)

    # Exact checks are the reliable source. Drop AI findings that repeat one: same rule, or the
    # same kind of issue on an overlapping passage.
    kept = [k for k in kept if not repeats_exact(k, exact, body)]
    for item in exact:
        item.pop("_sentence", None)
    return exact + kept, result, len(dropped)


def _visual(code: str, quote: str, reason: str, suggestion: str = "", ref_text: str = "", severity: str = "") -> dict:
    category, sev, text = VISUAL_RULES[code]
    return {"source": "exact", "category": category, "severity": severity or sev, "quote": quote, "ref_code": code,
            "ref_text": ref_text or text, "reason": reason, "suggestion": suggestion}


def image_findings(a: dict, alt_text: str, palette: list[str]) -> list[dict]:
    """Turn one image's measurements into findings. Pure code: the same measurements give the same findings."""
    out = []
    for c in a["colours"]:
        if c["off"]:
            out.append(_visual(
                "VIS-PALETTE", f"Colour {c['hex']} ({round(c['share'] * 100)}% of the image)",
                f"{c['hex']} covers {round(c['share'] * 100)}% of the image and is not close to any brand colour "
                f"(nearest is {c['nearest']}, colour difference {c['distance']}; under 25 looks like the same colour).",
                ref_text=f"{VISUAL_RULES['VIS-PALETTE'][2]} Brand colours: {', '.join(palette)}."))
    for ln in a["lines"]:
        c = ln.get("contrast")
        if c and not c["passes"]:
            out.append(_visual(
                "VIS-CONTRAST", f"Text in the image: \"{ln['text']}\"",
                f"The text ({c['text']}) on its background ({c['background']}) has a contrast ratio of {c['ratio']}:1; "
                f"{'large ' if c['large'] else ''}text needs at least {c['needed']}:1. Some readers will not be able to read it.",
                severity="high" if c["ratio"] < 2 else ""))
    lg = a.get("logo")
    if lg and lg["present"] and lg["issues"]:
        out.append(_visual(
            "VIS-LOGO", f"The logo in the image ({', '.join(lg['issues'])})",
            "The logo is used differently from the official file: " + ", ".join(lg["issues"]) + "."
            + (" Its shape and colours were measured against the brand's logo." if lg.get("measured") else "")))
    if not alt_text.strip():
        out.append(_visual(
            "VIS-ALT", "This image has no description",
            "Without a description, people using screen readers do not know what the image shows.",
            suggestion=a.get("description", "")))
    return out


def _analysis_key(img: DraftImage, brand: Brand | None, ai: bool) -> str:
    h = hashlib.sha256()
    h.update(img.data)
    h.update((brand.palette if brand else "").encode())
    h.update(hashlib.sha256(brand.logo).digest() if brand and brand.logo else b"")
    h.update(b"ai" if ai else b"code")
    h.update(b"v2")  # bump when the analysis gains new measurements (v2: where off-brand colours are)
    return h.hexdigest()


def review_images(db: Session, draft: Draft, rules, facts, terms) -> tuple[list[dict], list[str], int, int, bool]:
    """Findings from every image on the draft, plus notes for the disclosure record."""
    images = db.query(DraftImage).filter(DraftImage.draft_id == draft.id).order_by(DraftImage.id).all()
    if not images:
        return [], [], 0, 0, False
    brand = db.get(Brand, draft.brand_id)
    palette = parse_palette(brand.palette if brand else "")
    items, notes, ai_count, dropped, used = [], [], 0, 0, False
    for n, img in enumerate(images, 1):
        key = _analysis_key(img, brand, bool(config.AI_API_KEY))
        cached = json.loads(img.analysis) if img.analysis and img.analysed_key == key else None
        a = cached or analyse(img.data, img.mime, img.width, img.height, palette,
                              brand.logo if brand and brand.logo else None, brand.logo_type if brand else "")
        if not cached:
            img.analysis, img.analysed_key = json.dumps(a), (key if a["ai_used"] or not config.AI_API_KEY else "")
        used = used or a["ai_used"]
        found = image_findings(a, img.alt_text, palette)
        text = image_text(a)
        if text:
            piece = SimpleNamespace(body=text, purpose=draft.purpose, channel=draft.channel, audience=draft.audience, limits=False)
            from_text, result, d = review_text(piece, rules, facts, terms)
            dropped += d
            ai_count += sum(1 for f in from_text if f["source"] == "ai")
            for f in from_text:
                f["reason"] = f"In image {n}: {f['reason']}"
            found += from_text
            if result["used"]:
                notes.append(f"Text read from image {n} was checked like the draft text.")
        for f in found:
            f["image_id"] = img.id
        items += found
        notes.append(f"Image {n}: {a['note'] or 'colours and description checked in code.'}")
    return items, notes, ai_count, dropped, used


def run_review(db: Session, draft: Draft) -> ReviewRun:
    # Only this draft's brand: its approved rules, its facts, its terms.
    b = draft.brand_id
    rules = db.query(Rule).filter(Rule.brand_id == b, Rule.status == "approved").order_by(Rule.code).all()
    facts = db.query(Fact).filter(Fact.brand_id == b).order_by(Fact.code).all()
    terms = db.query(Term).filter(Term.brand_id == b).all()

    items, result, dropped = review_text(draft, rules, facts, terms)
    from_images, notes, image_ai, image_dropped, vision_used = review_images(db, draft, rules, facts, terms)

    settled = {(f.quote, f.ref_code) for f in db.query(Finding).filter(Finding.draft_id == draft.id, Finding.status.in_(SETTLED))}
    db.query(Finding).filter(Finding.draft_id == draft.id, Finding.status == "open").delete()
    for item in items + from_images:
        if (item["quote"], item["ref_code"]) in settled:
            continue
        db.add(Finding(draft_id=draft.id, version=draft.version, **item))

    used = result["used"] or vision_used
    all_items = items + from_images
    run = ReviewRun(
        draft_id=draft.id, version=draft.version,
        ai_used=used,
        ai_provider=config.AI_PROVIDER_NAME if used else "",
        ai_model=config.AI_MODEL + (f" + {config.VISION_MODEL} (images)" if vision_used else "") if used else "",
        ai_note=" ".join([result["note"]] + notes),
        exact_count=sum(1 for f in all_items if f["source"] == "exact"),
        ai_count=sum(1 for f in all_items if f["source"] == "ai"),
        dropped_count=dropped + image_dropped,
    )
    db.add(run)
    draft.checked_version = draft.version
    db.commit()
    return run
