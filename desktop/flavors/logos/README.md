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
which. Choose `color` when the colours *are* the brand — then one asset has to
carry both themes on its own, because nothing recolours it.

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

| File | Flavor | Style |
|---|---|---|
| `ki.keriki.svg` | `ki.keriki.json` | `color` |

`ki.keriki.svg` is the current kikeriki logo, taken unmodified from
`https://kikeriki.net/assets/kikeriki-logo.svg` (sha256 `f2afb6c4…`): the
wordmark in white, the speech bubble in `#F5F5F5`, and the lime `#D4F247`
shadow that the earlier single-colour wordmark could not carry.

**It is the negative mark**, drawn for a dark surface. The dark theme's
sidebar is 17% lightness and it reads cleanly; the light theme's is 94%, where
the white wordmark all but disappears and only the lime shadow survives. That
is a known and accepted limitation of shipping the brand's own file unaltered:
there is no positive variant to switch to — kikeriki.net publishes this one —
and recolouring it here would be this repository restyling someone's logo. If
the light theme has to read, the fix is a second asset from the brand library,
not a change to this code.
