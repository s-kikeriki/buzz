/**
 * Which files the Lingui macro pass must run over, for both pipelines.
 *
 * The macros are compile-time only, and two separate places expand them: the
 * Vite plugin (`scripts/vite-plugin-lingui-macro.mjs`) for the app bundle, and
 * the Node loader (`test-loader-hooks.mjs`) for the unit tests. They used to
 * carry their own extension lists, and the lists drifted: the loader matched
 * `.mjs` and the plugin did not. The result was the worst possible split —
 * `desktop/src/features/projects/projectIssues.mjs` passed every unit test
 * while the shipped bundle kept its macro import and threw "the macro you
 * imported from @lingui/core/macro is being executed outside the context of
 * compilation" on load, blanking the whole app. `tsc`, `biome`, the build and
 * the unit suite were all green.
 *
 * So the decision lives here once and both callers import it. Keeping the two
 * expanders is fine; keeping two answers to "is this a source file" is not.
 */

const MACRO_SPECIFIERS = ["@lingui/core/macro", "@lingui/react/macro"];

/** `.mjs`/`.cjs`/`.mts`/`.cts` included — `desktop/src` has plain ESM in it. */
const SOURCE_EXTENSION = /\.[cm]?[jt]sx?(?:\?.*)?$/;

/**
 * True when `id` is app source the macro pass should see.
 *
 * Accepts a bare path, a Vite id with a `?v=` query, or a `file://` URL, so
 * both callers can pass what they already have.
 */
export function isLinguiMacroSource(id) {
  if (id.includes("/node_modules/")) return false;
  if (id.endsWith(".d.ts")) return false;
  return SOURCE_EXTENSION.test(id);
}

/** True when `source` imports a Lingui macro entrypoint. */
export function hasLinguiMacroImport(source) {
  return MACRO_SPECIFIERS.some((specifier) => source.includes(specifier));
}
