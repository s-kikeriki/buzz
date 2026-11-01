import { i18n } from "@lingui/core";
import assert from "node:assert/strict";
import test from "node:test";

import {
  getChannelDescription,
  getChannelDetail,
} from "./channelDescription.ts";

/**
 * `getChannelDescription` takes `i18n` so it cannot resolve its copy at module
 * scope. `test-loader.mjs` activates `en` process-wide and the English
 * catalogue is the source text, so passing the real instance keeps the
 * expected values the English they always were — and routes them through
 * `i18n._`, so a message that is wired up wrong fails here.
 */
function describe(channel) {
  return getChannelDescription(channel, i18n);
}

function makeChannel(overrides = {}) {
  return {
    archivedAt: null,
    description: "",
    isMember: true,
    purpose: "",
    topic: "",
    ...overrides,
  };
}

test("getChannelDescription falls back when channel is null", () => {
  assert.equal(
    describe(null),
    "Connect to the relay to browse channels and read messages.",
  );
});

test("getChannelDescription falls back when no detail fields are set", () => {
  assert.equal(describe(makeChannel()), "Channel details and activity.");
});

test("getChannelDetail provides one shared field order for every surface", () => {
  const channel = makeChannel({
    description: "Description paragraphs.\n\nKeep this structure.",
    purpose: "Legacy purpose",
    topic: "",
  });

  assert.equal(
    getChannelDetail(channel),
    "Description paragraphs.\n\nKeep this structure.",
  );
  assert.equal(describe(channel), getChannelDetail(channel));
});

test("getChannelDescription returns single-line detail unchanged", () => {
  assert.equal(
    describe(makeChannel({ description: "Team updates." })),
    "Team updates.",
  );
});

test("getChannelDescription preserves paragraph line breaks (AIDA-1980)", () => {
  const detail = "First paragraph.\n\nSecond paragraph with instructions.";
  assert.equal(describe(makeChannel({ description: detail })), detail);
});

test("getChannelDescription puts status prefixes on their own line", () => {
  const detail = "Line one.\nLine two.";
  assert.equal(
    describe(
      makeChannel({
        archivedAt: "2026-01-01T00:00:00Z",
        description: detail,
        isMember: false,
      }),
    ),
    `Archived. Read-only until you join this open channel.\n${detail}`,
  );
});

test("getChannelDescription shows prefixes alone when no detail exists", () => {
  assert.equal(
    describe(makeChannel({ archivedAt: "2026-01-01T00:00:00Z" })),
    "Archived.",
  );
});
