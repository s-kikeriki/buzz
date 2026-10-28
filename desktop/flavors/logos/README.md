# Flavor logos

A flavor's optional `logo` field names a path in here, e.g.
`flavors/logos/ki.keriki.svg`. It is the in-app brand mark — currently the
bottom of the sidebar, next to the profile card — and is separate from `icon`,
which is the macOS app icon and never appears inside the window.

`logo` is optional. A flavor without one renders no mark at all, which is what
the OSS trunk does.

## What the file has to be

An **SVG**, in both styles. `scripts/flavor-config.mjs` base64-encodes it into
`VITE_BUZZ_PRODUCT_LOGO`, and `shared/branding/brandLogo.ts` accepts nothing
but an inline SVG data URL — a raster is not a mark that renders badly, it is
one that is dropped at paint time while the build log says nothing.

`logoStyle` then decides how `shared/ui/BrandLogo.tsx` paints it, and the two
values want different artwork:

| `logoStyle` | Painted as | The file must be |
|---|---|---|
| `mask` (default) | a CSS mask over `currentColor` | **single-colour**, drawn in `currentColor` |
| `color` | an `<img>`, colours intact | **self-coloured**, and legible on the surface it lands on |

**They are not interchangeable, and both failures are silent.** A multi-colour
file painted as a mask does not come out wrong-but-recognisable — every colour
in it collapses into one solid block in the shape of its own bounding box. A
`currentColor` file painted as an image inherits nothing and resolves to the
foreground of a page it is not part of, which in a dark sidebar is black on
black. `flavor-config.test.mjs` asserts each committed asset against the style
its flavor declares, in both directions.

Choose `mask` when the mark is one colour and the brand does not depend on
which. Choose `color` when the colours *are* the brand — and then, if one
drawing cannot carry both surfaces, add `logoLight` with the cut for the light
theme. `logoLight` is refused under `mask`, where it could never be displayed:
a mask already follows the theme.

Two more things worth getting right in the file itself:

- **Trim the viewBox to the ink.** Both styles size the asset `contain`, so
  padding baked into the viewBox shrinks the visible mark and misaligns it
  against the text beside it.
- **Keep the aspect ratio in the caller's class.** A mask box has no intrinsic
  size, and `object-contain` letterboxes an image into whatever box it is
  given, so `SidebarProfileCard` sets an explicit width and height — `2.5:1`
  today. Changing the proportions of the asset without changing them leaves
  the mark floating in a box that no longer fits it.

## What belongs here

Our own brand marks, and nothing else — the same rule as `flavors/icons/`.
This repository is a public fork, so committing a client's artwork publishes
it. A per-client flavor keeps its logo outside the checkout and places it at
the path its flavor names before building.

| File | Flavor | Shown in |
|---|---|---|
| `ki.keriki.svg` | `ki.keriki.json` `logo` | the dark theme |
| `ki.keriki-light.svg` | `ki.keriki.json` `logoLight` | the light theme |
| `ki.keriki-mark.svg` | `ki.keriki.json` `logoMark` | ink surfaces: the boot gate, the onboarding canvas |
| `ki.keriki-mark-light.svg` | `ki.keriki.json` `logoMarkLight` | light surfaces: the onboarding content card, the hosted-community dialog, a light-mode community switch |

`ki.keriki.svg` is the current kikeriki logo, taken unmodified from
`https://kikeriki.net/assets/kikeriki-logo.svg` (sha256 `f2afb6c4…`): the
wordmark in white, the speech bubble in `#F5F5F5`, and the lime `#D4F247`
shadow that the earlier single-colour wordmark could not carry.

## The light cut

That file is the **negative** mark, drawn for a dark surface — 17% lightness
in the dark theme and it reads cleanly, 94% in the light theme where the white
wordmark all but disappears and only the lime survives. kikeriki.net publishes
no positive variant, and the two people using this build are split across the
two themes, so `ki.keriki-light.svg` is a recolour of the same drawing, made
on Ian's instruction on 2026-10-26.

The rule is exact, so the file can be regenerated when the master changes:
**in the body of the SVG, every `fill="white"` and `fill="#F5F5F5"` becomes
`#0A0A0A`. The lime `#D4F247` is untouched, and the `fill="white"` on the
`clipPath` rect inside `<defs>` stays white** — it is a mask, not ink, and
darkening it would clip the whole mark away.

Nothing else may differ. `flavor-config.test.mjs` checks that the light cut is
not byte-identical to the dark one and that it paints no near-white ink, which
catches the two ways a regeneration goes wrong: the file not replaced, and the
file replaced by a copy of the master.

`BrandLogo` renders both cuts and lets the `dark` class on `<html>` choose, so
the mark follows a theme change in the same paint. Only one is displayed, so
only one is announced.

## The companion mark, and its own light cut

`logoMark` is the glyph-sized companion to the wordmark, for the slots that
want the brand at icon size: the drifting field on the onboarding landing, the
boot gate, the corner of every onboarding step. It is a **second asset, not a
crop of the first** — the wordmark is 669x268, and at 26px wide in the landing
field it is a smudge.

`logoMarkLight` is to `logoMark` what `logoLight` is to `logo`, by the same
exact rule: every `fill="white"` and `fill="#F5F5F5"` in the body becomes
`#0A0A0A`, the lime `#D4F247` is untouched, and anything inside `<defs>` stays
as it is. `ki.keriki-mark.svg` has no `<defs>`, so the recolour is the whole
of it.

It is not optional in the way the wordmark's cut is. `BrandMark` takes the
surface from its **call site** rather than from the document, because the
first-run flow has three surfaces that ignore the document mode — the ink
canvas is dark under a light document, the hosted-community dialog pins itself
light, and the backup step pins itself dark. A flavor with a mark and no light
cut paints the one it has on all of them, and the negative mark on the white
content card is invisible.

`flavor-config.test.mjs` checks the pair the same way it checks the wordmark's:
not byte-identical, no near-white ink in the light cut — and, for the mark,
that the dark cut *does* carry near-white ink, which catches the pair being
two copies of the same drawing in the other direction.
