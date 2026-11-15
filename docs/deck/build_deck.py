"""Builds the Round 2 submission deck (BrandGuard AI, Nova Blasters) in the style of the Round 1 plan.

Run:  python docs/deck/build_deck.py   ->  docs/deck/BrandGuard AI - Round 2 Build.pptx
Then export to PDF with PowerPoint (docs/deck/export_pdf.ps1).
"""
import os

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Pt
from pptx.oxml.ns import qn
from lxml import etree

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "BrandGuard AI - Round 2 Build.pptx")

# Round 1 palette, sampled from the plan PDF.
NAVY = RGBColor(0x16, 0x20, 0x2E)
NAVY_CARD = RGBColor(0x22, 0x2D, 0x3E)
CREAM = RGBColor(0xF6, 0xF4, 0xEC)
CARD = RGBColor(0xFF, 0xFD, 0xF7)
LINE = RGBColor(0xE4, 0xE0, 0xD3)
RUST = RGBColor(0xB4, 0x43, 0x1A)       # overline labels on light slides
PEACH = RGBColor(0xE8, 0x91, 0x5E)      # overline labels and highlights on dark slides
BODY = RGBColor(0x3D, 0x47, 0x56)
MUTED = RGBColor(0x7A, 0x80, 0x8A)
ON_DARK = RGBColor(0xF7, 0xF4, 0xEC)
ON_DARK_MUTED = RGBColor(0xB9, 0xBF, 0xC9)

SERIF = "Georgia"
SANS = "Segoe UI"

W, H = 1440, 810  # points, the same page as the Round 1 PDF
M = 64            # side margin

prs = Presentation()
prs.slide_width, prs.slide_height = Pt(W), Pt(H)
BLANK = prs.slide_layouts[6]
page = [0]


def box(slide, x, y, w, h, fill=None, line=None, shape=MSO_SHAPE.RECTANGLE, radius=None, name=None):
    s = slide.shapes.add_shape(shape, Pt(x), Pt(y), Pt(w), Pt(h))
    if radius is not None:
        s.adjustments[0] = radius
    if fill is None:
        s.fill.background()
    else:
        s.fill.solid()
        s.fill.fore_color.rgb = fill
    if line is None:
        s.line.fill.background()
    else:
        s.line.color.rgb = line
        s.line.width = Pt(1)
    s.shadow.inherit = False
    if name:
        s.name = name
    return s


def text(slide, x, y, w, h, runs, size=21, color=BODY, font=SANS, bold=False, align=PP_ALIGN.LEFT,
         anchor=MSO_ANCHOR.TOP, spacing=None, after=0, name=None):
    """`runs`: a string, or a list of paragraphs; each paragraph is a string or a list of
    (text, {size, color, font, bold}) pieces."""
    tb = slide.shapes.add_textbox(Pt(x), Pt(y), Pt(w), Pt(h))
    if name:
        tb.name = name
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    paras = runs if isinstance(runs, list) else [runs]
    for i, para in enumerate(paras):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        if spacing:
            p.line_spacing = spacing
        p.space_after = Pt(after)
        pieces = para if isinstance(para, list) else [(para, {})]
        for t, opt in pieces:
            r = p.add_run()
            r.text = t
            f = r.font
            f.name = opt.get("font", font)
            f.size = Pt(opt.get("size", size))
            f.bold = opt.get("bold", bold)
            f.color.rgb = opt.get("color", color)
    return tb


def frame(dark=False, section=None, title=None):
    slide = prs.slides.add_slide(BLANK)
    page[0] += 1
    bg = slide.background.fill
    bg.solid()
    bg.fore_color.rgb = NAVY if dark else CREAM
    if section:
        text(slide, M, 62, W - 2 * M, 24, section.upper(), size=17, color=PEACH if dark else RUST, bold=True, name="Section")
    if title:
        text(slide, M, 92, W - 2 * M, 70, title, size=46, color=ON_DARK if dark else NAVY, font=SERIF, name="Title")
    if page[0] > 1:
        foot = ON_DARK_MUTED if dark else MUTED
        text(slide, M, H - 54, 600, 20, "BrandGuard AI · Round 2 build", size=14, color=foot, name="Footer")
        text(slide, W - M - 100, H - 54, 100, 20, str(page[0]), size=14, color=foot, align=PP_ALIGN.RIGHT, name="Page")
    return slide


