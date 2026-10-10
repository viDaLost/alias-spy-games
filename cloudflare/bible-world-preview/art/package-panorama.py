#!/usr/bin/env python3
"""Losslessly package the full generated scenes as their game WebP assets."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SCENES = {
    "babel": "v4-hq",
    "temple": "v2-hq",
    "galilee": "v2-hq",
}

for scene, version in SCENES.items():
    source = ROOT / "art" / "sources" / f"{scene}-panorama.png"
    destination = ROOT / "public" / "assets" / f"{scene}-360-{version}.webp"
    image = Image.open(source)
    if image.size != (1774, 887):
        raise ValueError(f"{source.name}: expected native 1774 × 887, got {image.size}")
    temporary = destination.with_suffix(".webp.tmp")
    image.save(temporary, format="WEBP", lossless=True, method=6)
    reopened = Image.open(temporary)
    if reopened.size != image.size:
        raise RuntimeError(f"WebP dimensions changed: {destination.name}")
    temporary.replace(destination)
    print(f"{scene}: {image.width} × {image.height}, lossless WebP")
