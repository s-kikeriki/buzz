# Flavor icons

Each flavor's `icon` field names a path in here, e.g.
`flavors/icons/zeniad.icns`. Keeping the icon in the repo is what makes a
flavor buildable from a checkout alone, and
`scripts/flavor-config.test.mjs` fails if a buildable flavor names an icon
that is not here.

`.icns` on macOS. A flavor that is never built for macOS may point at the
format its own platform needs; nothing here validates the extension, only that
the path is repo-relative.

## What belongs here

Our own brand marks, and nothing else.

| File | Flavor | Field |
|---|---|---|
| `ki.keriki.icns` | `ki.keriki.json` | `icon` |
| `ki.keriki-32x32.png` | `ki.keriki.json` | `platformIcons["32x32.png"]` |
| `ki.keriki-128x128.png` | `ki.keriki.json` | `platformIcons["128x128.png"]` |
| `ki.keriki-128x128@2x.png` | `ki.keriki.json` | `platformIcons["128x128@2x.png"]` |
| `ki.keriki.ico` | `ki.keriki.json` | `platformIcons["icon.ico"]` |
| `ki.keriki-tray.png` | `ki.keriki.json` | `trayIcon` |
| `ki.keriki-dmg-background.png` | `ki.keriki.json` | `dmgBackground` |
| `zeniad.icns` | `zeniad.json` | `icon` |

## Windows and Linux

`tauri.conf.json` bundles five icons and `icon` only covers the macOS one, so
a Windows or Linux bundle of a fully branded flavor wore the Buzz bee: the
`.ico` on the taskbar and in Add/Remove Programs, the PNGs in the Linux
launcher and app menu. `platformIcons` declares the other four, keyed by the
file in `src-tauri/icons/` each one stands in for, and
`scripts/stage-flavor-icons.mjs <flavor-id>` copies them into place before
`tauri build` runs. It is all four or none — a flavor that declared the `.ico`
alone would produce a branded Windows installer and a Linux launcher still
showing the bee, from the same command.

`scripts/make-flavor-platform-icons.py <flavor-id>` regenerates the set from
the flavor's own `.icns`, which is the master artwork: the 1024px member of
`ki.keriki.icns` is pixel-identical to
`kikeriki/00_brand/output/2026-10-19-app-icon/kikeriki-icon-1024.png`. Deriving
from the committed icon rather than from a second master is what makes "Windows
carries the same artwork macOS does" re-derivable from a checkout instead of a
claim. **Regenerate them whenever the `.icns` changes** — nothing couples the
two automatically, and a new `.icns` with the old PNGs ships two different
icons for one app.

**The Apple margin comes off for the other two platforms.** macOS wants the
artwork inset — Apple's template puts an 824x824 body inside a 1024 canvas, and
`ki.keriki.icns` bakes in both that margin and the squircle. Windows and Linux
inset nothing; the stock Buzz `32x32.png` and `icon.ico` are full-bleed to the
pixel, corner alpha 255. Carrying the macOS margin across would draw ki.keriki
about 20% smaller than every neighbour in the Windows taskbar, so the generator
crops to the artwork's alpha bounding box and scales that to fill. The shape
and the colours are untouched: the squircle's transparent corners come along,
which is what both platforms want anyway.

`ki.keriki.ico` carries the same six sizes (16, 24, 32, 48, 64, 256) the stock
`icon.ico` does, so Windows has no size to fall back on that we did not draw,
and the test holds it to that list rather than to a number — the stock file is
the comparison.

## The menu-bar glyph

`trayIcon` is a **macOS template image**: black ink on transparent, read for
its alpha alone, because AppKit tints it itself for a light or dark menu bar.
`src-tauri/src/brand.rs` decodes it with `png` and hands AppKit the raw RGBA,
so it has to be a raster — nothing in the Rust build can rasterise an SVG, and
an `.svg` here is refused rather than silently falling back to the Buzz bee.

`ki.keriki-tray.png` is 38x43, rendered from `logos/ki.keriki-mark.svg` with
every fill forced to black and the viewBox trimmed to the ink. 43px tall is
the Buzz bee's own height, so the brand glyph occupies the same space in the
menu bar as the one it replaces. The `ki` counters come through as holes in
the alpha, which is what keeps it from reading as a filled blob at 22pt.

## The DMG panel

`dmgBackground` is the picture behind the drag-to-Applications window — the
first thing anyone sees of the app, before it is even installed.
`scripts/package-macos-dmg.sh` reads it from `DMG_BACKGROUND`; with no flavor
value it keeps `src-tauri/icons/dmg-background.png`, which is Buzz's.

Every ki.keriki DMG so far has in fact shown a kikeriki panel, by a build
wrapper that overwrote the repo's file for the duration of the build from an
asset living outside the checkout. That works and is invisible: the panel is
absent from the diff, and a build on any other machine ships the Buzz one.
1320x1000 at 144 dpi, matching the stock file — `verify-macos-dmg.sh` checks
the DPI, and a 72 dpi panel renders at double size in the Finder window.

**Bake the rounding into the icon, do not inherit it.** `ki.keriki.icns` is
the squircle-masked build (sha256 `171d08b6…`), replacing a full-bleed opaque
square. macOS 26 auto-masks an app icon into the squircle, so the square one
looked correct on a current Mac and shipped as a hard-edged tile on an older
one — same bytes, two renderers, and the machine that showed the defect was a
user's. It is built from
`kikeriki/00_brand/output/2026-10-19-app-icon/`, whose README holds the
Apple-template geometry.

**A client's artwork never goes in this repository.** It is a public fork, so
committing a client icon publishes it. A per-client flavor keeps its `.icns`
outside the checkout and places it at the path its flavor names before
building — which is also why the presence check above skips `frozen` and
`example` flavors rather than demanding every declared icon exist.

`KI.keri.KI.json` is frozen and refuses to build without `--allow-frozen`, so
its icon is deliberately absent; it is the same mark as `ki.keriki.icns` if it
is ever needed again.
