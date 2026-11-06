import { i18n } from "@lingui/core";
import assert from "node:assert/strict";
import test from "node:test";

import {
  compactWorkflowTriggerDescription,
  splitWorkflowAuthorDescription,
  workflowTriggerDescription,
} from "./workflowTriggerDescription.ts";
import { workflowTriggerDescriptor } from "./workflowTriggerDescriptor.ts";

const describe = (trigger, options) =>
  workflowTriggerDescription(trigger, i18n, options);

const AUTHOR = "a".repeat(64);
const MESSAGE = "b".repeat(64);

test("splits the summary where the author's name goes", () => {
  // The avatar's position comes from the rendered sentence, not from searching
  // it for the name: the second case below puts the same name inside the user's
  // own quoted text, and the third is a sentence where the attribution is not
  // at the end.
  const split = (trigger, options) =>
    splitWorkflowAuthorDescription(
      workflowTriggerDescriptor(trigger, options),
      i18n,
    );

  assert.deepEqual(
    split(
      {
        on: "reaction_added",
        filter: `trigger_author == "${AUTHOR}" && trigger_message_id == "${MESSAGE}"`,
      },
      { authorLabel: "Carl", messageLabel: "thanks Carl" },
    ),
    { prefix: "Reaction added by", suffix: "to “thanks Carl”" },
  );
  assert.deepEqual(
    split(
      {
        on: "message_posted",
        filter: `str_contains(trigger_text, "Carl") && trigger_author == "${AUTHOR}"`,
      },
      { authorLabel: "Carl" },
    ),
    { prefix: "Message by", suffix: "contains “Carl”" },
  );
  assert.deepEqual(
    split(
      {
        on: "message_posted",
        filter: `str_contains(trigger_text, "Carl") && trigger_author != "${AUTHOR}"`,
      },
      { authorLabel: "Carl" },
    ),
    { prefix: "Message by anyone except", suffix: "contains “Carl”" },
  );

  // No author condition, and a loading one, have no position to split at.
  assert.equal(
    split({
      on: "message_posted",
      filter: 'str_contains(trigger_text, "Carl")',
    }),
    null,
  );
  assert.equal(
    split(
      { on: "message_posted", filter: `trigger_author == "${AUTHOR}"` },
      { authorLoading: true },
    ),
    null,
  );
});

test("describes selected trigger conditions on the workflow canvas", () => {
  assert.equal(
    describe(
      { on: "message_posted", filter: `trigger_author == "${AUTHOR}"` },
      { authorLabel: "Carl" },
    ),
    "Message posted by Carl",
  );

  assert.equal(
    describe(
      { on: "message_posted", filter: `trigger_author == "${AUTHOR}"` },
      { authorLoading: true },
    ),
    "Message posted by loading author",
  );

  assert.equal(
    describe({
      on: "message_posted",
      filter: 'str_contains(trigger_text, "deploy")',
    }),
    "Message contains “deploy”",
  );

  assert.equal(
    describe({
      on: "message_posted",
      filter: '!str_contains(trigger_text, "deploy")',
    }),
    "Message doesn’t contain “deploy”",
  );

  assert.equal(
    describe({
      on: "message_posted",
      filter: 'str_starts_with(trigger_text, "deploy")',
    }),
    "Message starts with “deploy”",
  );

  assert.equal(
    describe({
      on: "message_posted",
      filter: 'str_ends_with(trigger_text, "done")',
    }),
    "Message ends with “done”",
  );

  assert.equal(
    describe({ on: "message_posted", filter: 'trigger_text == "deploy"' }),
    "Message “deploy” is posted",
  );

  assert.equal(
    describe({ on: "message_posted", filter: 'trigger_text != "deploy"' }),
    "Message with text other than “deploy” posted",
  );

  assert.equal(
    describe(
      {
        on: "message_posted",
        filter: `trigger_text == "FUCK" && trigger_author == "${AUTHOR}"`,
      },
      { authorLabel: "Carl" },
    ),
    "Message “FUCK” is posted by Carl",
  );

  assert.equal(
    describe(
      {
        on: "message_posted",
        filter: `str_contains(trigger_text, "deploy") && trigger_author == "${AUTHOR}"`,
      },
      { authorLabel: "Carl" },
    ),
    "Message by Carl contains “deploy”",
  );

  assert.equal(
    describe({ on: "message_posted", filter: "str_len(trigger_text) == 0" }),
    "Message without text posted",
  );

  assert.equal(
    describe({ on: "message_posted", filter: "str_len(trigger_text) > 0" }),
    "Message with text posted",
  );

  assert.equal(
    describe({ on: "reaction_added", filter: 'trigger_emoji == "🔥"' }),
    "🔥 reaction added",
  );

  assert.equal(
    describe(
      {
        on: "reaction_added",
        filter: `trigger_message_id == "${MESSAGE}"`,
      },
      { messageLoading: true },
    ),
    "Reaction added to loading message",
  );

  assert.equal(
    describe(
      {
        on: "reaction_added",
        filter: `trigger_emoji == "👾" && trigger_author == "${AUTHOR}" && trigger_message_id == "${MESSAGE}"`,
      },
      { authorLabel: "Carl", messageLabel: "hey yourself" },
    ),
    "👾 reaction added by Carl to “hey yourself”",
  );

  // Without a resolved label, an author renders its compact npub while the
  // referenced message keeps the generic hex truncation — an event id, not
  // a pubkey identity.
  const unresolvedAuthor = "deadbeef".repeat(8);
  assert.equal(
    describe({
      on: "message_posted",
      filter: `trigger_author == "${unresolvedAuthor}"`,
    }),
    "Message posted by npub1m6k…zuz0",
  );
  assert.equal(
    describe({
      on: "message_posted",
      filter: `trigger_author != "${unresolvedAuthor}"`,
    }),
    "Message posted by anyone except npub1m6k…zuz0",
  );
  assert.equal(
    describe({
      on: "reaction_added",
      filter: `trigger_message_id == "${MESSAGE}"`,
    }),
    "Reaction added to bbbbbbbb…bbbb",
  );
  assert.equal(
    describe({
      on: "reaction_added",
      filter: `trigger_emoji == "👾" && trigger_author == "${unresolvedAuthor}" && trigger_message_id == "${MESSAGE}"`,
    }),
    "👾 reaction added by npub1m6k…zuz0 to bbbbbbbb…bbbb",
  );
});

