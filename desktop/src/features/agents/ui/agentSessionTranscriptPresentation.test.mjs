import assert from "node:assert/strict";
import test from "node:test";

import {
  getActivityHeadline,
  isMeaningfulItem,
  isSpineItem,
  shouldShowTranscriptRowTimestamp,
} from "./agentSessionTranscriptPresentation.ts";

const baseTimestamp = "2026-06-14T19:00:00.000Z";

function makeTool(overrides = {}) {
  return {
    id: "tool:1",
    type: "tool",
    title: "Send Message",
    toolName: "send_message",
    buzzToolName: "send_message",
    status: "executing",
    args: { channel_id: "abc" },
    result: "",
    isError: false,
    timestamp: baseTimestamp,
    startedAt: baseTimestamp,
    completedAt: null,
    ...overrides,
  };
}

function makeMessage(overrides = {}) {
  return {
    id: "msg:1",
    type: "message",
    role: "assistant",
    title: "Assistant",
    text: "Looking into that now.",
    timestamp: baseTimestamp,
    ...overrides,
  };
}

test("getActivityHeadline formats tool titles and assistant text", () => {
  assert.equal(getActivityHeadline(makeTool()), "Send Message · abc");
  assert.equal(
    getActivityHeadline(makeMessage({ text: "First line\nSecond line" })),
    "First line",
  );
  assert.equal(getActivityHeadline(makeMessage({ text: "   " })), "Responding");
});

/**
 * A plan thought is recognised by its wire kind, not by `title === "Plan"`.
 *
 * The title is display copy. Once translated it stops matching, and the
 * headline falls through to the raw title instead of "Planning" — so the
 * German activity bar read "Plan" where English read "Planning".
 */
test("getActivityHeadline recognises a plan thought by its wire kind", () => {
  const planThought = {
    id: "thinking:1",
    type: "thought",
    title: "Plan",
    text: "- [ ] step one",
    timestamp: baseTimestamp,
    acpSource: "plan",
  };

  assert.equal(getActivityHeadline(planThought), "Planning");
  assert.equal(
    getActivityHeadline({ ...planThought, title: "Plan (de)" }),
    "Planning",
    "a translated plan title is still a plan",
  );
  assert.equal(
    getActivityHeadline({
      ...planThought,
      acpSource: "agent_thought_chunk",
      title: "Thinking",
    }),
    "Thinking",
    "a non-plan thought keeps its own title",
  );
});

test("isMeaningfulItem ignores lifecycle noise and raw JSON-RPC metadata", () => {
  assert.equal(
    isMeaningfulItem({
      id: "life:1",
      type: "lifecycle",
      title: "Turn started",
      text: "",
      timestamp: baseTimestamp,
      acpSource: "turn_started",
    }),
    false,
    "turn started is lifecycle noise → not meaningful",
  );
  // The noise gate reads the wire kind, not the row's heading. A German app
  // renders this row as "Turn gestartet", which the old title-matching gate
  // let through into the activity-bar headline.
  assert.equal(
    isMeaningfulItem({
      id: "life:1-de",
      type: "lifecycle",
      title: "Turn gestartet",
      text: "",
      timestamp: baseTimestamp,
      acpSource: "turn_started",
    }),
    false,
    "a translated lifecycle title is still noise",
  );
  assert.equal(
    isMeaningfulItem({
      id: "life:2",
      type: "lifecycle",
      title: "Mode",
      text: "chat",
      timestamp: baseTimestamp,
      acpSource: "current_mode_update",
    }),
    true,
    "a non-noise lifecycle kind stays meaningful",
  );
  assert.equal(
    isMeaningfulItem({
      id: "meta:raw",
      type: "metadata",
      renderClass: "raw-rail",
      title: "Raw ACP payload",
      sections: [],
      timestamp: baseTimestamp,
      acpSource: "raw_json_rpc",
    }),
    false,
    "raw_json_rpc metadata is infrastructure noise → not meaningful",
  );
  assert.equal(
    isMeaningfulItem({
      id: "meta:ctx",
      type: "metadata",
      renderClass: "raw-rail",
      title: "Prompt context",
      sections: [],
      timestamp: baseTimestamp,
      acpSource: "session/prompt:context",
    }),
    true,
    "prompt context metadata is semantic → meaningful",
  );
  assert.equal(
    isMeaningfulItem({
      id: "meta:sys",
      type: "metadata",
      renderClass: "raw-rail",
      title: "System prompt",
      sections: [],
      timestamp: baseTimestamp,
    }),
    true,
    "system prompt metadata (no acpSource) is semantic → meaningful",
  );
  assert.equal(
    isMeaningfulItem({
      id: "life:2",
      type: "lifecycle",
      title: "Turn error",
      text: "boom",
      timestamp: baseTimestamp,
    }),
    true,
  );
});

test("getActivityHeadline uses semantic tool descriptors", () => {
  assert.equal(
    getActivityHeadline(
      makeTool({
        title: "Shell",
        toolName: "dev__shell",
        buzzToolName: null,
        args: { command: "buzz messages send --content hi" },
        descriptor: {
          renderClass: "message",
          label: "Send Message",
          preview: "hi",
          source: "shell",
          groupKey: "buzz-cli:messages.send",
        },
      }),
    ),
    "Send Message · hi",
  );
});

