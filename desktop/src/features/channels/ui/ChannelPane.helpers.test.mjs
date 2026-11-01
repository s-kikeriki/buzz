import { i18n } from "@lingui/core";
import assert from "node:assert/strict";
import test from "node:test";

import {
  getChannelIntroDescription,
  getChannelIntroKind,
  shouldPrioritizeIdleAuxiliary,
  shouldUseFocusIdleDrawer,
} from "./ChannelPane.helpers.ts";

function channel(overrides = {}) {
  return {
    ttlDeadline: null,
    ttlSeconds: null,
    visibility: "open",
    ...overrides,
  };
}

test("focus idle drawers yield to every higher-priority auxiliary surface", () => {
  const idleDrawer = {
    channelManagementOpen: false,
    hasAgentSession: false,
    hasIdleAuxiliaryPanel: true,
    hasIdlePanelCloseHandler: true,
    hasProfilePanel: false,
    hasThreadSurface: false,
    useSplitAuxiliaryPane: true,
  };

  assert.equal(shouldUseFocusIdleDrawer(idleDrawer), true);
  for (const surface of [
    "channelManagementOpen",
    "hasAgentSession",
    "hasProfilePanel",
    "hasThreadSurface",
  ]) {
    assert.equal(
      shouldUseFocusIdleDrawer({ ...idleDrawer, [surface]: true }),
      false,
      `idle drawer must yield when ${surface} is open`,
    );
  }
});

test("an explicit thread override keeps the idle panel in its own focus drawer", () => {
  assert.equal(
    shouldUseFocusIdleDrawer({
      channelManagementOpen: false,
      hasAgentSession: false,
      hasIdleAuxiliaryPanel: true,
      hasIdlePanelCloseHandler: true,
      hasProfilePanel: false,
      hasThreadSurface: true,
      overrideThread: true,
      useSplitAuxiliaryPane: false,
    }),
    true,
  );
});

test("channel intro shares description-over-purpose derivation with the header", () => {
  assert.equal(
    getChannelIntroDescription(
      channel({
        description: "Description paragraphs.\n\nKeep this structure.",
        purpose: "Legacy purpose",
        topic: "",
      }),
    ),
    "Description paragraphs.\n\nKeep this structure.",
  );
});

/**
 * The kind is a descriptor now, because `useChannelIntro` builds it inside a
 * `useMemo`. Resolving through `i18n._` rather than reading
 * `descriptor.message` is deliberate: reading the field would hand the source
 * string straight back and never exercise the catalogue lookup at all.
 * `test-loader.mjs` activates `en`, whose catalogue is the source text, so the
 * expected values stay the English they always were.
 */
function introKind(ch, projectHome) {
  return i18n._(getChannelIntroKind(ch, projectHome));
}

test("getChannelIntroKind names project homes ahead of regular streams", () => {
  assert.equal(introKind(channel(), true), "project channel");
  assert.equal(introKind(channel(), false), "regular channel");
});

test("getChannelIntroKind keeps private and ephemeral labels for other streams", () => {
  assert.equal(
    introKind(channel({ visibility: "private" })),
    "private channel",
  );
  assert.equal(introKind(channel({ ttlSeconds: 3600 })), "ephemeral channel");
});

test("idle auxiliary priority does not depend on thread layout mode", () => {
  assert.equal(shouldPrioritizeIdleAuxiliary(true, true), true);
  assert.equal(shouldPrioritizeIdleAuxiliary(true, false), false);
  assert.equal(shouldPrioritizeIdleAuxiliary(false, true), false);
});
