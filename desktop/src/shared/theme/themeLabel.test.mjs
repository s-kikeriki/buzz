import assert from "node:assert/strict";
import test from "node:test";

import { parseThemeLabel } from "../branding/brandThemeLabel.ts";
import { formatThemeLabel, pairedThemeLabel } from "./themeLabel.ts";

test("an unconfigured build still calls the pair Buzz", () => {
  // No second argument: this is the production call shape, and under the unit
  // runner `import.meta.env` is absent, so it reads whatever `BRAND.themeLabel`
  // resolves to with nothing configured. A default wired to the wrong thing
  // fails here rather than only in a flavored build nobody runs in CI.
  assert.equal(formatThemeLabel("buzz"), "Buzz");
  assert.equal(formatThemeLabel("buzz-dark"), "Buzz Dark");
  assert.equal(pairedThemeLabel("buzz"), "Buzz");
});

test("a configured label renames the pair and keeps its shape", () => {
  assert.equal(formatThemeLabel("buzz", "kikeriki"), "kikeriki");
  assert.equal(formatThemeLabel("buzz-dark", "kikeriki"), "kikeriki Dark");
  // The System-mode tile derives its label from the light member.
  assert.equal(pairedThemeLabel("buzz", "kikeriki"), "kikeriki");
});

test("the brand's own casing survives — it is a name, not a word", () => {
  // Title-casing the substituted segment would turn `kikeriki` into
  // `Kikeriki`, which is a second rename nobody asked for.
  assert.equal(formatThemeLabel("buzz", "kikeriki"), "kikeriki");
  assert.notEqual(formatThemeLabel("buzz", "kikeriki"), "Kikeriki");
});

test("no other theme is renamed, however the label is set", () => {
  for (const name of [
    "github-light",
    "github-dark",
    "catppuccin-latte",
    "vitesse-black",
  ]) {
    assert.equal(
      formatThemeLabel(name, "kikeriki"),
      formatThemeLabel(name, null),
      `${name} must be unaffected by a brand theme label`,
    );
  }
  assert.equal(formatThemeLabel("github-dark", "kikeriki"), "Github Dark");
});

test("paired labels still strip mode tokens from every position", () => {
  const cases = [
    ["github-light-default", "Github Default"],
    ["light-plus", "Light Plus"],
    ["material-theme-lighter", "Material Theme"],
    ["gruvbox-light-soft", "Gruvbox Soft"],
    ["catppuccin-latte", "Catppuccin"],
    ["rose-pine-dawn", "Rose Pine"],
  ];
  for (const [name, expected] of cases) {
    assert.equal(pairedThemeLabel(name, "kikeriki"), expected);
    assert.equal(pairedThemeLabel(name, null), expected);
  }
});

test("an unusable label is not a rename", () => {
  // `parseThemeLabel` is what stands between the flavor's env var and this
  // function, so the two are asserted together: a blank variable has to come
  // out as "Buzz", not as a nameless tile.
  for (const configured of [undefined, null, "", "   ", 42, {}]) {
    assert.equal(parseThemeLabel(configured), null);
    assert.equal(formatThemeLabel("buzz", parseThemeLabel(configured)), "Buzz");
  }
  assert.equal(parseThemeLabel("  kikeriki  "), "kikeriki");
});
