"""Image review: colours, contrast, logo use, text inside the image, and the image description.

Split like the text review: the vision model only *reads* the image (the text lines and where they are,
where the logo is, a suggested description). Every judgement is made here in code, so it is repeatable:
palette distance, WCAG contrast ratios and the logo's shape and colours are measured on the pixels.
The text read from the image then goes through the same rules as the draft text (see run.py).
"""
import base64
import io
import json
import math

from PIL import Image, ImageOps

from .. import config
from .ai import _post, _why

MAX_UPLOAD = 8 * 1024 * 1024
MAX_SIDE = 1280
Image.MAX_IMAGE_PIXELS = 40_000_000  # bigger than this is refused rather than decoded (decompression bombs)

TYPES = {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp", "GIF": "image/gif"}


# ---------- reading and storing ----------

def prepare(data: bytes) -> tuple[bytes, str, int, int]:
    """Check an upload really is an image, shrink it to at most 1280 px a side and re-encode it.
    Returns (bytes, mime type, width, height). Raises ValueError with a plain message."""
    if not data:
        raise ValueError("The file is empty.")
    if len(data) > MAX_UPLOAD:
        raise ValueError("The image is larger than 8 MB.")
    try:
        with Image.open(io.BytesIO(data)) as probe:
            kind = probe.format
            probe.verify()
        img = Image.open(io.BytesIO(data))
        img.load()
    except Image.DecompressionBombError:
        raise ValueError("The image is too large (more than 40 megapixels).")
    except Exception:
        raise ValueError("This file is not an image we can read. Use PNG, JPEG, WebP or GIF.")
    if kind not in TYPES:
        raise ValueError("Use a PNG, JPEG, WebP or GIF image.")
    img = ImageOps.exif_transpose(img)  # phone photos: apply the rotation they were taken with
    if getattr(img, "n_frames", 1) > 1:
        img.seek(0)
    alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
    img = img.convert("RGBA" if alpha else "RGB")
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    out = io.BytesIO()
    if alpha:
        img.save(out, "PNG", optimize=True)
        return out.getvalue(), "image/png", img.width, img.height
    img.save(out, "JPEG", quality=86, optimize=True)
    return out.getvalue(), "image/jpeg", img.width, img.height


def open_rgb(data: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(data))
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
        bg.alpha_composite(img)
        return bg.convert("RGB")
    return img.convert("RGB")


# ---------- colour ----------

def hex_of(rgb) -> str:
    return "#%02x%02x%02x" % tuple(int(c) for c in rgb[:3])


def rgb_of(hex_: str) -> tuple[int, int, int]:
    h = hex_.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def parse_palette(text: str) -> list[str]:
    out = []
    for part in (text or "").replace(";", ",").split(","):
        part = part.strip()
        if not part:
            continue
        try:
            out.append(hex_of(rgb_of(part)))
        except ValueError:
            continue
    return out


def _lab(rgb):
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(float(c)) for c in rgb[:3])
    x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883

    def f(t):
        return t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    fx, fy, fz = f(x), f(y), f(z)
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


def delta_e(a, b) -> float:
    """CIE76 colour difference. Under about 10 looks like the same colour; over 25 is clearly different."""
    return math.dist(_lab(a), _lab(b))


def is_neutral(rgb) -> bool:
    """White, black and greys go with any brand, so they are never counted as off-palette."""
    _l, a, b = _lab(rgb)
    return math.hypot(a, b) < 12


