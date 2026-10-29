/**
 * The emoji this build throws when a key backup verifies.
 *
 * The stock set is `🎉 ✨ 🐝 🍯 🔑 💛` — two of those six are the Buzz mascot
 * and its honey, so a de-branded build that converted every string and every
 * mark still showered the user in bees at the one moment the flow celebrates.
 *
 * Unset is the OSS answer and keeps the full stock set, so a flavor that says
 * nothing is unchanged. Same opt-in default as `brandThemeLabel.ts`, and for
 * the same reason: a build that configured nothing must look exactly like the
 * trunk.
 *
 * Its own module, like `brandAccent.ts` and `brandThemeLabel.ts`, because
 * `BRAND` reads `import.meta.env` at module load and the unit-test runner has
 * no Vite shim — the parser has to be testable without one.
 *
 * ## Why the transport is comma-separated and the flavor rejects commas
 *
 * The value crosses from a JSON array in the flavor file to one string in the
 * build environment and back to an array here. A comma inside an entry would
 * arrive as two entries, silently, with nothing in the build log to say so.
 * `flavor-config.mjs` refuses a comma in any entry rather than letting this
 * parser guess where the boundary was — the split is the same operation in
 * both halves, so neither side can quietly disagree with the other.
 */

/** The stock set, used whenever a build configures none. */
export const DEFAULT_CELEBRATION_EMOJIS = [
  "🎉",
  "✨",
  "🐝",
  "🍯",
  "🔑",
  "💛",
] as const;

/**
 * Parse the configured set, falling back to the stock one.
 *
 * An empty or whitespace-only list falls back rather than yielding an empty
 * array: no emoji renders a burst of nothing, which reads as a broken
 * animation instead of as an unset variable.
 */
export function parseCelebrationEmojis(configured: unknown): string[] {
  if (typeof configured !== "string") {
    return [...DEFAULT_CELEBRATION_EMOJIS];
  }
  const parsed = configured
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return parsed.length > 0 ? parsed : [...DEFAULT_CELEBRATION_EMOJIS];
}
