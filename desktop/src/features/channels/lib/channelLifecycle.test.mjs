import { i18n } from "@lingui/core";
import assert from "node:assert/strict";
import test from "node:test";

import { channelLifecycle, channelLifecycleLabel } from "./channelLifecycle.ts";

test("channelLifecycle prefers project home over TTL", () => {
  assert.equal(
    channelLifecycle({ projectHome: true, temporary: false }),
    "project",
  );
  assert.equal(
    channelLifecycle({ projectHome: true, temporary: true }),
    "project",
  );
});

test("channelLifecycle maps ongoing and temporary streams", () => {
  assert.equal(
    channelLifecycle({ projectHome: false, temporary: false }),
    "ongoing",
  );
  assert.equal(
    channelLifecycle({ projectHome: false, temporary: true }),
    "temporary",
  );
});

// The label takes `i18n` so it cannot resolve at module scope. Going through
// the real instance (activated to `en` in `test-loader.mjs`) keeps the
// expected strings as they were and still exercises `i18n._`, so a message
// that is wired up wrong fails here rather than on screen.
test("channelLifecycleLabel names project, ongoing, and temporary", () => {
  assert.equal(channelLifecycleLabel(i18n, "project", null), "Project");
  assert.equal(channelLifecycleLabel(i18n, "ongoing", null), "Ongoing");
  assert.equal(
    channelLifecycleLabel(i18n, "temporary", 7 * 24 * 60 * 60),
    "Temporary · 7d",
  );
});
