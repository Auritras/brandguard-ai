"""Builds the Round 3 final product deck (BrandGuard AI, Nova Blasters) in the style of the Round 1 and 2 decks.

Run:  python docs/deck/build_round3.py   ->  docs/deck/BrandGuard AI - Round 3 Final Product.pptx
Then export to PDF with PowerPoint (docs/deck/export_pdf.ps1 "BrandGuard AI - Round 3 Final Product").
Scores are read from backend/evals/results, so the deck always shows the latest committed runs.
Screenshots in docs/deck/round3 were taken from the live site on 21 November 2026.
"""
import json
import os

from lxml import etree
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Pt

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, "round3")
RESULTS = os.path.join(HERE, "..", "..", "backend", "evals", "results")
OUT = os.path.join(HERE, "BrandGuard AI - Round 3 Final Product.pptx")

# The Round 1 and 2 palette.
NAVY = RGBColor(0x16, 0x20, 0x2E)
NAVY_CARD = RGBColor(0x22, 0x2D, 0x3E)
CREAM = RGBColor(0xF6, 0xF4, 0xEC)
CARD = RGBColor(0xFF, 0xFD, 0xF7)
LINE = RGBColor(0xE4, 0xE0, 0xD3)
RUST = RGBColor(0xB4, 0x43, 0x1A)
PEACH = RGBColor(0xE8, 0x91, 0x5E)
BODY = RGBColor(0x3D, 0x47, 0x56)
MUTED = RGBColor(0x7A, 0x80, 0x8A)
ON_DARK = RGBColor(0xF7, 0xF4, 0xEC)
ON_DARK_MUTED = RGBColor(0xB9, 0xBF, 0xC9)
GREEN = RGBColor(0x2C, 0x7A, 0x4B)

SERIF = "Georgia"
SANS = "Segoe UI"
W, H = 1440, 810
M = 64

# ---- scores from the committed evaluation runs ----
exact = {b["brand"]: b for b in json.load(open(os.path.join(RESULTS, "exact.json"), encoding="utf-8"))["brands"]}
ai_run = json.load(open(os.path.join(RESULTS, "ai.json"), encoding="utf-8"))
ai = {b["brand"]: b for b in ai_run["brands"]}
ex_caught = sum(b["caught"] for b in exact.values())
ex_planted = sum(b["planted"] for b in exact.values())
ai_caught = sum(b["caught"] for b in ai.values())
ai_planted = sum(b["planted"] for b in ai.values())
cases = sum(b["drafts"] for b in exact.values())


def pct(x):
    return f"{x:.1f}%".replace(".0%", "%")


prs = Presentation()
prs.slide_width, prs.slide_height = Pt(W), Pt(H)
BLANK = prs.slide_layouts[6]
page = [0]


def box(slide, x, y, w, h, fill=None, line=None, shape=MSO_SHAPE.RECTANGLE, radius=None, width=1):
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
        s.line.width = Pt(width)
    s.shadow.inherit = False
    return s


def text(slide, x, y, w, h, runs, size=21, color=BODY, font=SANS, bold=False, align=PP_ALIGN.LEFT,
         anchor=MSO_ANCHOR.TOP, spacing=None, after=0):
    tb = slide.shapes.add_textbox(Pt(x), Pt(y), Pt(w), Pt(h))
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
        text(slide, M, 56, W - 2 * M, 24, section.upper(), size=17, color=PEACH if dark else RUST, bold=True)
    if title:
        text(slide, M, 84, W - 2 * M, 64, title, size=44, color=ON_DARK if dark else NAVY, font=SERIF)
    if page[0] > 1:
        foot = ON_DARK_MUTED if dark else MUTED
        text(slide, M, H - 46, 700, 20, "BrandGuard AI · Round 3 final product", size=14, color=foot)
        text(slide, W - M - 100, H - 46, 100, 20, str(page[0]), size=14, color=foot, align=PP_ALIGN.RIGHT)
    return slide


