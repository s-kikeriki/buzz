import assert from "node:assert/strict";
import test from "node:test";

// Same reason as `brand.test.mjs`: `brand.ts` reads `import.meta.env` at
// module load and the plain Node runner has no Vite shim, so the parser lives
// in its own module and these tests bind the production code path.
import {
  DEFAULT_CELEBRATION_EMOJIS,
  parseCelebrationEmojis,
} from "./brandCelebration.ts";

test("the stock set still carries the bee and the honey", () => {
  // The fact the whole field exists for. If someone quietly removes these two
  // from the default, the trunk stops looking like Buzz and the change is
  // invisible in every flavored build.
  assert.ok(DEFAULT_CELEBRATION_EMOJIS.includes("🐝"));
  assert.ok(DEFAULT_CELEBRATION_EMOJIS.includes("🍯"));
});

test("an unset build gets the stock set", () => {
  for (const unset of [undefined, null, 7, {}, []]) {
    assert.deepEqual(parseCelebrationEmojis(unset), [
      ...DEFAULT_CELEBRATION_EMOJIS,
    ]);
  }
});

test("a configured set replaces the stock one entirely", () => {
  const parsed = parseCelebrationEmojis("🎉,✨,🔑");
  assert.deepEqual(parsed, ["🎉", "✨", "🔑"]);
  // Replaced, not merged: a flavor that drops the bee must not have it added
  // back by a default that unions rather than overrides.
  assert.ok(!parsed.includes("🐝"));
});

test("whitespace around entries is normalised", () => {
  assert.deepEqual(parseCelebrationEmojis(" 🎉 , ✨ "), ["🎉", "✨"]);
});

test("a list that would render nothing falls back instead of emptying", () => {
  // An empty array throws a burst of no particles, which reads as a broken
  // animation rather than as an unset variable.
  for (const empty of ["", "   ", ",", ", ,"]) {
    assert.deepEqual(
      parseCelebrationEmojis(empty),
      [...DEFAULT_CELEBRATION_EMOJIS],
      `${JSON.stringify(empty)} must fall back`,
    );
  }
});

test("the returned array is a copy, so a caller cannot mutate the default", () => {
  const first = parseCelebrationEmojis(undefined);
  first.push("💥");
  assert.deepEqual(parseCelebrationEmojis(undefined), [
    ...DEFAULT_CELEBRATION_EMOJIS,
  ]);
});
