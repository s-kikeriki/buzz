import assert from "node:assert/strict";
import test from "node:test";

import {
  getMessageLinkChannelLabel,
  getMessageLinkLabel,
  messageLinkPrefix,
} from "./messageLinkLabel.ts";

test("ordinary message links expose an Inbox-style prefix and channel label", () => {
  // A function now, not a constant: the prefix is resolved per call so it
  // cannot freeze in the boot locale. `test-loader.mjs` activates `en`, whose
  // catalogue is the source text, so the expected value is unchanged.
  assert.equal(messageLinkPrefix(), "Thread in");
  assert.equal(getMessageLinkChannelLabel("general"), "#general");
});

test("ordinary message links name their target thread", () => {
  assert.equal(
    getMessageLinkLabel({ channelName: "general" }),
    "Thread in #general",
  );
});

test("ordinary message links include a provided root excerpt", () => {
  assert.equal(
    getMessageLinkLabel({
      channelName: "general",
      threadExcerpt: "Release notes",
    }),
    "Thread in #general — Release notes",
  );
});

test("sent-from-thread links use the excerpt as their visible link", () => {
  assert.equal(
    getMessageLinkLabel({
      channelName: "general",
      threadExcerpt: "Release notes",
      variant: "sent-from-thread",
    }),
    "Release notes",
  );
});
