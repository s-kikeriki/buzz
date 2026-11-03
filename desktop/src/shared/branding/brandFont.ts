/**
 * The interface font this build paints its text in.
 *
 * Unlike every other brand value, naming a font is only half the change: the
 * webview renders nothing it was not given the bytes for, and a family it
 * cannot resolve falls back silently to the next entry in the stack. So the
 * set below is closed, and each entry is a family `main.tsx` imports a
 * `@fontsource` stylesheet for. `flavor-config.mjs` refuses any other value
 * at load, which makes the two lists one decision rather than two that can
 * drift; this parser is the second gate, for a build environment set by hand.
 *
 * Unset is the OSS answer and leaves the stock Inter stack alone, so a flavor
 * that says nothing is unchanged.
 *
 * Its own module, like `brandAccent.ts` and `brandThemeLabel.ts`, and for the
 * same reason: `BRAND` reads `import.meta.env` at module load and the
 * unit-test runner has no Vite shim, so the parser has to be testable without
 * one.
 */

/**
 * The families the app ships a woff2 for, mapped to the CSS stack each one
 * heads.
 *
 * The tail of every stack is the trunk's own, so a glyph the brand font has
 * no cut for — and the whole of a first paint before the woff2 is decoded —
 * lands on the same fallbacks Buzz has always used rather than on whatever
 * the operating system calls a default.
 */
const FONT_STACKS: Record<string, string> = {
  Inter: '"Inter Variable", Inter, "Avenir Next", "Segoe UI", sans-serif',
  Poppins:
    'Poppins, "Inter Variable", Inter, "Avenir Next", "Segoe UI", sans-serif',
};

/** The stack a build that configured no font keeps. */
export const DEFAULT_FONT_STACK = FONT_STACKS.Inter;

/**
 * The configured family's CSS stack, or `null` when this build configured
 * none or named a family it does not bundle.
 *
 * An unknown family is `null`, not the name itself: emitting it would produce
 * a stack whose first entry resolves on the designer's machine and nowhere
 * else, which is the failure mode that is hardest to see in a screenshot and
 * impossible to see in a build log.
 */
export function parseBrandFontStack(configured: unknown): string | null {
  if (typeof configured !== "string") {
    return null;
  }
  return FONT_STACKS[configured.trim()] ?? null;
}

/**
 * The configured family's own name, or `null` as above.
 *
 * Separate from the stack because the two are read for different things: the
 * stack is what CSS needs, and the name is what a read-back check looks for
 * in a built bundle.
 */
export function parseBrandFontFamily(configured: unknown): string | null {
  if (typeof configured !== "string") {
    return null;
  }
  const trimmed = configured.trim();
  return trimmed in FONT_STACKS ? trimmed : null;
}
