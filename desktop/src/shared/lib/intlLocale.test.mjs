import assert from "node:assert/strict";
import test from "node:test";

import {
  intlLocale,
  localeDate,
  localeDateTime,
  localeDateTimeFormat,
  localeTime,
  resetLocaleFormattersForTests,
} from "./intlLocale.ts";

/** 2026-04-02 14:34:05 local. */
const SAMPLE = new Date(2026, 3, 2, 14, 34, 5);

test("each app locale maps to a BCP-47 tag", () => {
  assert.equal(intlLocale("en"), "en-US");
  assert.equal(intlLocale("de"), "de-DE");
});

test("pseudo is pinned to English rather than left to Intl's fallback", () => {
  // `pseudo` is not a language. An unmatched tag makes `Intl` use the runtime
  // default silently, so without this mapping the pseudo build's dates would
  // follow whatever locale the machine is in.
  assert.equal(intlLocale("pseudo"), "en-US");
});

test("a non-locale throws instead of resolving to the host locale", () => {
  // This is the guard that makes the whole conversion checkable: the unit
  // tests are `.mjs`, so TypeScript cannot stop a stale call site from
  // omitting the argument, and `Intl` would accept it and look right on a US
  // English machine.
  for (const bad of [undefined, null, "", "fr", "en-GB", "DE"]) {
    assert.throws(() => intlLocale(bad), /not an app locale/, String(bad));
  }
});

test("the formatter cache returns one instance per locale and option set", () => {
  resetLocaleFormattersForTests();

  const first = localeDateTimeFormat("en", { month: "short" });
  const again = localeDateTimeFormat("en", { month: "short" });
  assert.equal(first, again);

  // Option order is authored, not canonical, so the key sorts the entries.
  assert.equal(
    localeDateTimeFormat("en", { day: "numeric", month: "short" }),
    localeDateTimeFormat("en", { month: "short", day: "numeric" }),
  );

  // Same options, different locale: a shared instance here is the original bug.
  assert.notEqual(first, localeDateTimeFormat("de", { month: "short" }));
  assert.notEqual(first, localeDateTimeFormat("en", { month: "long" }));
});

test("resetting the cache drops the memoised formatters", () => {
  const before = localeDateTimeFormat("en", { year: "numeric" });
  resetLocaleFormattersForTests();
  assert.notEqual(before, localeDateTimeFormat("en", { year: "numeric" }));
});

test("localeDateTime matches toLocaleString's shape in the app's locale", () => {
  // The replacements exist because `toLocaleString()` with no argument takes
  // the operating system's locale, never the app's. The option sets reproduce
  // each method's default output, so a swapped call changes the locale only.
  assert.equal(localeDateTime(SAMPLE, "en"), "4/2/2026, 2:34:05 PM");
  assert.equal(localeDateTime(SAMPLE, "de"), "2.4.2026, 14:34:05");
});

test("localeDate and localeTime split the same way", () => {
  assert.equal(localeDate(SAMPLE, "en"), "4/2/2026");
  assert.equal(localeDate(SAMPLE, "de"), "2.4.2026");
  assert.equal(localeTime(SAMPLE, "en"), "2:34:05 PM");
  assert.equal(localeTime(SAMPLE, "de"), "14:34:05");
});

test("the replacements agree with the method they replace, under that locale", () => {
  // Pins the claim in the module comment — that swapping a `toLocale*String()`
  // call for one of these changes the locale and nothing else — rather than
  // trusting the hand-written option sets.
  assert.equal(localeDateTime(SAMPLE, "de"), SAMPLE.toLocaleString("de-DE"));
  assert.equal(localeDate(SAMPLE, "de"), SAMPLE.toLocaleDateString("de-DE"));
  assert.equal(localeTime(SAMPLE, "de"), SAMPLE.toLocaleTimeString("de-DE"));
  assert.equal(localeDateTime(SAMPLE, "en"), SAMPLE.toLocaleString("en-US"));
  assert.equal(localeDate(SAMPLE, "en"), SAMPLE.toLocaleDateString("en-US"));
  assert.equal(localeTime(SAMPLE, "en"), SAMPLE.toLocaleTimeString("en-US"));
});
