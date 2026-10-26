# Flavor logos

A flavor's optional `logo` field names a path in here, e.g.
`flavors/logos/ki.keriki.svg`. It is the in-app brand mark — currently the
bottom of the sidebar, next to the profile card — and is separate from `icon`,
which is the macOS app icon and never appears inside the window.

`logo` is optional. A flavor without one renders no mark at all, which is what
the OSS trunk does.

## What the file has to be

A **single-colour SVG painted with `currentColor`**, not a raster and not a
multi-colour mark. `scripts/flavor-config.mjs` base64-encodes the file into
`VITE_BUZZ_PRODUCT_LOGO`, and `shared/ui/BrandLogo.tsx` paints it as a CSS
mask over the surrounding text colour. That is what lets one asset read
correctly in both the light and the dark theme; two files would drift apart.

The consequence is that **every colour in the file is discarded**. A
multi-colour logo does not come out wrong-but-recognisable — it comes out as a
solid block in the shape of its own bounding box. `flavor-config.mjs` rejects
anything that is not a `.svg`, and `flavor-config.test.mjs` asserts the
committed files pin no colour of their own, but neither can tell a one-colour
SVG from a ten-colour one. Look at the result.

Two more things worth getting right in the file itself:

- **Trim the viewBox to the ink.** The mask is sized `contain`, so padding
  baked into the viewBox shrinks the visible mark and misaligns it against the
  text beside it.
- **Keep the aspect ratio in the caller's class.** A mask box has no intrinsic
  size, so `BrandLogo` is given an explicit width and height. Changing the
  proportions of the asset without changing them letterboxes it.

## What belongs here

Our own brand marks, and nothing else — the same rule as `flavors/icons/`.
This repository is a public fork, so committing a client's artwork publishes
it. A per-client flavor keeps its logo outside the checkout and places it at
the path its flavor names before building.

| File | Flavor |
|---|---|
| `ki.keriki.svg` | `ki.keriki.json` |

`ki.keriki.svg` is the kikeriki wordmark, white in the original and recoloured
here to `currentColor`, taken from the brand library's
`kikeriki-Logo-neg_ohne-Zusatz.svg`.
