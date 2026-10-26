/**
 * The organisation's logo, as a data URL a CSS mask can paint.
 *
 * Same contract as the product name and the accent: a per-organisation build
 * sets one env var, and the OSS build has none — `null` means "this build has
 * no logo", and every consumer renders nothing rather than a placeholder.
 *
 * The value is a base64 `data:image/svg+xml` URL produced by
 * `scripts/flavor-config.mjs` from the flavor's `logo` file. It is painted as
 * a mask over `currentColor`, so the mark takes the surrounding foreground
 * colour and reads correctly in both themes without a second asset.
 *
 * Only that one URL shape is accepted. The value reaches CSS as a `url(...)`
 * in a mask, so an `http(s)` or `file` URL arriving through a mis-set env var
 * would make the app fetch a remote asset at paint time; an unparsed
 * `data:text/html` would be a different kind of surprise again. Anything that
 * is not an inline SVG data URL is dropped.
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
