import assert from "node:assert/strict";
import test from "node:test";

import { checkFileForHardcodedLocales } from "./check-intl-locale-core.mjs";

const FILE = "Example.ts";

async function findings(source) {
  return await checkFileForHardcodedLocales(FILE, source);
}

test("flags a hardcoded tag on an Intl constructor", async () => {
  const result = await findings(`
    const f = new Intl.DateTimeFormat("en-US", { month: "short" });
  `);
  assert.equal(result.length, 1);
  assert.equal(result[0].kind, "intl:DateTimeFormat");
  assert.equal(result[0].text, "en-US");
});

test("covers every Intl constructor that takes a locale", async () => {
  const result = await findings(`
    new Intl.Collator("en-US");
    new Intl.NumberFormat("en-US");
    new Intl.PluralRules("en-US");
    new Intl.RelativeTimeFormat("en-US");
    new Intl.ListFormat("en-US");
    new Intl.Segmenter("en-US");
    new Intl.DisplayNames("en-US", { type: "language" });
  `);
  assert.equal(result.length, 7);
});

test("accepts a tag computed from the app locale", async () => {
  const result = await findings(`
    import { intlLocale } from "@/shared/lib/intlLocale";
    const f = (locale) => new Intl.DateTimeFormat(intlLocale(locale), {});
  `);
  assert.deepEqual(result, []);
});

test("flags a locale array that contains a literal", async () => {
  const result = await findings(`
    const f = new Intl.NumberFormat(["en-US", "en-GB"]);
  `);
  assert.equal(result.length, 1);
  assert.equal(result[0].text, "en-US, en-GB");
});

test("flags an omitted locale, which means the host's", async () => {
  // The worse shape: it reads as "use the default" and means the operating
  // system's language, which is not the app's setting.
  const result = await findings(`
    const label = date.toLocaleDateString();
  `);
  assert.equal(result.length, 1);
  assert.equal(result[0].kind, "method:toLocaleDateString");
  assert.equal(result[0].text, "(no locale)");
});

test("flags an explicit undefined locale the same way", async () => {
  const result = await findings(`
    const label = date.toLocaleString(undefined, { month: "short" });
  `);
  assert.equal(result.length, 1);
  assert.equal(result[0].text, "undefined");
});

test("flags a hardcoded tag on toLocale*String too", async () => {
  const result = await findings(`
    const label = date.toLocaleTimeString("en-US");
  `);
  assert.equal(result.length, 1);
  assert.equal(result[0].text, "en-US");
});

test("accepts toLocale*String with a computed locale", async () => {
  const result = await findings(`
    const label = (tag) => date.toLocaleDateString(tag, { month: "short" });
  `);
  assert.deepEqual(result, []);
});

test("leaves case folding alone", async () => {
  // A comparison must be locale-invariant, not follow the interface language:
  // Turkish folds I to a dotless ı. Pointing these at the app locale would
  // make search matching depend on the user's language.
  const result = await findings(`
    const key = value.toLocaleLowerCase();
    const shout = value.toLocaleUpperCase();
  `);
  assert.deepEqual(result, []);
});

test("does not mistake a same-named method on something else", async () => {
  const result = await findings(`
    const f = formatter.format("en-US");
    const g = helper.toLocale("en-US");
  `);
  assert.deepEqual(result, []);
});

test("does not mistake a non-Intl namespace", async () => {
  const result = await findings(`
    const f = new Fake.DateTimeFormat("en-US");
  `);
  assert.deepEqual(result, []);
});
