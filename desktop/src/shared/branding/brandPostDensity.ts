/**
 * Whether a long top-level post is collapsed to a preview in the channel.
 *
 * A long post currently renders in full in the middle pane, so one person
 * pasting a wall of text pushes everyone else's conversation off the screen.
 * That is the behaviour the "open a thread for anything long" convention
 * exists to work around, and a convention is a rule people forget. Collapsing
 * the post to a few lines and opening its thread on click makes the pane do
 * it instead.
 *
 * Off by default, so the OSS build is unchanged: this is a reading-density
 * choice about how a particular organisation's channels are used, not a
 * defect being fixed, and Buzz's own channels do not have the problem to the
 * same degree.
 *
 * Kept in its own module for the same reason `brandChrome.ts` is: `BRAND`
 * reads `import.meta.env` at module load, which the unit-test runner has no
 * Vite shim for, so the parser has to be testable without one.
 */

/**
 * Normalise the configured flag, defaulting to off.
 *
 * Only the exact string `"1"` enables it — the same shape
 * `BUZZ_BUILD_AUTO_CONNECT_DEFAULT_RELAY` already uses on the Rust side, and
 * narrow on purpose. A variable that arrives as `"false"`, `"0"` or `""`
 * reads as *off* under this rule, where a truthiness test would turn two of
 * those three into *on*.
 */
export function parseCollapseLongPosts(configured: unknown): boolean {
  return typeof configured === "string" && configured.trim() === "1";
}
