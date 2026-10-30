import { register } from "node:module";

import { i18n } from "@lingui/core";

register("./test-loader-hooks.mjs", import.meta.url);

/**
 * Activate a locale for the whole test process.
 *
 * `test-loader-hooks.mjs` expands the Lingui macros, so a module under test
 * calls `i18n._()` exactly as it does in the app. What a test process lacks is
 * the activation the app always performs before its first render
 * (`AppI18nProvider` → `activateLocale`). Without one, every `t` and `<Trans>`
 * throws "Attempted to call a translation function without setting a locale" —
 * which reads as a bug in the module under test rather than as an
 * unconfigured runtime, and it fires in files that never mention i18n and only
 * happen to render a converted helper.
 *
 * The catalogue is deliberately empty rather than the compiled `en` one. With
 * no entry for an id, Lingui falls back to the `message` the macro inlined —
 * the source English, which is what every existing assertion was written
 * against. Loading the real `en` catalogue would add a second source of truth
 * for the same strings and make a catalogue edit able to break an unrelated
 * unit test.
 *
 * German output is asserted two other ways, neither of which needs the
 * catalogue here: `Intl`-derived copy (dates, relative times, lists) is tested
 * directly against a `de` locale in unit tests, and translated copy is
 * asserted in the app by `tests/e2e/i18n-appearance.spec.ts` and
 * `tests/e2e/sidebar-german-screenshots.spec.ts`, which run the real `.po`
 * through the real compile step.
 */
i18n.loadAndActivate({ locale: "en", messages: {} });