def card(slide, x, y, w, h, kicker=None, heading=None, body=None, dark=False, inverse=False, body_size=18):
    fill = NAVY if inverse else (NAVY_CARD if dark else CARD)
    box(slide, x, y, w, h, fill=fill, line=None if (dark or inverse) else LINE, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.04)
    on = ON_DARK if (dark or inverse) else NAVY
    sub = ON_DARK_MUTED if (dark or inverse) else BODY
    cy = y + 22
    if kicker:
        text(slide, x + 24, cy, w - 48, 20, kicker.upper(), size=14, color=PEACH if (dark or inverse) else RUST, bold=True)
        cy += 28
    if heading:
        text(slide, x + 24, cy, w - 48, 34, heading, size=24, color=on, font=SERIF)
        cy += 42
    if body:
        text(slide, x + 24, cy, w - 48, y + h - cy - 14, body, size=body_size, color=sub, spacing=1.1)
    return cy


def table(slide, x, y, widths, rows, size=17, row_h=40, header_h=38, bold_first=False, colors=None):
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
            col = (colors or {}).get(i)
            text(slide, cx + 12, cy, wcol - 24, h, cell, size=size,
                 color=col or (NAVY if (i == 0 and bold_first) else BODY),
                 bold=(i == 0 and bold_first) or bool(col), anchor=MSO_ANCHOR.MIDDLE, spacing=1.0)
            cx += wcol
        cy += h
        box(slide, x, cy - 0.5, total, 1, fill=LINE)
    return cy


