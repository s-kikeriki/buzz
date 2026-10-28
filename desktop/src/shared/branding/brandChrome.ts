/**
 * Which surface the app's chrome is painted on.
 *
 * The navigation rail, the top chrome and the inset margin are one canvas;
 * the message panel is another. Until now both followed the document's
 * light/dark class together, so "dark rail, light panel" was not a thing the
 * theme could express — it was two states of one switch.
 *
 * kikeriki's own site runs a black header over a white body, and the brand's
 * ratified palette is the neutrals plus citron: an ink rail is the house
 * style rather than a dark mode. `ink` says the chrome stays on the dark
 * surface in both modes and only the content panel follows the document.
 *
 * `auto` is the Buzz behaviour and the default, so an unconfigured build is
 * unchanged. Kept in its own module for the same reason `brandAccent.ts` and
 * `brandLogo.ts` are: `BRAND` reads `import.meta.env` at module load, which
 * the unit-test runner has no Vite shim for, and the parser has to be
 * testable without one.
 */
export type ChromeSurface = "auto" | "ink";

/**
 * Normalise the configured chrome surface, defaulting to `auto`.
 *
 * Unset and unrecognised both fall back to `auto`: a mis-set variable then
 * renders the stock Buzz chrome, which is legible, rather than an ink rail
 * the rest of the build's colours were not chosen for.
 */
export function parseChromeSurface(configured: unknown): ChromeSurface {
  return typeof configured === "string" && configured.trim() === "ink"
    ? "ink"
    : "auto";
}
