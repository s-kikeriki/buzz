import assert from "node:assert/strict";
import { parseCollapseLongPosts } from "./brandPostDensity.ts";
import test from "node:test";

// `brand.ts` reads `import.meta.env` at module load, which the plain Node test
// runner has no Vite shim for. The parser lives in its own module so these
// tests bind the production code path rather than a copy of the regex.
import {
  parseConfiguredAccentColor,
  parseDefaultAccentColor,
} from "./brandAccent.ts";

test("a well-formed accent is taken as-is", () => {
  assert.equal(parseDefaultAccentColor("#a1b2c3"), "#a1b2c3");
});

test("case and surrounding whitespace are normalised", () => {
  assert.equal(parseDefaultAccentColor("  #A1B2C3\n"), "#a1b2c3");
});

test("an unset or malformed accent falls back to the OSS default", () => {
  // A bad value must not reach CSS: it would render an unstyled accent rather
  // than fail, which is the hardest kind of branding defect to notice.
  for (const bad of [
    undefined,
    null,
    "",
    "   ",
    "#abc",
    "#a1b2c",
    "#a1b2c3d",
    "blue",
    "rgb(1,2,3)",
    "#a1b2g3",
    123,
  ]) {
    assert.equal(parseDefaultAccentColor(bad), "#3b82f6");
  }
});

test("an unconfigured build is distinguishable from one that chose blue", () => {
  // The Buzz themes pin a neutral accent unless the build asked for one, so
  // collapsing "unset" into the OSS default here would make every OSS install
  // render a brand accent it never configured.
  assert.equal(parseConfiguredAccentColor("#d4f247"), "#d4f247");
  assert.equal(parseConfiguredAccentColor("  #D4F247 "), "#d4f247");
  for (const unset of [undefined, null, "", "   ", "#abc", "blue", 123]) {
    assert.equal(parseConfiguredAccentColor(unset), null);
  }
  // And the defaulting wrapper still answers with the OSS colour.
  assert.equal(parseDefaultAccentColor(undefined), "#3b82f6");
});

test("the collapse flag is on only for an explicit 1", () => {
  // Narrow on purpose. A truthiness test turns "0" and "false" into *on*,
  // which is the wrong direction for a flag that changes how every post in
  // the channel is read — the safe default is the stock behaviour.
  assert.equal(parseCollapseLongPosts("1"), true);
  assert.equal(parseCollapseLongPosts(" 1 "), true);
  for (const configured of [
    undefined,
    null,
    "",
    "   ",
    "0",
    "true",
    "false",
    "yes",
    1,
    true,
    {},
  ]) {
    assert.equal(
      parseCollapseLongPosts(configured),
      false,
      `${JSON.stringify(configured)} must not enable collapsing`,
    );
  }
});
