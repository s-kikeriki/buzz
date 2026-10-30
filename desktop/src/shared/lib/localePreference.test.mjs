import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  getLocale,
  initializeLocalePreference,
  localeFromOsPreference,
  osPreferredLocales,
  parseLocale,
  setLocale,
} from "./localePreference.ts";

/**
 * Replace `navigator` and `localStorage` for one case and put them back.
 *
 * `globalThis.navigator` exists in Node and is read-only, so it is replaced by
 * property definition rather than assignment — an assignment silently does
 * nothing there, which would leave every case below asserting Node's own
 * locale instead of the one it set up.
 */
function withEnvironment({ languages, language, stored }, body) {
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator",
  );
  const storageDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  const store = new Map(
    stored === undefined ? [] : [[LOCALE_STORAGE_KEY, stored]],
  );
  Object.defineProperty(globalThis, "navigator", {
    value: { languages, language },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, value),
    },
    configurable: true,
    writable: true,
  });
  try {
    return body(store);
  } finally {
    if (navigatorDescriptor)
      Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    else delete globalThis.navigator;
    if (storageDescriptor)
      Object.defineProperty(globalThis, "localStorage", storageDescriptor);
    else delete globalThis.localStorage;
  }
}

test("the setup helper really does replace navigator", () => {
  // Without this the suite below could pass by reading the host's own locale
  // and prove nothing about the mapping.
  withEnvironment({ languages: ["fr-CA"], language: "fr-CA" }, () => {
    assert.deepEqual(osPreferredLocales().slice(0, 2), ["fr-CA", "fr-CA"]);
  });
});

test("a German OS selects German, whatever the region", () => {
  for (const tag of ["de", "de-DE", "de-AT", "de_CH.UTF-8", "DE-de"]) {
    assert.equal(localeFromOsPreference([tag]), "de", tag);
  }
});

test("an English OS selects English", () => {
  for (const tag of ["en", "en-GB", "en_US.UTF-8"]) {
    assert.equal(localeFromOsPreference([tag]), "en", tag);
  }
});

test("a language we ship no catalogue for selects nothing", () => {
  // `null`, not `en`: the caller distinguishes "the OS asked for something we
  // have" from "the OS asked for Finnish", and only the second falls back.
  assert.equal(localeFromOsPreference(["fi-FI", "sv-SE"]), null);
});

test("the first supported tag wins, not the first tag", () => {
  // A Debian box with LANGUAGE=fi:de wants German over the default.
  assert.equal(localeFromOsPreference(["fi", "de", "en"]), "de");
});

test("the pseudo locale is unreachable from an OS preference", () => {
  // No OS reports it, and selecting it would strand a shipped build in
  // accented copy with no control rendered to escape.
  assert.equal(localeFromOsPreference(["pseudo"]), null);
});

test("junk in the tag list is skipped rather than throwing", () => {
  assert.equal(localeFromOsPreference([undefined, null, 7, "de"]), "de");
});

test("a German OS with nothing saved boots in German", () => {
  // The reported bug: `LANG=de_DE.UTF-8` and the app started in English.
  withEnvironment({ languages: ["de-DE"], language: "de-DE" }, () => {
    initializeLocalePreference();
    assert.equal(getLocale(), "de");
  });
});

test("detection does not write a preference", () => {
  // An explicit choice in Settings is the only thing that persists. Writing
  // the detected locale would freeze the first machine's language into a
  // profile that then stops following the OS.
  withEnvironment({ languages: ["de-DE"], language: "de-DE" }, (store) => {
    initializeLocalePreference();
    assert.equal(store.has(LOCALE_STORAGE_KEY), false);
  });
});

test("a saved preference outranks the OS", () => {
  withEnvironment(
    { languages: ["de-DE"], language: "de-DE", stored: "en" },
    () => {
      initializeLocalePreference();
      assert.equal(getLocale(), "en");
    },
  );
});

test("an unsupported OS language falls back to the default", () => {
  withEnvironment({ languages: ["fi-FI"], language: "fi-FI" }, () => {
    initializeLocalePreference();
    assert.equal(getLocale(), DEFAULT_LOCALE);
  });
});

test("an unrecognised stored value is still treated as a choice", () => {
  // It resolves to the default, as it always has — detection is for an absent
  // key only, so a value this build no longer knows does not silently flip
  // the UI to the machine's language.
  withEnvironment(
    { languages: ["de-DE"], language: "de-DE", stored: "klingon" },
    () => {
      initializeLocalePreference();
      assert.equal(getLocale(), DEFAULT_LOCALE);
    },
  );
});

test("choosing a language in Settings persists it", () => {
  withEnvironment({ languages: ["de-DE"], language: "de-DE" }, (store) => {
    initializeLocalePreference();
    setLocale("en");
    assert.equal(store.get(LOCALE_STORAGE_KEY), "en");
    assert.equal(getLocale(), "en");
  });
});

test("parseLocale still folds anything unknown to the default", () => {
  assert.equal(parseLocale("de"), "de");
  assert.equal(parseLocale(null), DEFAULT_LOCALE);
  assert.equal(parseLocale("de-DE"), DEFAULT_LOCALE);
});
