import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { DEFAULT_CELEBRATION_EMOJIS } from "@/shared/branding/brandCelebration.ts";

/**
 * The backup-test burst exists **twice**, and that is the defect this file is
 * about.
 *
 * `features/settings/ui/BackupTestFlow.tsx` and
 * `features/onboarding/ui/BackupTestFlow.tsx` are separate components with the
 * same confetti. #23 converted the onboarding copy's product name and left the
 * Settings copy saying "Buzz"; #24 found it. The emoji list was the same shape
 * of duplication — two identical literals, either of which could be fixed
 * alone — so it now has one source.
 *
 * This is a **source-text** assertion, not a render assertion, and the reason
 * is worth stating rather than hiding: the particle list is built inside the
 * components' own success handler and reaching it needs the whole drop →
 * password → verify flow. The flavored e2e drives that flow against a real
 * bundle; what a unit test can add cheaply is that neither copy has grown its
 * own literal back. Both halves are needed, and this is the cheap half.
 */

const uiDir = path.dirname(fileURLToPath(import.meta.url));
const COPIES = [
  path.join(uiDir, "BackupTestFlow.tsx"),
  path.resolve(uiDir, "../../onboarding/ui/BackupTestFlow.tsx"),
];

test("both copies of the flow exist where this test thinks they do", async () => {
  // Without this, a renamed or moved file turns every assertion below into a
  // read error that the runner reports once and nobody reads as "the guard
  // stopped guarding".
  for (const file of COPIES) {
    const source = await readFile(file, "utf8");
    assert.ok(
      source.includes("BURST_EMOJIS"),
      `${file} no longer defines BURST_EMOJIS — update this test`,
    );
  }
});

test("neither copy hardcodes the burst set", async () => {
  for (const file of COPIES) {
    const source = await readFile(file, "utf8");
    assert.match(
      source,
      /const BURST_EMOJIS = BRAND\.celebrationEmojis;/,
      `${file} must take the burst set from the flavor`,
    );
  }
});

test("neither copy carries the mascot as a literal", async () => {
  // The two the de-branding is for. Checked per copy, because the whole point
  // is that fixing one has twice looked like fixing both.
  for (const file of COPIES) {
    const source = await readFile(file, "utf8");
    for (const mascot of ["🐝", "🍯"]) {
      assert.ok(
        !source.includes(mascot),
        `${file} still contains ${mascot} as a literal`,
      );
    }
  }
});

test("the stock set is still the Buzz one, so the trunk is unchanged", async () => {
  // The flavor switch must be opt-in. If the default ever loses the mascot,
  // `block/buzz` silently stops celebrating in its own brand and no flavored
  // build would show it.
  assert.deepEqual(
    [...DEFAULT_CELEBRATION_EMOJIS],
    ["🎉", "✨", "🐝", "🍯", "🔑", "💛"],
  );
});