def card(slide, x, y, w, h, kicker=None, heading=None, body=None, dark=False, inverse=False, body_size=18):
    fill = NAVY if inverse else (NAVY_CARD if dark else CARD)
    box(slide, x, y, w, h, fill=fill, line=None if (dark or inverse) else LINE,
        shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.04)
    on = ON_DARK if (dark or inverse) else NAVY
    sub = ON_DARK_MUTED if (dark or inverse) else BODY
    cy = y + 24
    if kicker:
        text(slide, x + 24, cy, w - 48, 20, kicker.upper(), size=14, color=PEACH if (dark or inverse) else RUST, bold=True)
        cy += 28
    if heading:
        text(slide, x + 24, cy, w - 48, 34, heading, size=24, color=on, font=SERIF)
        cy += 42
    if body:
        text(slide, x + 24, cy, w - 48, y + h - cy - 16, body, size=body_size, color=sub, spacing=1.1)


def table(slide, x, y, widths, rows, size=18, row_h=40, header_h=40, bold_first=False):
    """Navy header row, thin rules between rows, as in the Round 1 plan."""
    total = sum(widths)
    box(slide, x, y, total, header_h, fill=NAVY)
    cx = x
    for wcol, head in zip(widths, rows[0]):
        text(slide, cx + 12, y, wcol - 24, header_h, head, size=size, color=ON_DARK, bold=True, anchor=MSO_ANCHOR.MIDDLE)
        cx += wcol
    cy = y + header_h
    for row in rows[1:]:
        h = row_h
        cx = x
        for i, (wcol, cell) in enumerate(zip(widths, row)):
            text(slide, cx + 12, cy, wcol - 24, h, cell, size=size, color=NAVY if (i == 0 and bold_first) else BODY,
                 bold=(i == 0 and bold_first), anchor=MSO_ANCHOR.MIDDLE, spacing=1.0)
            cx += wcol
        cy += h
        box(slide, x, cy - 0.5, total, 1, fill=LINE)
    return cy


