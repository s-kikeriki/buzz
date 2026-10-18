import assert from "node:assert/strict";
import test from "node:test";

import { appearanceCommunityLabel } from "./appearanceScopeCopy.ts";

const FALLBACK = "this community";

test("labels the active community by name", () => {
  assert.equal(
    appearanceCommunityLabel("Block Builders", FALLBACK),
    "Block Builders",
  );
});

test("trims surrounding whitespace from the community name", () => {
  assert.equal(appearanceCommunityLabel("  Buzz HQ  ", FALLBACK), "Buzz HQ");
});

test("falls back to the supplied label when no community is active", () => {
  assert.equal(appearanceCommunityLabel(null, FALLBACK), FALLBACK);
  assert.equal(appearanceCommunityLabel(undefined, FALLBACK), FALLBACK);
  assert.equal(appearanceCommunityLabel("", FALLBACK), FALLBACK);
  assert.equal(appearanceCommunityLabel("   ", FALLBACK), FALLBACK);
});

test("passes the fallback through verbatim so a translated string survives", () => {
  assert.equal(
    appearanceCommunityLabel(null, "diese Community"),
    "diese Community",
  );
});
