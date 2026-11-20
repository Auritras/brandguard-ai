"""Image review: measurements in code, findings, fixes, and the image endpoints. AI is off here, so the
text inside images and the logo are not read; colours, contrast maths and descriptions are."""
import io

from PIL import Image

from app.engine.image import contrast_ratio, line_contrast, logo_check, main_colours, palette_check, prepare
from app.samples import logo_png, sample_png

from test_workflow import make


def png(img):
    b = io.BytesIO()
    img.save(b, "PNG")
    return b.getvalue()


def test_contrast_ratio_matches_wcag():
    assert round(contrast_ratio((0, 0, 0), (255, 255, 255)), 1) == 21.0
    assert round(contrast_ratio((119, 119, 119), (255, 255, 255)), 2) == 4.48  # the classic "just fails" grey


def test_line_contrast_reads_text_and_background():
    img = Image.new("RGB", (400, 100), "white")
    for x in range(20, 380, 6):  # dark grey "letters"
        img.paste((60, 60, 60), (x, 30, x + 3, 70))
    c = line_contrast(img, [10, 20, 390, 80])
    assert c["background"] == "#ffffff" and c["passes"] and c["ratio"] > 9


def test_palette_flags_large_off_brand_colours_only():
    img = Image.new("RGB", (100, 100), "#1b2a4a")
    img.paste((123, 47, 247), (0, 0, 40, 100))     # 40% purple: off-brand
    img.paste((255, 255, 255), (90, 0, 100, 100))  # white: neutral, always fine
    result = palette_check(main_colours(img), ["#1b2a4a", "#1f9e89"])
    off = [c for c in result if c["off"]]
    assert len(off) == 1 and off[0]["share"] > 0.3
    assert not any(c["off"] for c in palette_check(main_colours(img), []))  # no palette set: nothing to compare


def test_logo_shape_and_colour_are_measured():
    logo = Image.open(io.BytesIO(logo_png("lumio"))).convert("RGB")  # 420 x 140
    img = Image.new("RGB", (1200, 600), "white")
    img.paste(logo.resize((420, 70)), (100, 100))
    assert "stretched" in logo_check(img, [100, 100, 520, 170], logo)
    img2 = Image.new("RGB", (1200, 600), "white")
    img2.paste(logo, (100, 100))
    assert logo_check(img2, [100, 100, 520, 240], logo) == []


def test_prepare_refuses_non_images_and_shrinks_big_ones():
    import pytest
    with pytest.raises(ValueError):
        prepare(b"%PDF-1.4 not an image")
    with pytest.raises(ValueError):
        prepare(b"")
    data, mime, w, h = prepare(png(Image.new("RGB", (3000, 1500), "red")))
    assert (w, h) == (1280, 640) and mime == "image/jpeg"


def test_image_on_a_draft(client, creator, manager):
    d = make(client, creator, "A calm post about payroll for small businesses.")
    did = d["id"]
    bad = client.post(f"/api/drafts/{did}/images", headers=creator, files={"file": ("x.png", b"not an image", "image/png")})
    assert bad.status_code == 422
    r = client.post(f"/api/drafts/{did}/images", headers=creator, files={"file": ("banner.png", sample_png("lumio"), "image/png")})
    assert r.status_code == 200, r.text
    d = r.json()
    assert len(d["images"]) == 1 and d["version"] == 2 and d["needs_check"]
    img = d["images"][0]

    # the image link works with its token, and not without
    assert client.get(img["url"]).status_code == 200
    assert client.get(f"/api/images/{img['id']}").status_code == 401
    # someone who cannot see the draft cannot change its image
    assert client.put(f"/api/images/{img['id']}", headers=manager, json={"alt_text": "x"}).status_code == 403

    d = client.post(f"/api/drafts/{did}/check", headers=creator).json()
    codes = [f["ref_code"] for f in d["findings"] if f["image_id"] == img["id"]]
    assert "VIS-PALETTE" in codes and "VIS-ALT" in codes  # purple panel, and no description
    assert d["images"][0]["analysis"]["colours"]

    palette = next(f for f in d["findings"] if f["ref_code"] == "VIS-PALETTE")
    assert client.post(f"/api/findings/{palette['id']}/edit", headers=creator, json={"replacement": "x"}).status_code == 409
    alt = next(f for f in d["findings"] if f["ref_code"] == "VIS-ALT")
    d = client.post(f"/api/findings/{alt['id']}/edit", headers=creator,
                    json={"replacement": "Banner: India's #1 payroll app, with the Lumio logo."}).json()
    assert d["images"][0]["alt_text"].startswith("Banner")
    d = client.post(f"/api/drafts/{did}/check", headers=creator).json()
    assert not any(f["ref_code"] == "VIS-ALT" and f["status"] == "open" for f in d["findings"])

    d = client.delete(f"/api/images/{img['id']}", headers=creator).json()
    assert d["images"] == [] and not any(f["image_id"] for f in d["findings"] if f["status"] == "open")


def test_brand_visuals(client, reviewer, creator):
    lib = client.get("/api/library", headers=creator).json()
    assert lib["visuals"]["palette"] and lib["visuals"]["has_logo"]
    assert client.put("/api/brand/palette", headers=creator, json={"palette": ["#000000"]}).status_code == 403
    assert client.put("/api/brand/palette", headers=reviewer, json={"palette": ["nope"]}).status_code == 422
    v = client.put("/api/brand/palette", headers=reviewer, json={"palette": lib["visuals"]["palette"]}).json()
    assert v["palette"] == lib["visuals"]["palette"]
    assert client.get(v["logo_url"]).status_code == 200


