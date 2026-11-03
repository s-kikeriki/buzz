import assert from "node:assert/strict";
import test from "node:test";

// Same reason as `brand.test.mjs`: `brand.ts` reads `import.meta.env` at
// module load and the plain Node runner has no Vite shim, so the parser lives
// in its own module and these tests bind the production code path.
import {
  DEFAULT_FONT_STACK,
  parseBrandFontFamily,
  parseBrandFontStack,
} from "./brandFont.ts";

test("an unset build keeps the stock stack", () => {
  // Null, not the default stack: `applyBrandFont` reads null as "change
  // nothing", which leaves the declaration `theme.css` shipped in place. If
  // this returned the stack instead, an unflavored build would write an
  // inline style for a value it already had — same pixels, but the root
  // element would stop telling the truth about whether a flavor configured
  // anything.
  for (const unset of [undefined, null, 7, {}, [], "", "   "]) {
    assert.equal(parseBrandFontStack(unset), null);
    assert.equal(parseBrandFontFamily(unset), null);
  }
});

test("a bundled family resolves to a stack that still ends in the trunk's", () => {
  const stack = parseBrandFontStack("Poppins");
  assert.ok(stack.startsWith("Poppins,"));
  // The tail matters as much as the head. Poppins has no cut for most of
  // what a chat window renders — every CJK glyph, every emoji fallback — and
  // the first paint happens before the woff2 is decoded. Without the stock
  // stack behind it, both land on whatever the OS calls a default.
  assert.ok(stack.endsWith("sans-serif"));
  assert.ok(stack.includes('"Inter Variable"'));
  assert.equal(parseBrandFontFamily("Poppins"), "Poppins");
});

test("Inter is declarable and resolves to exactly the stock stack", () => {
  // A flavor may pin the trunk's own family. It has to produce the same
  // stack the stylesheet already declares, or "pinned Inter" would be a
  // third, slightly different font stack nobody meant to create.
  assert.equal(parseBrandFontStack("Inter"), DEFAULT_FONT_STACK);
});

test("a family the app does not bundle is refused, not passed through", () => {
  // The failure this prevents is the quiet one. Emitting the name would
  // build a stack whose first entry resolves on the machine that has the
  // font installed — the designer's — and silently falls through to Inter
  // everywhere else, with nothing in the build log and nothing in a
  // screenshot taken on the wrong machine.
  for (const unknown of ["Comic Sans MS", "Helvetica", "poppins "]) {
    assert.equal(parseBrandFontStack(unknown), null);
    assert.equal(parseBrandFontFamily(unknown), null);
  }
});

test("surrounding whitespace is trimmed rather than making the value unknown", () => {
  assert.equal(
    parseBrandFontStack("  Poppins  "),
    parseBrandFontStack("Poppins"),
  );
  assert.equal(parseBrandFontFamily("  Poppins  "), "Poppins");
});