test("isMeaningfulItem ignores suppressed tools", () => {
  assert.equal(
    isMeaningfulItem(
      makeTool({
        renderClass: "suppressed",
        descriptor: {
          renderClass: "suppressed",
          label: "Checked todos",
          preview: null,
          source: "harness",
          groupKey: "suppressed:stop-hook",
        },
      }),
    ),
    false,
  );
});

const metadataSystemPrompt = {
  id: "meta:sys",
  type: "metadata",
  renderClass: "raw-rail",
  title: "System prompt",
  sections: [],
  timestamp: baseTimestamp,
};

const metadataPromptContext = {
  id: "meta:ctx",
  type: "metadata",
  renderClass: "raw-rail",
  title: "Prompt context",
  sections: [],
  timestamp: baseTimestamp,
  acpSource: "session/prompt:context",
};

test("isSpineItem excludes metadata items (reads recede)", () => {
  assert.equal(
    isSpineItem(metadataSystemPrompt),
    false,
    "system prompt metadata is not spine work",
  );
  assert.equal(
    isSpineItem(metadataPromptContext),
    false,
    "prompt context metadata is not spine work",
  );
  assert.equal(isSpineItem(makeTool()), true, "tool items are spine work");
  assert.equal(
    isSpineItem(makeMessage()),
    true,
    "message items are spine work",
  );
  assert.equal(
    isSpineItem({
      id: "meta:raw",
      type: "metadata",
      renderClass: "raw-rail",
      title: "Raw ACP payload",
      sections: [],
      timestamp: baseTimestamp,
      acpSource: "raw_json_rpc",
    }),
    false,
    "raw_json_rpc is already filtered by isMeaningfulItem → not spine",
  );
});

test("isSpineItem: metadata still meaningful via isMeaningfulItem (feed visibility unchanged)", () => {
  // isMeaningfulItem must still return true for non-raw metadata — the feed
  // renders metadata items independently of isSpineItem.
  assert.equal(isMeaningfulItem(metadataSystemPrompt), true);
  assert.equal(isMeaningfulItem(metadataPromptContext), true);
});

test("two-tier headline: metadata excluded when spine work is present", () => {
  // Simulate what BotActivityBar does: when any spine item exists, only spine
  // items are eligible for the headline rotation.
  const transcript = [metadataSystemPrompt, makeTool()];
  const hasSpine = transcript.some(isSpineItem);
  const passFilter = hasSpine ? isSpineItem : isMeaningfulItem;

  const headlines = transcript
    .filter(passFilter)
    .map((item) => getActivityHeadline(item))
    .filter(Boolean);

  assert.ok(
    !headlines.includes("System prompt"),
    "System prompt should not headline when spine work exists",
  );
  assert.ok(
    headlines.some((h) => h?.includes("Send Message")),
    "Tool headline should appear",
  );
});

test("two-tier headline: metadata headlines when it is the only activity (session start / idle)", () => {
  // When no spine items exist, fall back to isMeaningfulItem so the bar is not
  // empty at session start.
  const transcript = [metadataSystemPrompt, metadataPromptContext];
  const hasSpine = transcript.some(isSpineItem);
  const passFilter = hasSpine ? isSpineItem : isMeaningfulItem;

  const headlines = transcript
    .filter(passFilter)
    .map((item) => getActivityHeadline(item))
    .filter(Boolean);

  assert.ok(
    headlines.includes("System prompt"),
    "System prompt should headline when no spine work exists",
  );
  assert.ok(
    headlines.includes("Prompt context"),
    "Prompt context should headline when no spine work exists",
  );
});

// Render-tier tests (raw_json_rpc → <pre>, non-raw → polished accordion) live in
// activityRenderClasses/RawRailActivity.render.test.mjs — they use
// renderToStaticMarkup and would fail if the isRawPayload branch in
// RawRailActivity were removed.

test("shouldShowTranscriptRowTimestamp: off by default (enabled=false)", () => {
  assert.equal(
    shouldShowTranscriptRowTimestamp(makeTool(), {
      enabled: false,
      variant: "default",
    }),
    false,
  );
});

test("shouldShowTranscriptRowTimestamp: enabled shows for tools, thoughts, assistant messages", () => {
  const options = { enabled: true, variant: "default" };
  assert.equal(shouldShowTranscriptRowTimestamp(makeTool(), options), true);
  assert.equal(
    shouldShowTranscriptRowTimestamp(
      makeMessage({ role: "assistant" }),
      options,
    ),
    true,
  );
  assert.equal(
    shouldShowTranscriptRowTimestamp(
      {
        id: "thought:1",
        type: "thought",
        title: "Thinking",
        text: "hmm",
        timestamp: baseTimestamp,
      },
      options,
    ),
    true,
  );
});

test("shouldShowTranscriptRowTimestamp: user message bubbles keep their own footer (excluded)", () => {
  assert.equal(
    shouldShowTranscriptRowTimestamp(
      makeMessage({ role: "user", title: "tho" }),
      { enabled: true, variant: "default" },
    ),
    false,
    "user bubbles already render a timestamp footer",
  );
});

test("shouldShowTranscriptRowTimestamp: compact preview stays dense", () => {
  assert.equal(
    shouldShowTranscriptRowTimestamp(makeTool(), {
      enabled: true,
      variant: "compactPreview",
    }),
    false,
  );
});
