import assert from "node:assert/strict";
import test from "node:test";

// Same reason as `brand.test.mjs`: the consumer reads `import.meta.env` and
// the plain Node runner has no Vite shim, so the parser lives in its own
// module and these tests bind the production code path.
import {
  BRAND_DEFAULT_LOCALES,
  parseBrandDefaultLocale,
} from "./brandLocale.ts";

test("an unset build configures no language and is told so", () => {
  // `null`, not `"en"`. The caller distinguishes "this build asked for
  // English" from "this build asked for nothing", because the second means
  // follow the operating system and the first means do not. Collapsing them
  // would silently pin every existing flavor to English.
  for (const unset of [undefined, null, 7, {}, [], "", "   "]) {
    assert.equal(parseBrandDefaultLocale(unset), null);
  }
});

test("a shipped catalogue is accepted", () => {
  for (const locale of BRAND_DEFAULT_LOCALES) {
    assert.equal(parseBrandDefaultLocale(locale), locale);
  }
  assert.equal(parseBrandDefaultLocale("  de  "), "de");
});

test("the pseudo-locale is refused", () => {
  // It is the generated overflow-proofing locale and is never selectable in a
  // shipped build, so a flavor defaulting to it would strand users in
  // unreadable accented copy with the control to escape it not rendered.
  assert.equal(parseBrandDefaultLocale("pseudo"), null);
  assert.ok(!BRAND_DEFAULT_LOCALES.includes("pseudo"));
});

test("a language this build ships no catalogue for is refused", () => {
  // Returning it would set the app to a locale with no messages, which
  // renders as untranslated English with a German date format — worse than
  // either language on its own, and invisible in a build log.
  for (const unknown of ["fr", "de-AT", "DE", "en_US"]) {
    assert.equal(parseBrandDefaultLocale(unknown), null);
  }
});
