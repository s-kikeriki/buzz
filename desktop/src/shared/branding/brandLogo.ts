/**
 * The organisation's logo, as a data URL a CSS mask can paint.
 *
 * Same contract as the product name and the accent: a per-organisation build
 * sets one env var, and the OSS build has none — `null` means "this build has
 * no logo", and every consumer renders nothing rather than a placeholder.
 *
 * The value is a base64 `data:image/svg+xml` URL produced by
 * `scripts/flavor-config.mjs` from the flavor's `logo` file.
 * {@link parseProductLogoStyle} decides how it is painted.
 *
 * Only that one URL shape is accepted, whichever style paints it. In the mask
 * style the value reaches CSS as a `url(...)`, so an `http(s)` or `file` URL
 * arriving through a mis-set env var would make the app fetch a remote asset
 * at paint time; in the colour style it is an `<img src>`, where the same URL
 * is the same remote fetch. An unparsed `data:text/html` would be a different
 * kind of surprise again. Anything that is not an inline SVG data URL is
 * dropped.
 */
const SVG_DATA_URL = /^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+=*$/;

/** Normalise a configured logo, or `null` when this build has none. */
export function parseProductLogoUrl(configured: unknown): string | null {
  if (typeof configured !== "string") {
    return null;
  }
  const trimmed = configured.trim();
  return SVG_DATA_URL.test(trimmed) ? trimmed : null;
}

/** How the mark is painted. Mirrors `logoStyle` in the flavor file. */
export type ProductLogoStyle = "mask" | "color";

/**
 * Normalise the configured paint style, defaulting to `mask`.
 *
 * `mask` recolours the asset to the surrounding foreground, so one file reads
 * in both themes; `color` paints the asset as it is, for a mark whose own
 * colours are the brand. Unset and unrecognised both fall back to `mask`: a
 * mis-set variable then renders a legible mark in the wrong colour rather
 * than an illegible one in the right form.
 */
export function parseProductLogoStyle(configured: unknown): ProductLogoStyle {
  return typeof configured === "string" && configured.trim() === "color"
    ? "color"
    : "mask";
}
