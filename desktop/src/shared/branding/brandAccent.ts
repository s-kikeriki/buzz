/**
 * Accent a build starts on before the user picks one.
 *
 * Same contract as the product name: a per-organisation build sets one env
 * var, the OSS build keeps its own default. Only `#rrggbb` is accepted — the
 * value becomes a CSS colour, so a malformed one would silently produce an
 * unstyled accent rather than an error.
 */
export const DEFAULT_ACCENT_COLOR = "#3b82f6";

/** Normalise a configured accent, falling back to the OSS default. */
export function parseDefaultAccentColor(configured: unknown): string {
  if (typeof configured !== "string") {
    return DEFAULT_ACCENT_COLOR;
  }
  const trimmed = configured.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(trimmed) ? trimmed : DEFAULT_ACCENT_COLOR;
}