def main_colours(img: Image.Image, n: int = 6) -> list[dict]:
    """The image's main colours and the share of the image each covers, largest first."""
    small = img.copy()
    small.thumbnail((120, 120))
    q = small.quantize(colors=n, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()
    total = small.width * small.height
    found = []
    for count, idx in sorted(q.getcolors(), reverse=True):
        rgb = tuple(pal[idx * 3: idx * 3 + 3])
        for f in found:  # merge colours that look the same
            if delta_e(f["rgb"], rgb) < 8:
                f["share"] += count / total
                break
        else:
            found.append({"rgb": rgb, "share": count / total})
    return [{"hex": hex_of(f["rgb"]), "rgb": f["rgb"], "share": round(f["share"], 3)} for f in found]


OFF_PALETTE = 25   # delta E from the nearest brand colour
MIN_SHARE = 0.08   # colours covering less of the image than this are details, not the look


def palette_check(colours: list[dict], brand: list[str]) -> list[dict]:
    """Each main colour with its nearest brand colour and whether it is off-palette."""
    out = []
    for c in colours:
        near, dist = None, None
        for b in brand:
            d = delta_e(c["rgb"], rgb_of(b))
            if dist is None or d < dist:
                near, dist = b, d
        neutral = is_neutral(c["rgb"])
        out.append({"hex": c["hex"], "share": c["share"], "nearest": near,
                    "distance": None if dist is None else round(dist, 1), "neutral": neutral,
                    "off": bool(brand) and not neutral and c["share"] >= MIN_SHARE and dist > OFF_PALETTE})
    return out


# ---------- contrast ----------

def _luminance(rgb) -> float:
    def ch(c):
        c /= 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(float(c)) for c in rgb[:3])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast_ratio(a, b) -> float:
    la, lb = sorted((_luminance(a), _luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def _clamp_box(box, w, h):
    try:
        x0, y0, x1, y1 = (float(v) for v in box)
    except (TypeError, ValueError):
        return None
    x0, x1 = sorted((max(0, min(w, x0)), max(0, min(w, x1))))
    y0, y1 = sorted((max(0, min(h, y0)), max(0, min(h, y1))))
    if x1 - x0 < 4 or y1 - y0 < 4:
        return None
    return int(x0), int(y0), int(x1), int(y1)


def line_contrast(img: Image.Image, box) -> dict | None:
    """Text and background colour of one line of text, and their WCAG contrast ratio.
    The two main colours inside the line's box are the background (larger) and the letters."""
    b = _clamp_box(box, img.width, img.height)
    if b is None:
        return None
    crop = img.crop(b)
    crop.thumbnail((240, 240))
    q = crop.quantize(colors=8, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()
    counts = sorted(q.getcolors(), reverse=True)
    total = sum(n for n, _ in counts)
    colours = [(n / total, tuple(pal[i * 3: i * 3 + 3])) for n, i in counts]
    if len(colours) < 2:
        return None
    # The background covers most of the box. The letters are the colour that stands out most from it;
    # edge pixels blend the two, so picking the most different colour avoids measuring the blend.
    bg = colours[0][1]
    others = [c for share, c in colours[1:] if share >= 0.02] or [colours[1][1]]
    fg = max(others, key=lambda c: contrast_ratio(c, bg))
    large = (b[3] - b[1]) >= img.height * 0.06  # tall lines are large text: WCAG asks 3:1 instead of 4.5:1
    ratio = contrast_ratio(fg, bg)
    need = 3.0 if large else 4.5
    return {"text": hex_of(fg), "background": hex_of(bg), "ratio": round(ratio, 2), "needed": need,
            "large": large, "passes": ratio >= need}


# ---------- logo ----------

def _inside(a, b) -> bool:
    """True if box a sits mostly inside box b."""
    w = max(0, min(a[2], b[2]) - max(a[0], b[0]))
    h = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    return w * h >= 0.6 * (a[2] - a[0]) * (a[3] - a[1])


def logo_check(img: Image.Image, box, logo: Image.Image | None) -> list[str]:
    """Measured problems with the logo in `box` compared with the official logo: shape and colour."""
    if logo is None:
        return []
    b = _clamp_box(box, img.width, img.height)
    if b is None:
        return []
    issues = []
    seen = (b[2] - b[0]) / (b[3] - b[1])
    real = logo.width / logo.height
    change = seen / real
    if change > 1.15:
        issues.append("stretched")
    elif change < 0.87:
        issues.append("squashed")
    own = main_colours(logo, 4)
    there = main_colours(img.crop(b), 5)
    # The logo's main colour must still be there; anything else in the box may be background around it.
    if own and there and min(delta_e(own[0]["rgb"], t["rgb"]) for t in there if t["share"] >= 0.05) > OFF_PALETTE:
        issues.append("recoloured")
    if (b[2] - b[0]) * (b[3] - b[1]) < img.width * img.height * 0.004:
        issues.append("too small")
    return issues


# ---------- the vision model: reading only ----------

VISION_SYSTEM = """You read one marketing image for a brand review. The FIRST image is the one to review. If a SECOND image is given, it is the brand's official logo.
Report what is there; do not judge it. Reply with JSON only:
{"text_lines":[{"text":"exact text of one line, as written","box":[x0,y0,x1,y1]}],
 "logo":{"present":true,"box":[x0,y0,x1,y1],"issues":[]},
 "description":"one or two plain sentences describing the image for someone who cannot see it, including any text in it"}
Boxes are pixel positions in the first image (left, top, right, bottom). Each text line is one line as it appears; keep capital letters and punctuation exactly.
logo.issues may only use: stretched, squashed, recoloured, rotated, cropped, too small, crowded. If no logo image is given, set "logo" to null. If the logo is not in the first image, set present to false and box to null."""

VISION_MODEL_FALLBACK = "qwen/qwen3.8-27b"


def _data_url(data: bytes, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"


def _scale(box, k):
    try:
        return [round(float(v) * k) for v in box][:4] if box and len(box) == 4 else None
    except (TypeError, ValueError):
        return None


def read_image(data: bytes, mime: str, width: int, height: int, logo: bytes | None, logo_mime: str = "image/png") -> dict:
    """Ask the vision model to read the image. Never raises: returns {"used": False, "note": why} on failure."""
    model = config.VISION_MODEL or VISION_MODEL_FALLBACK
    if not config.AI_API_KEY:
        return {"used": False, "note": "Text in the image and the logo were not read: no AI key is configured. Colours and the description were checked in code."}
    # The model reports positions in a frame whose longest side is 1000, so send it exactly that size
    # and scale its boxes back to the stored image.
    frame = open_rgb(data)
    scale = max(frame.width, frame.height) / 1000
    frame = frame.resize((max(1, round(frame.width / scale)), max(1, round(frame.height / scale))))
    buf = io.BytesIO()
    frame.save(buf, "PNG")
    content = [{"type": "text", "text": f"The first image is {frame.width} x {frame.height} pixels. Read it."},
               {"type": "image_url", "image_url": {"url": _data_url(buf.getvalue(), "image/png")}}]
    if logo:
        content.append({"type": "image_url", "image_url": {"url": _data_url(logo, logo_mime)}})
    try:
        r = _post({"model": model, "temperature": 0, "response_format": {"type": "json_object"},
                   "messages": [{"role": "system", "content": VISION_SYSTEM}, {"role": "user", "content": content}]})
        r.raise_for_status()
        out = json.loads(r.json()["choices"][0]["message"]["content"])
    except Exception as e:
        return {"used": False, "note": f"The image could not be read by AI ({_why(e)}). Colours were still checked; run the check again to retry."}
    lines = []
    for ln in out.get("text_lines") or []:
        if isinstance(ln, dict) and str(ln.get("text", "")).strip():
            lines.append({"text": str(ln["text"]).strip()[:300], "box": _scale(ln.get("box"), scale)})
    lg = out.get("logo") if isinstance(out.get("logo"), dict) else None
    if lg:
        lg["box"] = _scale(lg.get("box"), scale)
    return {"used": True, "model": model, "lines": lines[:30], "logo": lg,
            "description": str(out.get("description") or "").strip()[:500],
            "note": f"The image was read by {config.AI_PROVIDER_NAME} ({model}): only the image{' and the brand logo' if logo else ''} were sent."}


def analyse(data: bytes, mime: str, width: int, height: int, palette: list[str],
            logo: bytes | None = None, logo_mime: str = "image/png") -> dict:
    """Everything the review needs about one image. Measurements in code; reading by the vision model."""
    img = open_rgb(data)
    colours = palette_check(main_colours(img), palette)
    seen = read_image(data, mime, width, height, logo, logo_mime)
    lg = seen.get("logo") if logo else None
    logo_box = _clamp_box(lg.get("box"), img.width, img.height) if lg and lg.get("present") and lg.get("box") else None
    lines = []
    for ln in seen.get("lines", []):
        box = _clamp_box(ln.get("box"), img.width, img.height) if ln.get("box") else None
        if box and logo_box and _inside(box, logo_box):
            continue  # the wordmark in the logo is checked as the logo, not as text
        c = line_contrast(img, box) if box else None
        lines.append({"text": ln["text"], "box": ln.get("box"), "contrast": c})
    logo_out = None
    if logo and seen.get("used"):
        lg = lg or {}
        present = bool(lg.get("present"))
        measured = logo_check(img, lg.get("box"), open_rgb(logo)) if present else []
        said = [i for i in (lg.get("issues") or []) if i in ("rotated", "cropped", "crowded")]
        logo_out = {"present": present, "box": lg.get("box") if present else None,
                    "issues": sorted(set(measured + said)), "measured": measured}
    return {"colours": colours, "palette": palette, "lines": lines, "logo": logo_out,
            "description": seen.get("description", ""), "ai_used": seen.get("used", False), "note": seen.get("note", "")}


def image_text(analysis: dict) -> str:
    return "\n".join(ln["text"] for ln in analysis.get("lines", []))
