"""Офлайн-проверка правил отбора и оформления фото (без обращения к Commons)."""

import importlib.util
import io
import sys

from app.settings import PROJECT_ROOT

spec = importlib.util.spec_from_file_location("fetch_menu_photos", PROJECT_ROOT / "scripts" / "fetch_menu_photos.py")
fmp = importlib.util.module_from_spec(spec)
sys.modules["fetch_menu_photos"] = fmp
spec.loader.exec_module(fmp)


def test_license_filter():
    for ok in ("CC0", "Public domain", "CC BY 2.0", "CC BY-SA 4.0", "CC BY-SA 3.0", "cc-by-sa-2.5"):
        assert fmp.license_ok(ok), ok
    for bad in ("CC BY-NC 2.0", "CC BY-NC-SA 4.0", "CC BY-ND 2.0", "", "All rights reserved", "GFDL"):
        assert not fmp.license_ok(bad), bad
    assert not fmp.license_ok("CC BY-SA 4.0", restrictions="trademarked")


def test_evaluate_rejects_small_or_unlicensed():
    page = {"title": "File:X.jpg", "imageinfo": [{"mime": "image/jpeg", "width": 2000, "extmetadata": {
        "LicenseShortName": {"value": "CC BY-SA 4.0"}, "Artist": {"value": "<a href='#'>Jane Doe</a>"}}}]}
    assert fmp.evaluate(page)[0]
    page["imageinfo"][0]["width"] = 400
    assert not fmp.evaluate(page)[0]
    page["imageinfo"][0]["width"] = 2000
    page["imageinfo"][0]["extmetadata"]["LicenseShortName"]["value"] = "CC BY-NC 2.0"
    assert not fmp.evaluate(page)[0]


def test_credit_and_markdown(tmp_path):
    page = {"title": "File:Tasty pizza.jpg"}
    info = {"descriptionurl": "https://commons.wikimedia.org/wiki/File:Tasty_pizza.jpg", "extmetadata": {
        "Artist": {"value": "<a href='//x'>Jane Doe</a>"}, "LicenseShortName": {"value": "CC BY-SA 2.0"},
        "LicenseUrl": {"value": "https://creativecommons.org/licenses/by-sa/2.0"},
        "AttributionRequired": {"value": "true"}}}
    c = fmp.credit_from("margherita.jpg", "Пицца", page, info)
    assert c.author == "Jane Doe" and c.attribution_required and "Jane Doe" in c.attribution
    md = fmp.render_markdown([c])
    assert "margherita.jpg" in md and "CC BY-SA 2.0" in md and c.source_page in md


def test_optimize_resizes_to_4_3_jpeg(tmp_path):
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (3000, 2000), (10, 120, 50)).save(buf, "PNG")
    dest = tmp_path / "out.jpg"
    fmp.optimize(buf.getvalue(), dest)
    img = Image.open(dest)
    assert img.format == "JPEG" and img.size == (1280, 960)
