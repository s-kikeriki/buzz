import assert from "node:assert/strict";
import test from "node:test";

import { parseChromeSurface } from "../branding/brandChrome.ts";
import { chromeMode, sidebarAccent } from "./ThemeProvider.tsx";

/**
 * The chrome surface decides two things the document's own light/dark state
 * used to decide for it: which token set the navigation rail uses, and which
 * cut of a two-cut brand mark is displayed on it. Light mode on an `ink` build
 * is the case where those answers differ, and both failures are silent — a
 * rail that renders its light tokens on near-black, and a wordmark that is
 * present in the DOM and invisible on screen.
 */

test("an ink build keeps dark chrome in both document modes", () => {
  assert.equal(chromeMode("ink", false), "ink");
  assert.equal(chromeMode("ink", true), "ink");
});

test("every other build mirrors the document, as the dark class did", () => {
  assert.equal(chromeMode("auto", false), "light");
  assert.equal(chromeMode("auto", true), "dark");
});

test("an unset or unrecognised chrome surface is auto, not ink", () => {
  // The fallback direction matters: `auto` renders the stock Buzz chrome,
  // which is legible under any theme. Defaulting the other way would give a
  // mis-set env var an ink rail that the rest of the build's colours were not
  // chosen for.
  for (const value of [undefined, null, "", "  ", "INK", "dark", 1, {}]) {
    assert.equal(parseChromeSurface(value), "auto", `for ${String(value)}`);
  }
  assert.equal(parseChromeSurface("ink"), "ink");
  assert.equal(parseChromeSurface("  ink  "), "ink");
});

test("the ink rail takes the accent undarkened", () => {
  // `accentPrimary` darkens a light-only accent so it survives as text on the
  // content background. The rail is ink, so that constraint does not apply
  // there — and inheriting it is what painted kikeriki's citron sidebar olive
  // in light mode.
  const content = { fill: "#6e7d25", ink: "#ffffff" };
  const rail = sidebarAccent("ink", "#d4f247", content);
  assert.equal(rail.fill, "#d4f247");
  // Near-black on citron, which is the pairing the logo itself uses.
  assert.equal(rail.ink, "#000000");
});

test("a non-ink build's rail keeps whatever the content accent resolved to", () => {
  // Asserted as identity rather than by value: the rail must not acquire its
  // own opinion for builds whose rail follows the document, or a stock Buzz
  // install would start diverging from its own theme.
  const content = { fill: "#6e7d25", ink: "#ffffff" };
  assert.equal(sidebarAccent("auto", "#d4f247", content), content);
});

test("a dark-readable accent is unchanged by the ink rail either way", () => {
  // The two paths must agree when there was nothing to darken, otherwise the
  // split would be visible on accents it was never meant to touch.
  const content = { fill: "#3b82f6", ink: "#ffffff" };
  assert.equal(sidebarAccent("auto", "#3b82f6", content).fill, "#3b82f6");
  assert.equal(sidebarAccent("ink", "#3b82f6", content).fill, "#3b82f6");
});
