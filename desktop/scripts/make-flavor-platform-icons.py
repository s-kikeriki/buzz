#!/usr/bin/env python3
"""Derive a flavor's Windows and Linux icons from its committed macOS `.icns`.

Run: desktop/scripts/make-flavor-platform-icons.py <flavor-id>

`tauri.conf.json` names five icons, and only one of them is macOS's:

    icons/32x32.png  icons/128x128.png  icons/128x128@2x.png
    icons/icon.icns  icons/icon.ico

A flavor used to declare the `.icns` alone, so a Windows or Linux build of a
fully branded flavor wore the Buzz bee on the taskbar and in the launcher. This
writes the other four from the flavor's own `.icns` and names them in the
flavor's `platformIcons` map, which `stage-flavor-icons.mjs` copies into place
before a bundle is built.

## Why derive rather than take a second master

The `.icns`'s own 1024px image is the master artwork — verified pixel-identical
to `kikeriki/00_brand/output/2026-10-19-app-icon/kikeriki-icon-1024.png`. Taking
the raster out of the committed icon makes the whole set reproducible from a
checkout, and makes "Windows carries the same artwork macOS does" a fact a
reviewer can re-derive rather than a claim. A second master file alongside it
could drift from the shipped icon without anything noticing, which is the exact
shape of bug that shipped a square icon to Verena's Mac.

## Why the Apple margin is cropped off

macOS wants the artwork inset: Apple's template puts an 824x824 body inside a
1024 canvas, and `ki.keriki.icns` bakes in both that margin and the squircle.
Windows and Linux do not inset anything — the stock Buzz `32x32.png` and
`icon.ico` are full-bleed to the pixel (corner alpha 255) — so carrying the
macOS margin across would draw ki.keriki ~20% smaller than every neighbour in
the Windows taskbar. So the body is cropped out of the canvas and scaled to
fill. The shape and the colours are untouched: the squircle's transparent
corners come along, which is what both platforms want anyway.

The `.ico` carries the same six sizes the stock `icon.ico` does, so the Windows
bundler has no size to fall back on that we did not draw.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover - a developer's missing dependency
    sys.exit("Pillow is required: pip install Pillow")

DESKTOP_DIR = Path(__file__).resolve().parent.parent

# The non-macOS entries of `tauri.conf.json`'s `bundle.icon`, mapped to the
# pixel size each one has to be. `128x128@2x` is 256, which is the one pair
# where the filename and the dimensions disagree.
PNG_TARGETS = {
    "32x32.png": 32,
    "128x128.png": 128,
    "128x128@2x.png": 256,
}
# The size list inside `src-tauri/icons/icon.ico`, matched exactly.
ICO_SIZES = [16, 24, 32, 48, 64, 256]


def flavor_icns(flavor_id: str) -> Path:
    """The flavor's declared macOS icon, as an absolute path."""
    out = subprocess.run(
        [
            "node",
            str(DESKTOP_DIR / "scripts" / "flavor-config.mjs"),
            flavor_id,
            "--json",
            "--allow-frozen",
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    flavor = json.loads(out.stdout)
    return DESKTOP_DIR / flavor["icon"]


def master_raster(icns: Path) -> Image.Image:
    """The 1024px image inside an `.icns`, cropped to the artwork's own body.

    Pillow reads an `.icns` at its largest size, so this is the 512@2x member.
    The crop is the alpha bounding box rather than a hardcoded (100, 100,
    924, 924): a regenerated icon with a different margin still produces a
    correct full-bleed set, and an icon that is already full-bleed is a no-op
    rather than a 20% crop into the artwork.
    """
    image = Image.open(icns).convert("RGBA")
    if image.size != (1024, 1024):
        sys.exit(f"{icns}: expected a 1024px member, got {image.size}")
    box = image.getchannel("A").getbbox()
    if box is None:
        sys.exit(f"{icns}: fully transparent")
    body = image.crop(box)
    if body.width != body.height:
        sys.exit(f"{icns}: artwork body is {body.size}, expected a square")
    return body


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("flavor_id", help="a flavor id, e.g. ki.keriki")
    args = parser.parse_args()

    icns = flavor_icns(args.flavor_id)
    body = master_raster(icns)
    out_dir = icns.parent
    stem = icns.stem

    written = []
    for name, size in PNG_TARGETS.items():
        target = out_dir / f"{stem}-{name}"
        body.resize((size, size), Image.LANCZOS).save(target, format="PNG")
        written.append(target)

    # Pillow writes an `.ico` from one image plus a size list, but it
    # downsamples each member itself with a filter we do not pick. Resizing
    # every member here with LANCZOS first, and handing them over as an
    # explicit append list, keeps the small sizes as sharp as the PNGs.
    members = [body.resize((s, s), Image.LANCZOS) for s in ICO_SIZES]
    ico = out_dir / f"{stem}.ico"
    members[-1].save(
        ico,
        format="ICO",
        sizes=[(s, s) for s in ICO_SIZES],
        append_images=members[:-1],
    )
    written.append(ico)

    print(f"from {icns.relative_to(DESKTOP_DIR)} (body {body.width}px):")
    for path in written:
        print(f"  {path.relative_to(DESKTOP_DIR)}")


if __name__ == "__main__":
    main()
