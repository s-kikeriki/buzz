/**
 * What this build calls the first-party theme pair in the appearance picker.
 *
 * The pair's internal names — `buzz` and `buzz-dark` — are identifiers: they
 * are what `localStorage` holds, what `resolveShikiThemeName` maps, and what
 * every `data-buzz-theme` rule in `theme.css` matches. Renaming them would
 * move a user's stored selection to a theme that no longer exists. So this
 * changes only the words on the tile, and only for a build that asks.
 *
 * Unset is the OSS answer and leaves the labels as "Buzz" / "Buzz Dark", so a
 * flavor that says nothing is unchanged. That default is load-bearing: a
 * fallback to the product name would silently rename the theme in every
 * existing flavor, which is the opposite of opting in.
 *
 * Its own module, like `brandAccent.ts` and `brandChrome.ts`, and for the same
 * reason: `BRAND` reads `import.meta.env` at module load and the unit-test
 * runner has no Vite shim, so the parser has to be testable without one.
 */

/**
 * Normalise the configured theme label, or `null` when this build configured
 * none.
 *
 * Whitespace-only is `null` rather than an empty label: an empty string would
 * render a nameless tile, which reads as a broken theme rather than as an
 * unset variable.
 */
export function parseThemeLabel(configured: unknown): string | null {
  if (typeof configured !== "string") {
    return null;
  }
  const trimmed = configured.trim();
  return trimmed.length > 0 ? trimmed : null;
}
