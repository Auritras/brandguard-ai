"""Made-up visuals for the two FICTIONAL demo brands: their logos, and one sample image each with problems
planted on purpose for image review to find. Drawn in code with Pillow's built-in font, so nothing
external is needed and the same picture comes out on every machine."""
import io

from PIL import Image, ImageDraw, ImageFont

PALETTES = {
    "lumio": "#1b2a4a,#1f9e89,#f6f1e7,#f2b134",   # navy, teal, cream, marigold
    "fizzbox": "#ff5a1f,#ffc300,#e6007e,#00b3a4",  # orange, sunshine, berry, lagoon
}


def _font(size: int):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # very old Pillow
        return ImageFont.load_default()


def _png(img: Image.Image) -> bytes:
    out = io.BytesIO()
    img.save(out, "PNG", optimize=True)
    return out.getvalue()


def _logo_image(key: str) -> Image.Image:
    if key == "fizzbox":
        img = Image.new("RGB", (420, 140), "#ff5a1f")
        d = ImageDraw.Draw(img)
        d.ellipse((22, 22, 118, 118), fill="#ffc300")
        d.text((140, 70), "Fizzbox", font=_font(64), fill="white", anchor="lm", stroke_width=2, stroke_fill="white")
        return img
    img = Image.new("RGB", (420, 140), "#1b2a4a")
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((26, 34, 98, 106), radius=18, fill="#1f9e89")
    d.text((122, 70), "Lumio", font=_font(66), fill="#f6f1e7", anchor="lm", stroke_width=2, stroke_fill="#f6f1e7")
    return img


def logo_png(key: str) -> bytes:
    return _png(_logo_image(key))


def sample_png(key: str) -> bytes:
    """A post image with planted problems: an unsupported claim and a weak link in the image text, text
    that is hard to read, an off-brand colour, and the logo used wrongly. It also has no description."""
    if key == "fizzbox":
        img = Image.new("RGB", (1080, 1080), "#ff5a1f")
        d = ImageDraw.Draw(img)
        d.rectangle((0, 760, 1080, 1080), fill="#3f7d20")  # leafy green band: not a Fizzbox colour
        d.text((80, 160), "HEALTHY", font=_font(150), fill="#ffc300", stroke_width=3, stroke_fill="#ffc300")
        d.text((80, 330), "MANGO FIZZ", font=_font(150), fill="#ffc300", stroke_width=3, stroke_fill="#ffc300")
        d.text((80, 560), "Perfect for kids after school", font=_font(54), fill="#ffd9c7")
        logo = _logo_image("fizzbox")
        blue = Image.new("RGB", logo.size, "#2050ff")  # the logo recoloured: blue instead of orange
        blue.paste(logo, mask=Image.eval(logo.convert("L"), lambda v: 0 if abs(v - 140) < 20 else 255))
        img.paste(blue, (620, 860))
        return _png(img)
    img = Image.new("RGB", (1200, 675), "#ffffff")
    d = ImageDraw.Draw(img)
    d.rectangle((760, 0, 1200, 675), fill="#7b2ff7")  # purple panel: not a Lumio colour
    d.text((70, 150), "India's #1 payroll app", font=_font(64), fill="#c9c9c9", stroke_width=1, stroke_fill="#c9c9c9")
    d.text((70, 260), "Run payroll in minutes, every month.", font=_font(34), fill="#1b2a4a")
    d.text((70, 330), "Click here to book a demo", font=_font(34), fill="#1f9e89")
    logo = _logo_image("lumio").resize((420, 80))  # squashed to a strip
    img.paste(logo, (70, 520))
    return _png(img)
