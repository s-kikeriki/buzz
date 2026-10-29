import assert from "node:assert/strict";
import test from "node:test";

import {
  blankComments,
  findHardcodedProductName,
} from "./check-product-name-core.mjs";

/**
 * These tests exist because the gate's own failure mode is finding nothing.
 * A detector that matches no input passes the repo forever and reports
 * "clean" while the thing it was built for ships — so each case below either
 * must be caught or must not be, and the must-nots are the half that keeps
 * the gate switched on.
 */

test("catches the product name in a plain string literal", () => {
  const findings = findHardcodedProductName(
    'const copy = "Buzz could not load this.";\n',
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 1);
});

test("catches it in JSX text", () => {
  const findings = findHardcodedProductName(
    "<p>\n  Keep Buzz up to date.\n</p>\n",
  );
  assert.deepEqual(
    findings.map((finding) => finding.line),
    [2],
  );
});

test("catches it in a template literal", () => {
  assert.equal(
    findHardcodedProductName("const s = `Ran ${n} Buzz relay ops`;\n").length,
    1,
  );
});

test("reports the line a person will open, not the line within a run", () => {
  const source = ["// a", "// b", "", 'const s = "Buzz";', ""].join("\n");
  assert.deepEqual(findHardcodedProductName(source), [
    { line: 4, text: 'const s = "Buzz";' },
  ]);
});

test("ignores identifiers, which is what keeps the gate usable", () => {
  const source = [
    "import type { BuzzEvent } from './types';",
    "const url = BUZZ_RELAY_URL;",
    "useBuzzBridge();",
    'const scheme = "buzz://message";',
    'const theme = "buzz-dark";',
    "const x = payload.Buzzer;",
    "",
  ].join("\n");
  assert.deepEqual(findHardcodedProductName(source), []);
});

test("ignores a member access, so BRAND-adjacent code does not trip it", () => {
  assert.deepEqual(findHardcodedProductName("const n = brand.Buzz;\n"), []);
});

test("ignores comments — that is where the reasons live", () => {
  const source = [
    "// This used to say Buzz, and #24 converted it.",
    "/*",
    " * Buzz is the trunk's own name; a flavor renames it.",
    " */",
    "const s = `${BRAND.productName} could not load this.`;",
    "",
  ].join("\n");
  assert.deepEqual(findHardcodedProductName(source), []);
});

test("still catches code on the same line as a trailing comment", () => {
  const findings = findHardcodedProductName(
    'const s = "Buzz"; // intentional, see brand.ts\n',
  );
  assert.equal(findings.length, 1);
});

test("a block comment does not swallow the code after it", () => {
  const findings = findHardcodedProductName('const s = /* Buzz */ "Buzz";\n');
  assert.equal(findings.length, 1, "the literal must still be found");
});

test("blankComments preserves byte and line counts", () => {
  const source = "a\n// Buzz\n/* Buzz\nBuzz */\nb\n";
  const blanked = blankComments(source);
  assert.equal(blanked.length, source.length);
  assert.equal(blanked.split("\n").length, source.split("\n").length);
  assert.ok(!blanked.includes("Buzz"));
});