test("describes diff triggers with the diff subject", () => {
  assert.equal(
    describe({
      on: "diff_posted",
      filter: 'str_contains(trigger_text, "migration")',
    }),
    "Diff contains “migration”",
  );
  assert.equal(
    describe(
      {
        on: "diff_posted",
        filter: `str_contains(trigger_text, "migration") && trigger_author == "${AUTHOR}"`,
      },
      { authorLabel: "Carl" },
    ),
    "Diff by Carl contains “migration”",
  );
});

test("compacts only an included emoji already rendered as the node icon", () => {
  const compact = (trigger, triggerEmoji, options) =>
    compactWorkflowTriggerDescription(
      workflowTriggerDescriptor(trigger, options),
      i18n,
      triggerEmoji,
    );

  assert.equal(
    compact({ on: "reaction_added", filter: 'trigger_emoji == "😍"' }, "😍"),
    "Reaction added",
  );
  assert.equal(
    compact(
      {
        on: "reaction_added",
        filter: `trigger_emoji == "😍" && trigger_author == "${AUTHOR}"`,
      },
      "😍",
      { authorLabel: "Carl" },
    ),
    "Reaction added by Carl",
  );
  assert.equal(
    compact(
      {
        on: "reaction_added",
        filter: `trigger_emoji == "😍" && trigger_author == "${AUTHOR}" && trigger_message_id == "${MESSAGE}"`,
      },
      "😍",
      { authorLabel: "Carl", messageLabel: "release 😍 notes" },
    ),
    "Reaction added by Carl to “release 😍 notes”",
  );

  // A negated emoji condition is not what the node icon shows, so it stays.
  assert.equal(
    compact(
      { on: "reaction_added", filter: 'trigger_emoji != "😍"' },
      undefined,
    ),
    "Any reaction except 😍 added",
  );
  // The emoji inside a quoted message is not the trigger's emoji condition.
  assert.equal(
    compact(
      {
        on: "reaction_added",
        filter: `trigger_message_id == "${MESSAGE}"`,
      },
      "😍",
      { messageLabel: "😍 reaction added" },
    ),
    "Reaction added to “😍 reaction added”",
  );
});

test("keeps the base label for unfiltered and custom triggers", () => {
  assert.equal(describe({ on: "message_posted" }), "Message posted");
  assert.equal(
    describe({ on: "message_posted", filter: "custom_variable == 1" }),
    "Message posted",
  );
  // `webhook` and `schedule` have no event sentence and use their label.
  assert.equal(describe({ on: "webhook" }), "Webhook");
  assert.equal(describe({ on: "schedule", interval: "15m" }), "Schedule");
});

test("omits references it cannot resolve when the caller asks", () => {
  const unresolved = { omitUnresolvedReferences: true };
  assert.equal(
    describe(
      { on: "message_posted", filter: `trigger_author == "${AUTHOR}"` },
      unresolved,
    ),
    "Message posted",
  );
  assert.equal(
    describe(
      { on: "reaction_added", filter: `trigger_message_id == "${MESSAGE}"` },
      unresolved,
    ),
    "Reaction added",
  );
  // A text condition needs no resolution, so it survives alongside a dropped
  // author.
  assert.equal(
    describe(
      {
        on: "message_posted",
        filter: `str_contains(trigger_text, "deploy") && trigger_author == "${AUTHOR}"`,
      },
      unresolved,
    ),
    "Message contains “deploy”",
  );
});

test("abbreviates a long quoted value the same way in every clause", () => {
  const long = `${"x".repeat(40)}`;
  assert.equal(
    describe({
      on: "message_posted",
      filter: `str_contains(trigger_text, "${long}")`,
    }),
    `Message contains “${"x".repeat(33)}...”`,
  );
  assert.equal(
    describe({
      on: "message_posted",
      filter: 'str_contains(trigger_text, "a  b")',
    }),
    "Message contains “a b”",
  );
});
