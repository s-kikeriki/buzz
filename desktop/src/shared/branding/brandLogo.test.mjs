import assert from "node:assert/strict";
import test from "node:test";

// Same reason as `brand.test.mjs`: the parser lives in its own module so these
// tests bind the production code path rather than a copy of the regex.
import { parseProductLogoStyle, parseProductLogoUrl } from "./brandLogo.ts";

const SVG = "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=";

test("an inline SVG data URL is taken as-is", () => {
  assert.equal(parseProductLogoUrl(SVG), SVG);
});

test("surrounding whitespace is trimmed", () => {
  assert.equal(parseProductLogoUrl(`  ${SVG}\n`), SVG);
});

test("a build with no logo configured gets null", () => {
  for (const unset of [undefined, null, "", "   ", 123, {}]) {
    assert.equal(parseProductLogoUrl(unset), null);
  }
});

test("the colour style is taken only from the exact word", () => {
  assert.equal(parseProductLogoStyle("color"), "color");
  assert.equal(parseProductLogoStyle("  color\n"), "color");
});

test("anything else is painted as a mask", () => {
  // The fallback is the legible failure of the two: a colour asset recoloured
  // to the foreground is still a readable mark, while a single-colour asset
  // painted as an image is `currentColor` resolved against nothing — black on
  // a black sidebar.
  for (const other of [
    undefined,
    null,
    "",
    "   ",
    "mask",
    "Color",
    "colour",
    "color ish",
    7,
    {},
  ]) {
    assert.equal(parseProductLogoStyle(other), "mask", `${other}`);
  }
});

test("any URL that is not an inline SVG is dropped", () => {
  // The value reaches CSS inside `mask: url(...)`. A remote URL would make the
  // app fetch an asset at paint time, which is a network call nobody asked for
  // and a tracking vector; the other shapes are simply not a logo.
  for (const bad of [
    "https://example.test/logo.svg",
    "http://example.test/logo.svg",
    "file:///etc/passwd",
    "//example.test/logo.svg",
    "data:text/html;base64,PGh0bWw+",
    "data:image/png;base64,iVBORw0KGgo=",
    "data:image/svg+xml,%3Csvg%3E%3C/svg%3E",
    "data:image/svg+xml;base64,",
    `${SVG} url(https://example.test/x.svg)`,
  ]) {
    assert.equal(parseProductLogoUrl(bad), null, `${bad} must be dropped`);
  }
});