def test_text_in_an_image_goes_through_the_same_rules(client, creator, monkeypatch):
    """With a fake vision reply: the text it reads is checked like draft text, the contrast of each line is
    measured on the pixels, and the logo's shape is measured against the brand logo."""
    import json

    import httpx

    from app import config
    from app.engine import ai, image

    d = make(client, creator, "A calm post about payroll for small businesses.")
    client.post(f"/api/drafts/{d['id']}/images", headers=creator, files={"file": ("b.png", sample_png("lumio"), "image/png")})

    def fake_post(payload):
        assert payload["model"] == config.VISION_MODEL
        sent = payload["messages"][1]["content"]
        assert sent[1]["image_url"]["url"].startswith("data:image/png;base64,") and len(sent) == 3  # image + brand logo
        # positions in the 1000-wide frame the image was sent in (the stored image is 1200 wide)
        reply = {"text_lines": [{"text": "India's #1 payroll app", "box": [55, 122, 570, 190]},
                                {"text": "Click here to book a demo", "box": [55, 272, 395, 305]}],
                 "logo": {"present": True, "box": [58, 433, 408, 500], "issues": []},
                 "description": "A white banner with a purple panel that says India's #1 payroll app."}
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(reply)}}]},
                              request=httpx.Request("POST", "https://example.test"))

    monkeypatch.setattr(config, "AI_API_KEY", "test-key")
    monkeypatch.setattr(image, "_post", fake_post)
    monkeypatch.setattr(ai, "_chat", lambda system, user: {"findings": [], "rewrites": []})
    d = client.post(f"/api/drafts/{d['id']}/check", headers=creator).json()

    from_image = {f["ref_code"]: f for f in d["findings"] if f["image_id"]}
    assert "R-002" in from_image and from_image["R-002"]["reason"].startswith("In image 1")  # "#1" in the image
    assert "R-005" in from_image  # "Click here" in the image
    assert "VIS-CONTRAST" in from_image  # light grey headline on white
    assert "VIS-LOGO" in from_image and "stretched" in from_image["VIS-LOGO"]["quote"]
    assert from_image["VIS-ALT"]["suggestion"].startswith("A white banner")
    assert "qwen" in d["run"]["ai_model"]


def test_sharpness_tells_crisp_from_blurry():
    from PIL import ImageFilter

    from app.engine.image import BLURRY_BELOW, sharpness
    for key in ("lumio", "fizzbox"):
        img = Image.open(io.BytesIO(sample_png(key))).convert("RGB")
        assert sharpness(img) >= 0.55  # the crisp originals
        assert sharpness(img.filter(ImageFilter.GaussianBlur(1.5))) < BLURRY_BELOW
        small = img.resize((img.width // 3, img.height // 3), Image.BILINEAR).resize(img.size, Image.BICUBIC)
        assert sharpness(small) < BLURRY_BELOW  # a small image enlarged
    assert sharpness(Image.new("RGB", (800, 800), "red")) is None  # nothing to judge


def test_channel_fit_shape_size_and_what_a_crop_cuts():
    from app.engine.image import channel_fit
    assert channel_fit(1200, 675, "LinkedIn", {})["shape_ok"]  # 1.78:1 is fine
    assert channel_fit(1080, 1350, "Instagram", {}) == {**channel_fit(1080, 1350, "Instagram", {}), "shape_ok": True, "too_small": False}
    assert channel_fit(1000, 500, "Blog", {}) is None  # no rule for this channel
    tall = {"logo": {"present": True, "box": [400, 20, 680, 110]}, "lines": [{"text": "Hello", "box": [100, 600, 900, 700]}]}
    f = channel_fit(1080, 2400, "Instagram", tall)  # 0.45:1, a phone screenshot
    assert not f["shape_ok"] and f["shape"].startswith("4:5") and f["size"] == "1080 × 1350"
    assert f["crop"] == [0, 525, 1080, 1875] and f["cut"] == ["the logo"]  # the text in the middle survives
    assert channel_fit(500, 500, "Instagram", {})["too_small"]


def test_size_and_blur_findings_on_a_draft(client, creator):
    from PIL import ImageFilter
    r = client.post("/api/drafts", headers=creator, json={"title": "Story", "channel": "Instagram", "body": "A calm post about payroll."})
    did = r.json()["id"]
    img = Image.open(io.BytesIO(sample_png("lumio"))).convert("RGB").resize((400, 900)).filter(ImageFilter.GaussianBlur(2))
    client.post(f"/api/drafts/{did}/images", headers=creator, files={"file": ("story.png", png(img), "image/png")})
    d = client.post(f"/api/drafts/{did}/check", headers=creator).json()
    size = [f for f in d["findings"] if f["ref_code"] == "VIS-SIZE"]
    assert len(size) == 2 and any("Crop to 4:5" in f["suggestion"] for f in size) and any("1080 px" in f["reason"] for f in size)
    assert any(f["ref_code"] == "VIS-SHARP" for f in d["findings"])
    a = d["images"][0]["analysis"]
    assert a["fit"]["crop"] and a["sharpness"] < 0.45
    # the shape follows the channel: in an email, the same image only needs to be 600 px wide
    did = client.post("/api/drafts", headers=creator, json={"title": "Mail", "channel": "Email", "body": "A calm note about payroll."}).json()["id"]
    client.post(f"/api/drafts/{did}/images", headers=creator, files={"file": ("story.png", png(img), "image/png")})
    d = client.post(f"/api/drafts/{did}/check", headers=creator).json()
    assert [f["reason"][:20] for f in d["findings"] if f["ref_code"] == "VIS-SIZE" and f["status"] == "open"] == ["The image is 400 px "]
