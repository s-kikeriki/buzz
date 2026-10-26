import assert from "node:assert/strict";
import test from "node:test";
import { hexToHsl } from "./adaptive-theme.ts";
import {
  ACCENT_COLORS,
  LIGHT_ONLY_ACCENTS,
  accentPrimary,
  resolveEffectiveAccent,
} from "./ThemeProvider.tsx";

function luminance(hex) {
  const channels = [1, 3, 5].map((i) => {
    const value = parseInt(hex.slice(i, i + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

// Light backgrounds down to the adaptive engine's 0.5-luminance light cutoff.
const LIGHT = ["#ffffff", "#fafafa", "#f6f8fa", "#eff1f5", "#bcbcbc"];
const DARK = ["#0d1117", "#24273a", "#1e1e1e"];

// Driven by the production set rather than a literal list, so a future
// light-only accent is covered the moment it is added there.
test("every light-only accent reads as text and as a filled control", () => {
  assert.ok(LIGHT_ONLY_ACCENTS.size > 0, "the set must not be empty");
  for (const accent of LIGHT_ONLY_ACCENTS) {
    for (const background of [...LIGHT, ...DARK]) {
      const { fill, ink } = accentPrimary(accent, hexToHsl(background));
      assert.ok(
        contrast(fill, background) >= 4.5,
        `${accent}: text on ${background}`,
      );
      assert.ok(
        contrast(ink, fill) >= 4.5,
        `${accent}: ink on fill over ${background}`,
      );
    }
    // Dark themes keep the raw accent.
    for (const background of DARK) {
      assert.equal(
        accentPrimary(accent, hexToHsl(background)).fill,
        accent,
        `${accent}: unchanged on ${background}`,
      );
    }
    // And a light theme must actually move it — otherwise the entry in the set
    // is doing nothing and the first assertion passed for the wrong reason.
    assert.notEqual(
      accentPrimary(accent, hexToHsl("#ffffff")).fill,
      accent,
      `${accent}: must darken on white`,
    );
  }
});

test("Citron is the kikeriki signal colour and is selectable", () => {
  const citron = ACCENT_COLORS.find(({ value }) => value === "#d4f247");
  assert.ok(citron, "citron must be in ACCENT_COLORS");
  assert.equal(citron.name, "Citron");
  // The community-theme reader rejects any accent outside ACCENT_COLORS, so
  // an accent missing from that list is dropped on the sync path.
  assert.ok(LIGHT_ONLY_ACCENTS.has("#d4f247"));
});

test("accents that read on every surface keep their established fill", () => {
  for (const { value } of ACCENT_COLORS) {
    if (value === "neutral" || LIGHT_ONLY_ACCENTS.has(value)) continue;
    for (const background of [...LIGHT, ...DARK]) {
      assert.equal(accentPrimary(value, hexToHsl(background)).fill, value);
    }
  }
});

test("a Buzz theme renders the build's accent, not the neutral pin", () => {
  // Buzz themes are the default, so a per-organisation build whose accent the
  // pin discards here never shows that accent on a fresh install at all.
  assert.equal(resolveEffectiveAccent("buzz", "#ef4444", "#d4f247"), "#d4f247");
  assert.equal(
    resolveEffectiveAccent("buzz-dark", "#ef4444", "#d4f247"),
    "#d4f247",
  );
  // An unconfigured OSS build keeps the neutral pin.
  assert.equal(resolveEffectiveAccent("buzz", "#ef4444", null), "neutral");
  assert.equal(resolveEffectiveAccent("buzz-dark", "#ef4444", null), "neutral");
  // Every other theme uses the stored accent, branded build or not.
  for (const brandAccent of ["#d4f247", null]) {
    assert.equal(
      resolveEffectiveAccent("catppuccin-latte", "#ef4444", brandAccent),
      "#ef4444",
    );
  }
});