def bullets(slide, x, y, w, h, items, size=18, color=BODY, dark=False):
    tb = slide.shapes.add_textbox(Pt(x), Pt(y), Pt(w), Pt(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(9)
        p.line_spacing = 1.08
        pPr = p._p.get_or_add_pPr()
        pPr.set("marL", str(Pt(22)))
        pPr.set("indent", str(-Pt(22)))
        clr = etree.SubElement(pPr, qn("a:buClr"))
        etree.SubElement(clr, qn("a:srgbClr")).set("val", str(PEACH if dark else RUST))
        etree.SubElement(pPr, qn("a:buFont")).set("typeface", "Arial")
        etree.SubElement(pPr, qn("a:buChar")).set("char", "•")
        r2 = p.add_run()
        r2.text = item
        r2.font.size, r2.font.name = Pt(size), SANS
        r2.font.color.rgb = ON_DARK_MUTED if dark else color
    return tb


def arrow(slide, x, y, color=RUST):
    s = box(slide, x, y, 22, 16, fill=color, shape=MSO_SHAPE.RIGHT_ARROW)
    return s


# 1 -- Title --------------------------------------------------------------------------------------
s = frame(dark=True)
text(s, M, 62, 600, 24, "ROUND 2 · THE BUILD", size=17, color=PEACH, bold=True)
text(s, M, 250, 900, 120, "BrandGuard AI", size=96, color=ON_DARK, font=SERIF)
text(s, M, 390, 820, 90, "A working review desk: every draft is checked against the brand's own approved rules and "
     "facts, and people make every decision.", size=26, color=ON_DARK_MUTED, spacing=1.15)
box(s, 1014, 0, 2, 420, fill=PEACH)
box(s, 1001, 420, 28, 28, fill=PEACH, shape=MSO_SHAPE.DIAMOND)
text(s, M, H - 80, 600, 24, "Nova Blasters · CodeNova India 2026", size=18, color=ON_DARK_MUTED)

# 2 -- What we built ------------------------------------------------------------------------------
s = frame(section="01 · What we built", title="One library, one review desk, one insights page, live")
text(s, M, 178, W - 2 * M, 60, "The Round 1 plan, built end to end and deployed. Content goes in, every issue comes back with the "
     "passage, the rule it breaks and a fix, and only people approve.", size=21, spacing=1.15)
cw = (W - 2 * M - 48) / 3
for i, (k, h, b) in enumerate([
    ("The sources", "Brand Library", "Rules with optional exact patterns, approved facts with a source and expiry date, banned and "
     "preferred terms. Paste guidelines to get proposed rules; nothing counts until the brand owner approves it."),
    ("The check", "Review Desk", "Exact checks in code plus AI judgement checks. Each finding quotes the passage, cites the rule or "
     "fact, explains why and suggests a fix. Creators accept, rewrite or dispute; reviewers decide."),
    ("The learning", "Brand health", "Most-broken rules, findings per channel, the split by risk, what happened to every finding and "
     "the average time to approval, from the review record."),
]):
    card(s, M + i * (cw + 24), 270, cw, 300, kicker=k, heading=h, body=b)
box(s, M, 600, W - 2 * M, 96, fill=NAVY, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.08)
text(s, M + 28, 600, 260, 96, "PRIVATE BRANDS", size=15, color=PEACH, bold=True, anchor=MSO_ANCHOR.MIDDLE)
text(s, M + 290, 600, W - 2 * M - 320, 96, "Every brand is a private workspace with its own team, library and drafts. Visitors get "
     "a private copy of a demo brand; organisations create their own.", size=19, color=ON_DARK, anchor=MSO_ANCHOR.MIDDLE, spacing=1.1)

# 3 -- Try it in two minutes ----------------------------------------------------------------------
s = frame(section="02 · Try it", title="Two demo brands, opposite styles, two minutes")
text(s, M, 178, W - 2 * M, 60, "On the sign-in page choose Try the demo, pick a brand and a person. You get your own private copy, "
     "so nothing you do affects anyone else. Switch person with Act as; compare brands with one click.", size=21, spacing=1.15)
half = (W - 2 * M - 32) / 2
card(s, M, 270, half, 250, kicker="Payroll software", heading="Lumio Payroll",
     body="Calm, plain and careful. No hype or pressure, one exclamation mark at most, every number backed by an approved fact. "
          "13 drafts at every stage. Asha writes, Rohan manages, Meera owns the brand.")
card(s, M + half + 32, 270, half, 250, kicker="Soft drinks", heading="Fizzbox", inverse=True,
     body="Loud, playful and full of hype: “Grab yours NOW!” is on-brand. Health claims, anything aimed at children and wrong "
          "sugar or calorie numbers are high-risk. 11 drafts. Kabir, Tara and Neel.")
steps = [("Asha", "Open the LinkedIn post: accept a fix, dispute one, send for review"),
         ("Rohan", "Approve with a high-risk finding open: it escalates"),
         ("Meera", "Waive with a reason, hold to approve, open the signed record"),
         ("Compare", "Paste the same hype into Fizzbox: different findings")]
sw = (W - 2 * M - 3 * 40) / 4
for i, (who, what) in enumerate(steps):
    x = M + i * (sw + 40)
    box(s, x, 552, sw, 130, fill=CARD, line=LINE, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.06)
    text(s, x + 20, 568, sw - 40, 24, f"{i + 1} · {who}", size=17, color=RUST, bold=True)
    text(s, x + 20, 598, sw - 40, 80, what, size=17, color=NAVY, spacing=1.08)
    if i < 3:
        arrow(s, x + sw + 9, 609)

# 4 -- Completed features (1 of 2) ----------------------------------------------------------------
s = frame(section="03 · Completed features", title="Reviewing content: what is finished and working")
col = (W - 2 * M - 32) / 2
card(s, M, 190, col, 500, heading="Checks and findings", body_size=18)
bullets(s, M + 24, 250, col - 48, 430, [
    "Paste content, or upload .txt, .md, .docx or .pdf",
    "Exact checks in code: banned terms, rule patterns, numbers against approved facts, expired facts",
    "AI checks for tone, messaging, competitors and unsupported claims",
    "No citation, no finding: unverifiable AI findings are dropped and counted",
    "Each finding: passage, rule or fact, reason, severity, suggested fix",
    "Fixes are cleaned so they never break another rule",
    "Checks while typing, before anything is saved",
    "“How this was checked” on every review: model, what was sent, what was dropped",
])
card(s, M + col + 32, 190, col, 500, heading="Workflow and record", body_size=18)
bullets(s, M + col + 56, 250, col - 48, 430, [
    "Accept a fix, write your own, or dispute; every change is a new version",
    "Draft → In review → Changes requested / Authorised review → Approved and locked",
    "High-risk findings escalate to the brand owner: waive with a reason or decide the dispute",
    "Four eyes: nobody approves, waives or decides on their own draft",
    "Hold to confirm, with an Undo countdown, for approvals and waivers",
    "Compare any two versions word by word",
    "Printable review record with every decision, the timeline and signatures",
    "Comments, version history and an append-only audit log",
])

# 5 -- Completed features (2 of 2) ----------------------------------------------------------------
s = frame(section="03 · Completed features", title="Brands, teams and insight")
cw = (W - 2 * M - 48) / 3
groups = [
    ("Brands and teams", ["Sign up creates a private brand with a starter library",
                          "Owners add teammates, change roles and remove people",
                          "Every API route checks the brand; other brands' records do not exist for you",
                          "Account page with password change"]),
    ("Brand Library and insight", ["Rules, facts with expiry, terms; edited by the brand owner only",
                                   "Guideline import proposes rules for approval",
                                   "Brand health: most broken rules, findings per channel, risk split, outcomes, time to approval",
                                   "Waiting-for-you count and drafts ordered by what needs you"]),
    ("Demo and everyday use", ["Private demo copy per visitor, ready in seconds",
                               "Switch person or brand without signing out; start over any time",
                               "Two contrasting demo brands, 24 drafts at every stage",
                               "Phone-friendly layout; calm motion that switches off for reduced-motion settings"]),
]
for i, (h, items) in enumerate(groups):
    x = M + i * (cw + 24)
    card(s, x, 190, cw, 420, heading=h)
    bullets(s, x + 24, 250, cw - 48, 350, items, size=20)

# 6 -- How a review runs (dark) -------------------------------------------------------------------
s = frame(dark=True, section="04 · How it works", title="Findings people can trust")
text(s, M, 178, W - 2 * M, 60, "One wrong finding teaches people to ignore all of them, so every review runs through five steps. "
     "The AI never approves, waives or publishes.", size=21, color=ON_DARK_MUTED, spacing=1.15)
steps = [("1. Code first", "Terms, patterns, numbers against facts and expired facts are checked in code, the same every time."),
         ("2. Narrow input", "The AI sees the draft, its purpose, up to 12 relevant rules, the facts and what code already found."),
         ("3. Verify", "An AI finding is dropped unless its quote is in the draft and its rule or fact exists."),
         ("4. Clean fixes", "Suggested fixes get the brand's preferred terms and are dropped if they still break a rule."),
         ("5. Disclose", "Each review records exact and AI findings, the model, what was sent and what was dropped.")]
sw = (W - 2 * M - 4 * 36) / 5
for i, (h, b) in enumerate(steps):
    x = M + i * (sw + 36)
    hi = i == 2
    box(s, x, 280, sw, 250, fill=CARD if hi else NAVY_CARD, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.05)
    text(s, x + 20, 304, sw - 40, 60, h, size=23, color=RUST if hi else ON_DARK, font=SERIF)
    text(s, x + 20, 352, sw - 40, 170, b, size=18, color=BODY if hi else ON_DARK_MUTED, spacing=1.1)
    if i < 4:
        arrow(s, x + sw + 7, 397, color=PEACH)
text(s, M, 576, W - 2 * M, 80, [[("If the AI is down or rate-limited, ", {"color": ON_DARK, "bold": True}),
                                 ("the request waits and retries, then the exact checks still run and the review says that the AI "
                                  "step was skipped and why.", {})]], size=19, color=ON_DARK_MUTED, spacing=1.15)

# 7 -- Technology ---------------------------------------------------------------------------------
s = frame(section="05 · Technology", title="A free stack, all live")
end = table(s, M, 186, [230, 520, 562], [
    ["Layer", "Choice", "Why"],
    ["Frontend", "React 19, Vite, Tailwind CSS 4, React Router 7", "Fast to build accessible, responsive screens"],
    ["Backend", "Python 3.14, FastAPI, SQLAlchemy 2", "Same language as the review engine"],
    ["Database", "PostgreSQL on Supabase (SQLite locally)", "Free managed Postgres; brand checks in every route"],
    ["AI model", "Groq API, openai/gpt-oss-120b, JSON mode, temperature 0", "Fast, capable and free for a live demo"],
    ["Documents", "python-docx, pypdf", "Word and PDF content in"],
    ["Hosting", "Vercel (frontend), Render (backend)", "A live link for judges at no cost"],
    ["Quality", "39 automated tests (pytest); a scheduled keep-awake ping", "Every change is tested; the demo stays awake by day"],
], size=18, row_h=46, bold_first=True)
text(s, M, end + 26, W - 2 * M, 60, "Every tool is open source or on a free plan. The AI receives only the draft, its channel, "
     "audience and purpose, and the brand rules and facts selected for it; no names or emails.", size=19, spacing=1.15)

# 8 -- Technically hard parts ---------------------------------------------------------------------
s = frame(section="05 · Technology", title="What was technically hard")
cw = (W - 2 * M - 48) / 3
for i, (k, h, b) in enumerate([
    ("Trust", "Findings that cannot be invented",
     "Verification against the draft and the library, fixes re-checked against every pattern rule, and exact findings never "
     "repeated by the AI. A failed or rate-limited AI call falls back to exact checks and says why."),
    ("Isolation", "Private brands and demo copies",
     "A whole brand (people, library, drafts, findings, versions, comments, history) is copied with every link remapped in about "
     "a second, without new AI calls. The demo template itself is read-only."),
    ("Live data", "Safe upgrades on a live database",
     "Brands, teams and soft deletes were added to a live Postgres database in place, without losing data or locking tables, "
     "and approvals lock the draft's row so two reviewers cannot both act at once."),
]):
    card(s, M + i * (cw + 24), 200, cw, 360, kicker=k, heading=h, body=b, body_size=21)

# 9 -- Same text, different rules -----------------------------------------------------------------
s = frame(section="06 · Rules come from the brand", title="Same sentence, two brands, different findings")
text(s, M, 178, W - 2 * M, 40, [[("Draft:  ", {"color": RUST, "bold": True}),
                                 ("“Big news!! Grab yours NOW. Our healthy new drink is here for our customers.”",
                                  {"font": SERIF, "color": NAVY, "size": 24})]], size=21)
table(s, M, 250, [430, 441, 441], [
    ["Passage", "Lumio Payroll (calm, careful)", "Fizzbox (loud, playful)"],
    ["“Big news!!”", "Flagged: one exclamation mark at most", "Fine: on-brand"],
    ["“Grab yours NOW”", "AI checks it against “no pressure tactics”", "Fine: short calls to action are welcome"],
    ["“healthy”", "Not a rule for payroll", "High risk: no health claims"],
    ["“customers”", "Preferred term", "Say “fans”"],
    ["“THIS IS THE BEST SUMMER EVER”", "Flagged: no shouting", "Flagged: capitals only for short calls to action"],
], size=18, row_h=52)
text(s, M, 620, W - 2 * M, 60, "Nothing is hard-coded per brand: the engine reads each brand's own library. This is checked by an "
     "automated test that runs the same text through both brands.", size=19, spacing=1.15)

# 10 -- Changes from Round 1 ----------------------------------------------------------------------
s = frame(section="07 · Changes from the Round 1 plan", title="What changed, and why")
table(s, M, 178, [300, 420, 592], [
    ["Round 1 plan", "What we built", "Why"],
    ["Open-weight model on our own server", "Groq API (gpt-oss-120b)", "No free server runs a capable model fast enough. Drafts now go "
     "to Groq, so “drafts stay in-house” no longer holds; every review discloses what was sent"],
    ["pgvector and embeddings for rule search", "Word-overlap selection of up to 12 rules", "Libraries are small; search added cost without changing results"],
    ["Supabase login, roles in the database", "Own sign-in tokens, roles checked in every route", "Simpler to build and test; Supabase is the database only"],
    ["Logo, palette, Pillow and OCR", "Moved to Round 3", "They belong to image review"],
    ["About 40 scored test drafts", "39 automated tests; scored set in Round 3", "Part of measured reliability"],
    ["Confidence scores", "Not built", "Findings are verified or dropped instead"],
], size=17, row_h=58, bold_first=True)
box(s, M, 640, W - 2 * M, 64, fill=NAVY, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.12)
text(s, M + 24, 640, W - 2 * M - 48, 64, [[("Added beyond the plan:  ", {"color": PEACH, "bold": True}),
     ("private brands with teams, demo copies, a second demo brand, checks while typing, version compare, signed review record, "
      "four-eyes rule, and Brand health (an early part of Insights).", {"color": ON_DARK})]], size=17, anchor=MSO_ANCHOR.MIDDLE, spacing=1.05)

# 11 -- Testing and limits ------------------------------------------------------------------------
s = frame(section="08 · Testing and known limits", title="What is tested, and what does not work yet")
col = (W - 2 * M - 32) / 2
card(s, M, 190, col, 440, kicker="Tested", heading="How we know it works")
bullets(s, M + 24, 292, col - 48, 330, [
    "39 automated tests: sign-in, exact engine, AI path with a fake model and rate limits, full workflow, Brand health, checks "
    "while typing, brand isolation, teams, account basics, demo copies",
    "Main flows tried on the live site in both demo brands: checking, fixing, escalation, waiver, approval, switching people "
    "and brands",
    "Layout checked at phone width; reduced-motion settings respected",
], size=19)
card(s, M + col + 32, 190, col, 440, kicker="Not yet", heading="Known limits")
bullets(s, M + col + 56, 292, col - 48, 330, [
    "The free server sleeps overnight; the first visit can take 30 to 60 seconds",
    "A new demo copy takes about 5 seconds on the live site",
    "Images are not checked yet: text, .docx and .pdf only",
    "AI uses Groq's free tier; if it is busy, only exact checks run and the review says so",
    "No email: no invitations or password reset links",
    "Demo copies are removed after 24 hours",
], size=19)

# 12 -- Round 3 (dark) ----------------------------------------------------------------------------
s = frame(dark=True, section="09 · Round 3", title="Three improvements we will deliver")
cw = (W - 2 * M - 48) / 3
for i, (h, what, change) in enumerate([
    ("Image review",
     "Check images and visual assets: palette and contrast, logo use, text inside images through the same rules, and missing "
     "image descriptions.",
     "Visual mistakes are caught before publishing, with the same quote, rule and fix as text."),
    ("Guideline-gap insights",
     "Rules that reviewers keep dismissing or waiving are reported as unclear, with the disputed examples attached and a "
     "suggested rewrite to approve.",
     "Brand owners fix the guidelines that confuse writers, not just one draft at a time."),
    ("Measured reliability",
     "A scored set of about 40 drafts with seeded errors for both demo brands, run on every change, reported in the product.",
     "Teams see how far they can trust the checks, and any change that makes them worse is caught."),
]):
    x = M + i * (cw + 24)
    box(s, x, 190, cw, 480, fill=NAVY_CARD, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.04)
    text(s, x + 24, 214, cw - 48, 30, f"0{i + 1}", size=30, color=PEACH, font=SERIF)
    text(s, x + 24, 262, cw - 48, 40, h, size=26, color=ON_DARK, font=SERIF)
    text(s, x + 24, 312, cw - 48, 180, what, size=18, color=ON_DARK_MUTED, spacing=1.12)
    text(s, x + 24, 500, cw - 48, 24, "WHAT IT CHANGES", size=14, color=PEACH, bold=True)
    text(s, x + 24, 528, cw - 48, 130, change, size=18, color=ON_DARK, spacing=1.12)

# 13 -- Team (dark) -------------------------------------------------------------------------------
s = frame(dark=True, section="10 · Team and participant details", title="Nova Blasters")
team = [("Tanmoy Ghosh", "Team Leader, UI/UX Designer", "Plans and coordinates; designs flows, wireframes and the visual system."),
        ("Deepanjan Mandal", "Frontend Developer", "Review workspace, findings view and dashboard in React."),
        ("Auritras Maitra", "Backend Developer", "Python API, roles, workflow engine, audit logs and storage."),
        ("Sohom Koley", "Frontend Developer", "Upload flow, comments and approval screens, accessibility."),
        ("Deepanjan Panda", "Research and Analysis", "Interviews, content audit, survey, test feedback, impact analysis."),
        ("Sounavo Majumder", "ML", "Review pipeline, claim and tone checks, AI verification.")]
cw = (W - 2 * M - 48) / 3
for i, (name, role, does) in enumerate(team):
    x = M + (i % 3) * (cw + 24)
    y = 196 + (i // 3) * 230
    box(s, x, y, cw, 206, fill=NAVY_CARD, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.05)
    text(s, x + 24, y + 24, cw - 48, 34, name, size=26, color=ON_DARK, font=SERIF)
    text(s, x + 24, y + 64, cw - 48, 24, role, size=17, color=PEACH, bold=True)
    text(s, x + 24, y + 98, cw - 48, 100, does, size=17, color=ON_DARK_MUTED, spacing=1.12)
text(s, M, 670, W - 2 * M, 40, "Built with Claude Code (Anthropic) as a coding assistant; every change was reviewed and tested by "
     "the team. All demo brands and their content are fictional.", size=16, color=ON_DARK_MUTED)

prs.save(OUT)
print("saved", OUT, "slides:", len(prs.slides))
