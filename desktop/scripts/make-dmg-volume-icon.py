#!/usr/bin/env python3
"""Badge an app icon so the mounted DMG volume cannot be mistaken for the app.

Run: desktop/scripts/make-dmg-volume-icon.py <app-icon.icns> <volume-icon.icns>

A DMG whose .VolumeIcon.icns is a plain copy of the app's icon.icns produces a
Desktop icon identical to the installed app, so a mounted image reads as a
second copy of the app and stays mounted. The eject badge keeps the brand and
adds the one signal that was missing.

The badge is drawn at 4x and downsampled, so it stays clean at every icns
representation. Only the volume icon is produced; the app's own icon and the
shared artwork are intentionally untouched.
"""

# /// script
# requires-python = "==3.14.3"
# dependencies = ["Pillow==12.2.0"]
# ///

import argparse
from pathlib import Path
import subprocess
import tempfile

from PIL import Image, ImageDraw, ImageFilter

# iconutil rejects an iconset that is missing a representation it expects, and
# silently ignores names it does not know. These ten are the full macOS set.
REPRESENTATIONS = (
    ("icon_16x16.png", 16),
    ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32),
    ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512),
    ("icon_512x512@2x.png", 1024),
)

CANVAS = 1024
SCALE = 4  # supersampling factor for the badge geometry
BADGE_DIAMETER = 340
BADGE_INSET = 190  # badge centre, measured in from the bottom-right corner
GLYPH_WIDTH = 168
WHITE = (255, 255, 255, 255)
RING = (0, 0, 0, 38)
GLYPH = (28, 28, 30, 255)


def largest_representation(iconset):
    """Return the biggest square PNG in an extracted .iconset."""
    best = None
    for path in sorted(iconset.glob("*.png")):
        with Image.open(path) as image:
            size = min(image.size)
            if best is None or size > best[0]:
                best = (size, path)
    if best is None:
        raise SystemExit(f"No PNG representations in {iconset}")
    return best[1]


def draw_badge():
    """An eject glyph on a white disc, as an RGBA layer the size of the icon."""
    side = CANVAS * SCALE
    diameter = BADGE_DIAMETER * SCALE
    centre = (CANVAS - BADGE_INSET) * SCALE
    radius = diameter // 2
    box = (centre - radius, centre - radius, centre + radius, centre + radius)

    # The shadow is drawn on its own layer so the blur cannot bleed into the
    # disc's own edge, which is what makes the badge read as sitting on top.
    shadow = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse(box, fill=(0, 0, 0, 90))
    shadow = shadow.filter(ImageFilter.GaussianBlur(10 * SCALE))
    layer = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    layer.alpha_composite(shadow, (0, 8 * SCALE))

    draw = ImageDraw.Draw(layer)
    draw.ellipse(box, fill=WHITE, outline=RING, width=2 * SCALE)

    half = (GLYPH_WIDTH * SCALE) // 2
    draw.polygon(
        [
            (centre, centre - 76 * SCALE),
            (centre - half, centre - 4 * SCALE),
            (centre + half, centre - 4 * SCALE),
        ],
        fill=GLYPH,
    )
    draw.rounded_rectangle(
        (centre - half, centre + 22 * SCALE, centre + half, centre + 58 * SCALE),
        radius=10 * SCALE,
        fill=GLYPH,
    )
    return layer.resize((CANVAS, CANVAS), Image.LANCZOS)


def build(app_icon, output):
    with tempfile.TemporaryDirectory() as work:
        work = Path(work)
        source = work / "source.iconset"
        subprocess.run(
            ["iconutil", "--convert", "iconset", str(app_icon), "--output", str(source)],
            check=True,
        )
        with Image.open(largest_representation(source)) as image:
            base = image.convert("RGBA").resize((CANVAS, CANVAS), Image.LANCZOS)
        base.alpha_composite(draw_badge())

        iconset = work / "volume.iconset"
        iconset.mkdir()
        for name, size in REPRESENTATIONS:
            base.resize((size, size), Image.LANCZOS).save(iconset / name)
        output.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            ["iconutil", "--convert", "icns", str(iconset), "--output", str(output)],
            check=True,
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("app_icon", type=Path, help="the app bundle's icon.icns")
    parser.add_argument("output", type=Path, help="where to write the badged icns")
    args = parser.parse_args()
    if not args.app_icon.is_file():
        raise SystemExit(f"App icon not found: {args.app_icon}")
    build(args.app_icon, args.output)


if __name__ == "__main__":
    main()