def bullets(slide, x, y, w, h, items, size=18, color=BODY, dark=False, after=8):
    tb = slide.shapes.add_textbox(Pt(x), Pt(y), Pt(w), Pt(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(after)
        p.line_spacing = 1.06
        pPr = p._p.get_or_add_pPr()
        pPr.set("marL", str(Pt(22)))
        pPr.set("indent", str(-Pt(22)))
        clr = etree.SubElement(pPr, qn("a:buClr"))
        etree.SubElement(clr, qn("a:srgbClr")).set("val", str(PEACH if dark else RUST))
        etree.SubElement(pPr, qn("a:buFont")).set("typeface", "Arial")
        etree.SubElement(pPr, qn("a:buChar")).set("char", "•")
        pieces = item if isinstance(item, list) else [(item, {})]
        for t, opt in pieces:
            r = p.add_run()
            r.text = t
            r.font.size, r.font.name = Pt(size), SANS
            r.font.bold = opt.get("bold", False)
            r.font.color.rgb = opt.get("color", ON_DARK_MUTED if dark else color)
    return tb


def arrow(slide, x, y, color=RUST):
    return box(slide, x, y, 22, 16, fill=color, shape=MSO_SHAPE.RIGHT_ARROW)


def shot(slide, name, x, y, w=None, h=None, crop_bottom=0.0):
    """A screenshot with a navy frame and a hard shadow, like the product's own cards."""
    from PIL import Image
    path = os.path.join(IMG, name + ".jpg")
    iw, ih = Image.open(path).size
    ratio = ih * (1 - crop_bottom) / iw
    if w is None:
        w = h / ratio
    h = w * ratio
    box(slide, x + 6, y + 6, w, h, fill=NAVY, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.015)
    pic = slide.shapes.add_picture(path, Pt(x), Pt(y), width=Pt(w), height=Pt(h))
    pic.crop_bottom = crop_bottom
    pic.line.color.rgb = NAVY
    pic.line.width = Pt(1.5)
    return y + h


def bold(t):
    return (t, {"bold": True, "color": NAVY})


# 1 -- Title ------------------------------------------------------------------------------------
s = frame(dark=True)
text(s, M, 62, 700, 24, "ROUND 3 · THE FINAL PRODUCT", size=17, color=PEACH, bold=True)
text(s, M, 220, 900, 120, "BrandGuard AI", size=96, color=ON_DARK, font=SERIF)
text(s, M, 360, 860, 100, "Checks every post, email, document and image against a brand's own rules and approved facts "
     "before it goes out. People make the final call.", size=26, color=ON_DARK_MUTED, spacing=1.15)
box(s, 1014, 0, 2, 420, fill=PEACH)
box(s, 1001, 420, 28, 28, fill=PEACH, shape=MSO_SHAPE.DIAMOND)
stats = [(f"{ex_caught}/{ex_planted}", "planted problems caught by the exact checks, every push"),
         (f"{ai_caught}/{ai_planted}", "caught by the full check with AI, latest run"),
         (str(cases), "public test drafts, scored automatically")]
for i, (n, label) in enumerate(stats):
    x = M + i * 300
    text(s, x, 510, 280, 50, n, size=40, color=PEACH, font=SERIF)
    text(s, x, 562, 260, 60, label, size=16, color=ON_DARK_MUTED, spacing=1.1)
text(s, M, H - 104, 1100, 24, [[("Live  ", {"color": PEACH, "bold": True}), ("brandguard-ai-lac.vercel.app", {"color": ON_DARK}),
                                ("      Code  ", {"color": PEACH, "bold": True}), ("github.com/Auritras/brandguard-ai", {"color": ON_DARK})]], size=18)
text(s, M, H - 70, 700, 24, "Nova Blasters · CodeNova India 2026", size=18, color=ON_DARK_MUTED)

# 2 -- The idea, on the sign-in page ------------------------------------------------------------
s = frame(section="01 · The idea", title="Same words. Two brands. Different verdicts.")
bottom = shot(s, "signin", M, 172, w=760, crop_bottom=0.0)
x2 = M + 760 + 44
text(s, x2, 172, W - M - x2, 200, "Small teams publish every day across LinkedIn, Instagram, email and ads, usually without a brand "
     "or compliance reviewer. The mistakes are ordinary: an old product name, a figure nobody approved, “#1” with nothing behind "
     "it, text on an image nobody can read.", size=19, spacing=1.15)
text(s, x2, 380, W - M - x2, 200, [[bold("Generic writing tools cannot catch these, "), ("because “right” depends on the brand. "
     "BrandGuard checks each draft against that brand's own Brand Library.", {})]], size=19, spacing=1.15)
text(s, x2, 530, W - M - x2, 200, "The sign-in page shows it before anyone signs in: “BUY NOW!!” is fine for Fizzbox, a loud drinks "
     "brand, and a problem for Lumio Payroll, a calm payroll app. The four examples answer instantly, even while the free server "
     "wakes.", size=17, color=MUTED, spacing=1.12)

# 3 -- Try it ----------------------------------------------------------------------------------
s = frame(section="02 · Try it", title="Two minutes, no sign-up")
text(s, M, 168, W - 2 * M, 60, "Open the link, choose Try the demo, pick a brand and a person. Each visitor gets a private copy, so "
     "nothing you do affects anyone else. Switch person from the menu at the top right.", size=20, spacing=1.15)
steps = [("Asha · writer", "Open “LinkedIn post: new onboarding”. Hover a fix to preview it, accept one, dispute one, send it for review."),
         ("Rohan · manager", "Hold to approve. High-risk findings are still open, so it goes to the brand owner."),
         ("Meera · brand owner", "Waive each high-risk finding with a reason, approve, open the printable record."),
         ("Then explore", "Brand health and guideline gaps, the Brand Library, the Reliability page, Check many posts.")]
sw = (W - 2 * M - 3 * 40) / 4
for i, (who, what) in enumerate(steps):
    x = M + i * (sw + 40)
    box(s, x, 256, sw, 190, fill=CARD, line=LINE, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.06)
    text(s, x + 20, 274, sw - 40, 24, f"{i + 1} · {who}", size=17, color=RUST, bold=True)
    text(s, x + 20, 306, sw - 40, 140, what, size=17, color=NAVY, spacing=1.1)
    if i < 3:
        arrow(s, x + sw + 9, 340)
half = (W - 2 * M - 32) / 2
card(s, M, 480, half, 220, kicker="Payroll software", heading="Lumio Payroll",
     body="Calm, plain and careful. No hype or pressure, one exclamation mark at most, no shouting, every number backed by "
          "an approved fact.")
card(s, M + half + 32, 480, half, 220, kicker="Soft drinks", heading="Fizzbox", inverse=True,
     body="Loud and playful: “BUY NOW!!” is on-brand. Health claims, anything aimed at children and wrong sugar or calorie "
          "numbers are high-risk.")

# 4 -- Reviewing a draft -----------------------------------------------------------------------
s = frame(section="03 · Reviewing a draft", title="Every finding cites a rule and offers a fix")
shot(s, "draft", M, 172, w=800)
x2 = M + 800 + 40
bullets(s, x2, 176, W - M - x2, 560, [
    [bold("Exact checks in code: "), ("terms, rule patterns, numbers against approved facts, expired facts, channel limits. Same answer every time.", {})],
    [bold("AI checks: "), ("tone, positioning, competitors, unsupported claims.", {})],
    [bold("Each finding: "), ("the quote, the rule or fact, the reason, the risk and a fix. Accept, write your own (checked as you type), or dispute.", {})],
    [bold("Hover a fix "), ("to preview the sentence; undo it later.", {})],
    [bold("Precedents: "), ("how the team handled the same rule before.", {})],
    [bold("Channel previews "), ("for LinkedIn, Instagram and email.", {})],
    [bold("“How this was checked” "), ("on every review.", {})],
], size=17, after=7)

# 5 -- Improvement 1: image review --------------------------------------------------------------
s = frame(section="04 · Round 2 commitment 1 · delivered", title="Image review, measured on the pixels")
shot(s, "images", M, 168, h=560)
x2 = M + 560 * 1544 / 1480 + 40
text(s, x2, 168, W - M - x2, 90, "The vision model only reads the image: its text, where each line is, where the logo is, a "
     "description. Every verdict is computed in code, so the same image always gets the same result.", size=17, spacing=1.12)
table(s, x2, 268, [190, 90, W - M - x2 - 280], [
    ["Committed", "Status", "How"],
    ["Palette", "Done", "Main colours against the brand palette; off-brand areas boxed"],
    ["Contrast", "Done", "WCAG 2.2 AA ratio per line of text, from measured colours"],
    ["Logo use", "Done", "Proportions and colour against the official logo file"],
    ["Text in images", "Done", "Read, then checked by the same rules as the draft"],
    ["Descriptions", "Done", "Missing one is a finding; the fix is a suggested description"],
    ["Added", "Done", "Shape and size for the channel, with the crop drawn; blur; palette and logo in the library"],
], size=15, row_h=62, bold_first=True, colors={1: GREEN})

# 6 -- Improvement 2: guideline gaps -----------------------------------------------------------
s = frame(section="05 · Round 2 commitment 2 · delivered", title="Guideline gaps: rules people argue with")
shot(s, "gaps", M, 168, w=700)
x2 = M + 700 + 40
text(s, x2, 168, W - M - x2, 120, "When what a rule flags keeps being waived, dismissed or disputed instead of fixed, the rule is "
     "usually unclear. Brand health lists those rules first, with the real cases, and helps the owner rewrite them.", size=17, spacing=1.12)
table(s, x2, 300, [170, 90, W - M - x2 - 260], [
    ["Committed", "Status", "How"],
    ["Unclear rules", "Done", "Share of each rule's findings argued with; a third or more listed first"],
    ["The examples", "Done", "Real passages, what happened, the reasons, links to the drafts"],
    ["A rewrite", "Done", "AI wording from those cases, as a word diff, edited and accepted by the owner"],
    ["Added", "Done", "Rule history, before/after numbers, missing-rule proposals, Make this a rule"],
], size=15, row_h=72, bold_first=True, colors={1: GREEN})

# 7 -- Improvement 3: reliability --------------------------------------------------------------
s = frame(section="06 · Round 2 commitment 3 · delivered", title="Measured reliability, shown in the product")
shot(s, "reliability", M, 168, w=660)
x2 = M + 660 + 40
lu, fz = "lumio", "fizzbox"
end = table(s, x2, 168, [230, 160, W - M - x2 - 390], [
    ["", "Lumio Payroll", "Fizzbox"],
    ["Exact checks: caught", f"{exact[lu]['caught']} of {exact[lu]['planted']}", f"{exact[fz]['caught']} of {exact[fz]['planted']}"],
    ["Exact: false alarms", str(exact[lu]["false_alarms"]), str(exact[fz]["false_alarms"])],
    ["With AI: caught", f"{ai[lu]['caught']} of {ai[lu]['planted']}", f"{ai[fz]['caught']} of {ai[fz]['planted']}"],
    ["With AI: flagged that was real", pct(ai[lu]["precision"]), pct(ai[fz]["precision"])],
    ["With AI: clean drafts left alone", f"{ai[lu]['clean_passed']} of {ai[lu]['clean_drafts']}", f"{ai[fz]['clean_passed']} of {ai[fz]['clean_drafts']}"],
], size=15, row_h=44, bold_first=True)
bullets(s, x2, end + 18, W - M - x2, 300, [
    [bold("Test drafts: "), (f"{cases // 2} per brand, 30 with planted problems, 10 clean; Hindi, emoji and on-brand hype included. Public in the repo.", {})],
    [bold("Every push: "), ("the exact checks are scored in CI and a miss fails the build. Run the test now repeats them live.", {})],
    [bold("Every night: "), ("the full check with AI runs in CI and commits its scores (80 AI calls, so not on every push).", {})],
], size=15, after=6)

# 8 -- Everything else since Round 2 -----------------------------------------------------------
s = frame(section="07 · Also since Round 2", title="Built for everyday use, and for things going wrong")
cw = (W - 2 * M - 48) / 3
groups = [
    ("Everyday use", ["Check many posts: a content calendar or CSV, a verdict per post",
                      "Channel previews, hover-to-preview fixes, undo",
                      "Keyboard review (J / K, A, D), Ctrl+K, a tour per role",
                      "Live updates when a teammate acts; share links to records",
                      "Make this a rule; a bookmarklet for any web page; dark mode"]),
    ("When things go wrong", ["Acting on an out-of-date page is refused, saying who acted first",
                              "Double clicks never double up; long or broken files get clear messages",
                              "A sleeping server, no connection or an AI failure each get a plain notice and a way on",
                              "A draft being written survives a refresh"]),
    ("Checked from outside", ["Browser journeys and an accessibility scan in CI",
                              "Load test: 15 people at once, no failures",
                              "Outside reviews found 7 issues the day before submission; all fixed, each with a test"]),
]
for i, (hd, items) in enumerate(groups):
    x = M + i * (cw + 24)
    card(s, x, 176, cw, 420, heading=hd)
    bullets(s, x + 24, 250, cw - 48, 340, items, size=18)

# 9 -- How a review runs (dark) ----------------------------------------------------------------
s = frame(dark=True, section="08 · How it works", title="Findings people can trust")
text(s, M, 168, W - 2 * M, 60, "One wrong finding teaches people to ignore all of them, so every review runs through five steps. "
     "The AI never approves, waives or publishes.", size=20, color=ON_DARK_MUTED, spacing=1.15)
steps = [("1. Code first", "Terms, patterns, numbers against facts, expired facts and channel limits, the same every time."),
         ("2. Narrow input", "The AI sees the draft, its purpose, the relevant rules, the facts and what code already found."),
         ("3. Verify", "An AI finding is dropped unless its quote is in the draft and its rule exists. Drops are counted."),
         ("4. Images", "Colours, contrast, logo, shape and sharpness are measured; the model only reads, and its text goes through 1 to 3."),
         ("5. Disclose", "Each review records what came from code and AI, the models, what was sent and what was dropped.")]
sw = (W - 2 * M - 4 * 36) / 5
for i, (hd, b) in enumerate(steps):
    x = M + i * (sw + 36)
    hi = i == 2
    box(s, x, 260, sw, 280, fill=CARD if hi else NAVY_CARD, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.05)
    text(s, x + 20, 284, sw - 40, 60, hd, size=23, color=RUST if hi else ON_DARK, font=SERIF)
    text(s, x + 20, 332, sw - 40, 200, b, size=17, color=BODY if hi else ON_DARK_MUTED, spacing=1.1)
    if i < 4:
        arrow(s, x + sw + 7, 392, color=PEACH)
text(s, M, 580, W - 2 * M, 80, [[("If the AI is down or rate-limited, ", {"color": ON_DARK, "bold": True}),
                                 ("the exact checks and image measurements still run, and the review says the AI step did not, "
                                  "with a button to try again.", {})]], size=19, color=ON_DARK_MUTED, spacing=1.15)

# 10 -- Architecture ---------------------------------------------------------------------------
s = frame(section="09 · Technology", title="A free stack, all live")
end = table(s, M, 172, [220, 560, 532], [
    ["Layer", "Choice", "Role"],
    ["Website", "React 19, Vite, Tailwind CSS 4 on Vercel", "Checks while typing, instant fixes, live updates"],
    ["API", "Python, FastAPI, SQLAlchemy on Render", "Every route checks the person's brand; audit log"],
    ["Database", "PostgreSQL on Supabase (SQLite locally)", "Brands, rules, facts, drafts, versions, findings"],
    ["AI, text", "Groq, openai/gpt-oss-120b, JSON mode", "Judgement checks, rewrites, rule suggestions"],
    ["AI, images", "Groq, qwen/qwen3.8-27b", "Reads text and finds the logo; never judges"],
    ["Images", "Pillow", "Colour, contrast, logo, crop and sharpness maths"],
    ["Quality", "pytest, Playwright, axe, GitHub Actions", "Tests, browser journeys and scores on every push"],
], size=17, row_h=46, bold_first=True)
text(s, M, end + 22, W - 2 * M, 60, "Every tool is open source or on a free plan. The AI receives the draft, its channel, audience and "
     "purpose, and the selected rules, facts and terms; for images, the image and the brand's logo. No names or emails.",
     size=18, spacing=1.15)

# 11 -- Hard problems --------------------------------------------------------------------------
s = frame(section="09 · Technology", title="What was technically hard")
cw = (W - 2 * M - 48) / 3
for i, (k, hd, b) in enumerate([
    ("Correctness", "Findings that follow every edit",
     "A fix rewrites a passage other findings point at. After every fix they are re-checked or re-anchored; replacements are "
     "whole-word (“Lumio Pay” is never changed inside “Lumio Payroll”); emoji offsets are converted between Python and JavaScript; "
     "a person's own fix is checked at once."),
    ("Repeatability", "Image verdicts that do not drift",
     "A vision model's output varies run to run. So it only locates text and the logo; colour difference, WCAG contrast, logo "
     "proportions, crop and sharpness are measured on the pixels, and analyses are cached."),
    ("Measurement", "A score you can check",
     "80 public test drafts, a scorer that matches findings to planted problems, CI that fails on a miss, a nightly AI run that "
     "commits its scores, and a page that shows every miss and false alarm."),
]):
    card(s, M + i * (cw + 24), 180, cw, 380, kicker=k, heading=hd, body=b, body_size=18)

# 12 -- Testing --------------------------------------------------------------------------------
s = frame(section="10 · Testing", title="How we know it works")
end = table(s, M, 168, [270, W - 2 * M - 270], [
    ["Kind", "What"],
    ["Reliability evaluation", f"{cases} test drafts with planted problems: exact checks every push, full check with AI every night"],
    ["77 backend tests", "Roles and brand isolation, exact engine, AI path with a fake model, workflow, image maths, hardening, own fixes"],
    ["5 browser journeys", "Playwright in CI on a real backend and site, with an axe accessibility scan of nine screens, light and dark"],
    ["Load test", "Live free server: 15 people at once, 105 requests, none failed (it found a 37 s start-up, now about 8 s)"],
    ["Break-it pass, reviews", "Empty and huge input, renamed and corrupt files, double clicks, two people at once, offline, AI failure"],
], size=16, row_h=50, bold_first=True)
text(s, M, end + 20, W - 2 * M, 24, "BUGS THESE FOUND, ALL FIXED", size=14, color=RUST, bold=True)
half = (W - 2 * M - 32) / 2
bullets(s, M, end + 52, half, 200, [
    "A fix changed “Lumio Pay” inside “Lumio Payroll”",
    "A number fix stopped applying after accepting all low-risk fixes",
    "Highlights drifted after an emoji",
], size=16, after=5)
bullets(s, M + half + 32, end + 52, half, 200, [
    "An own fix was not checked, so the score could rise on a broken fix",
    "Two counts disagreed after a dispute; approval looked possible when it was not",
    "“No shouting” missed “BUY NOW”; posts past 50 were left out silently",
], size=16, after=5)

# 13 -- Known limits ---------------------------------------------------------------------------
s = frame(section="11 · Honest limits", title="What does not work yet")
col = (W - 2 * M - 32) / 2
card(s, M, 176, col, 400, kicker="Known limits", heading="Today")
bullets(s, M + 24, 278, col - 48, 390, [
    "The free server sleeps when idle; the first request after a sleep can take about 30 seconds (a pinger keeps it awake while judging)",
    "Logo checks compare shape and main colour, not a logo redrawn in another font",
    "Contrast on a busy photo can be measured on the wrong background",
    "AI rules are re-judged only when the check runs again",
    "Rules and prompts are in English; Hindi text is checked for terms, patterns and numbers",
    "No email notifications; video and audio are not reviewed",
], size=17, after=7)
card(s, M + col + 32, 176, col, 400, kicker="Changed from the plan", heading="And why")
bullets(s, M + col + 56, 278, col - 48, 390, [
    "Logo rotation, cropping and crowding come from the vision model's reading; everything else in image review is measured",
    "The full check with AI runs nightly, not on every push: each run is 80 AI calls on a free plan",
    "Image text is read by a vision model rather than OCR: it also finds where each line is, which contrast needs",
], size=17, after=7)

# 14 -- Roadmap --------------------------------------------------------------------------------
s = frame(section="12 · Where it goes next", title="From a demo to real teams, in four steps")
text(s, M, 156, W - 2 * M, 30, [[("For ", {}), bold("small marketing teams"),
                                 (" (startups, agencies, colleges, societies) that publish often with no brand reviewer.", {})]],
     size=18, spacing=1.12)
phases = [
    ("Phase 1", "4 to 6 weeks", "Pilot with real teams",
     ["Two or three teams use it for a month, with their own rules", "Email alerts and a daily digest for managers",
      "Test drafts written from their real posts"],
     "Pilot teams, a free email service"),
    ("Phase 2", "6 to 8 weeks", "Inside the tools they use",
     ["A browser extension for Google Docs, a CMS and LinkedIn", "Import from Google Docs and Notion",
      "Hindi and Bengali rules, written by the brand"],
     "Chrome Web Store account, Google and Notion APIs"),
    ("Phase 3", "6 weeks", "Ready for more teams",
     ["An always-on server; checks in the background", "A second AI provider, scored on the test drafts first",
      "Alerts when the nightly score drops; Google sign-in"],
     "About Rs 1,500 to 3,000 a month"),
    ("Phase 4", "8 weeks · research", "Learn from decisions",
     ["Rules propose their own exceptions from repeated waivers", "The brand owner approves every change"],
     "Enough real decisions from the pilots"),
]
cw = (W - 2 * M - 3 * 28) / 4
line_y = 246
box(s, M, line_y - 1, W - 2 * M, 2, fill=LINE)
for i, (ph, dur, hd, items, needs) in enumerate(phases):
    x = M + i * (cw + 28)
    nxt = i == 0
    box(s, x, line_y - 9, 18, 18, fill=RUST if nxt else NAVY, shape=MSO_SHAPE.DIAMOND)
    text(s, x + 28, line_y - 30, cw - 28, 20, f"{ph.upper()} · {dur.upper()}", size=13, color=RUST if nxt else MUTED, bold=True)
    top = line_y + 28
    box(s, x, top, cw, 300, fill=NAVY if nxt else CARD, line=None if nxt else LINE, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.04)
    if nxt:
        box(s, x + cw - 92, top + 18, 72, 24, fill=PEACH, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.5)
        text(s, x + cw - 92, top + 18, 72, 24, "NEXT", size=12, color=NAVY, bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    text(s, x + 22, top + 52, cw - 44, 64, hd, size=23, color=ON_DARK if nxt else NAVY, font=SERIF, spacing=1.0)
    bullets(s, x + 22, top + 104, cw - 44, 190, items, size=16, dark=nxt, after=8)
    if i < 3:
        arrow(s, x + cw + 3, top + 142, color=LINE)
band = line_y + 28 + 300 + 30
box(s, M, band, W - 2 * M, 66, fill=NAVY, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.12)
text(s, M + 24, band, 250, 66, "PILOT SUCCEEDS IF", size=14, color=PEACH, bold=True, anchor=MSO_ANCHOR.MIDDLE)
measures = ["Teams still use it after week two", "Over 60% of findings fixed, not argued with",
            "No missed high-risk problem a rule covered"]
mw = (W - 2 * M - 270) / 3
for i, t in enumerate(measures):
    text(s, M + 260 + i * mw, band, mw - 16, 66, [[("✓  ", {"color": PEACH, "bold": True}), (t, {})]],
         size=16, color=ON_DARK, anchor=MSO_ANCHOR.MIDDLE)

# 15 -- Team (dark) ----------------------------------------------------------------------------
s = frame(dark=True, section="13 · Team", title="Nova Blasters")
team = [("Tanmoy Ghosh", "Team Leader, UI/UX Designer", "Plans and coordinates; designs flows, wireframes and the visual system."),
        ("Deepanjan Mandal", "Frontend Developer", "Review workspace, findings view and dashboard in React."),
        ("Auritras Maitra", "Backend Developer", "Python API, roles, workflow engine, audit logs and storage."),
        ("Sohom Koley", "Frontend Developer", "Upload flow, comments and approval screens, accessibility."),
        ("Deepanjan Panda", "Research and Analysis", "Interviews, content audit, survey, test feedback, impact analysis."),
        ("Sounavo Majumder", "ML", "Review pipeline, claim and tone checks, AI verification.")]
cw = (W - 2 * M - 48) / 3
for i, (name, role, does) in enumerate(team):
    x = M + (i % 3) * (cw + 24)
    y = 176 + (i // 3) * 222
    box(s, x, y, cw, 198, fill=NAVY_CARD, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.05)
    text(s, x + 24, y + 22, cw - 48, 34, name, size=26, color=ON_DARK, font=SERIF)
    text(s, x + 24, y + 62, cw - 48, 24, role, size=17, color=PEACH, bold=True)
    text(s, x + 24, y + 96, cw - 48, 100, does, size=17, color=ON_DARK_MUTED, spacing=1.12)
text(s, M, 640, W - 2 * M, 60, "Built with Claude Code (Anthropic) as a coding assistant for planning, code, tests and documentation; "
     "every change was reviewed and tested by the team. Demo brands, people and content are fictional.",
     size=16, color=ON_DARK_MUTED, spacing=1.12)

prs.save(OUT)
print("saved", OUT, "slides:", len(prs.slides))
