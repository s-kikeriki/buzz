import assert from "node:assert/strict";
import test from "node:test";

// `brand.ts` reads `import.meta.env` at module load, which the plain Node test
// runner has no Vite shim for. The parser lives in its own module so these
// tests bind the production code path rather than a copy of the regex.
import { parseDefaultAccentColor } from "./brandAccent.ts";

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
