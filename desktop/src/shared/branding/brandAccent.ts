/**
 * Accent a build starts on before the user picks one.
 *
 * Same contract as the product name: a per-organisation build sets one env
 * var, the OSS build keeps its own default. Only `#rrggbb` is accepted — the
 * value becomes a CSS colour, so a malformed one would silently produce an
 * unstyled accent rather than an error.
 */
export const DEFAULT_ACCENT_COLOR = "#3b82f6";

/**
 * The accent this build was configured with, or `null` for an unconfigured
 * build.
 *
 * Kept separate from {@link parseDefaultAccentColor} because "the build asked
 * for this colour" and "nobody asked, so use ours" are different facts, and
 * one caller needs to tell them apart: the Buzz themes pin a neutral accent
 * and would otherwise discard a brand accent silently. Folding the fallback in
 * here would make an unconfigured OSS build look like one that chose blue.
 */
export function parseConfiguredAccentColor(configured: unknown): string | null {
  if (typeof configured !== "string") {
    return null;
  }
  const trimmed = configured.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(trimmed) ? trimmed : null;
}

/** Normalise a configured accent, falling back to the OSS default. */
export function parseDefaultAccentColor(configured: unknown): string {
  return parseConfiguredAccentColor(configured) ?? DEFAULT_ACCENT_COLOR;
}
