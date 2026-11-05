import { i18n } from "@lingui/core";
import assert from "node:assert/strict";
import test from "node:test";

import { workflowTriggerCardClause } from "./workflowTriggerCardClause.ts";
import { workflowTriggerDescription } from "./workflowTriggerDescription.ts";
import { workflowTriggerDescriptor } from "./workflowTriggerDescriptor.ts";

const AUTHOR = "a".repeat(64);
const MESSAGE = "b".repeat(64);

const clause = (trigger, options) =>
  workflowTriggerCardClause(workflowTriggerDescriptor(trigger, options), i18n);

test("phrases every text operator as a card clause", () => {
  const cases = [
    [
      'str_contains(trigger_text, "deploy")',
      "When a message contains “deploy”",
    ],
    [
      '!str_contains(trigger_text, "deploy")',
      "When a message doesn’t contain “deploy”",
    ],
    [
      'str_starts_with(trigger_text, "deploy")',
      "When a message starts with “deploy”",
    ],
    ['str_ends_with(trigger_text, "done")', "When a message ends with “done”"],
    ['trigger_text == "deploy"', "When “deploy” is posted"],
    [
      'trigger_text != "deploy"',
      "When a message with text other than “deploy” is posted",
    ],
    ["str_len(trigger_text) > 0", "When a message with text is posted"],
    ["str_len(trigger_text) == 0", "When a message without text is posted"],
  ];
  for (const [filter, expected] of cases) {
    assert.equal(clause({ on: "message_posted", filter }), expected, filter);
  }
});

test("names the diff subject with its own article", () => {
  // The event noun is not a placeholder in this register: it follows an
  // article, and in German the article agrees with the noun's gender. Each
  // subject therefore has its own sentence.
  assert.equal(
    clause({
      on: "diff_posted",
      filter: 'str_contains(trigger_text, "migration")',
    }),
    "When a diff contains “migration”",
  );
  assert.equal(
    clause({ on: "diff_posted", filter: 'trigger_text == "migration"' }),
    "When a diff “migration” is posted",
  );
  assert.equal(
    clause(
      { on: "diff_posted", filter: `trigger_author == "${AUTHOR}"` },
      {
        authorLabel: "Carl",
      },
    ),
    "When a diff is posted by Carl",
  );
});

test("keeps the author attribution in the position the sentence gives it", () => {
  assert.equal(
    clause(
      { on: "message_posted", filter: `trigger_author == "${AUTHOR}"` },
      {
        authorLabel: "Carl",
      },
    ),
    "When a message is posted by Carl",
  );
  assert.equal(
    clause(
      { on: "message_posted", filter: `trigger_author != "${AUTHOR}"` },
      {
        authorLabel: "Carl",
      },
    ),
    "When a message is posted by anyone except Carl",
  );
  assert.equal(
    clause(
      {
        on: "message_posted",
        filter: `str_contains(trigger_text, "deploy") && trigger_author == "${AUTHOR}"`,
      },
      { authorLabel: "Carl" },
    ),
    "When a message by Carl contains “deploy”",
  );
  assert.equal(
    clause(
      {
        on: "message_posted",
        filter: `trigger_text == "FUCK" && trigger_author == "${AUTHOR}"`,
      },
      { authorLabel: "Carl" },
    ),
    "When “FUCK” is posted by Carl",
  );
});

test("phrases reaction triggers by what they filter on", () => {
  assert.equal(
    clause({ on: "reaction_added", filter: 'trigger_emoji == "🔥"' }),
    "When someone reacts with 🔥",
  );
  assert.equal(
    clause({ on: "reaction_added", filter: 'trigger_emoji != "🔥"' }),
    "When any reaction except 🔥 is added",
  );
  assert.equal(
    clause(
      { on: "reaction_added", filter: `trigger_author == "${AUTHOR}"` },
      {
        authorLabel: "Carl",
      },
    ),
    "When a reaction is added by Carl",
  );
  assert.equal(
    clause(
      {
        on: "reaction_added",
        filter: `trigger_author == "${AUTHOR}" && trigger_message_id == "${MESSAGE}"`,
      },
      { authorLabel: "Carl", messageLabel: "ship it" },
    ),
    "When a reaction is added by Carl to “ship it”",
  );
  assert.equal(
    clause(
      { on: "reaction_added", filter: `trigger_message_id != "${MESSAGE}"` },
      { messageLabel: "ship it" },
    ),
    "When a reaction is added anywhere except “ship it”",
  );
});

test("states the same facts as the canvas summary, in its own register", () => {
  // The two registers are built from one descriptor. Before that they were
  // built from each other: the card clause recovered the facts by matching
  // the canvas sentence's English with five regexes, so the only thing that
  // kept them agreeing was that both were English.
  const trigger = {
    on: "reaction_added",
    filter: `trigger_emoji == "👾" && trigger_author == "${AUTHOR}" && trigger_message_id == "${MESSAGE}"`,
  };
  const options = { authorLabel: "Carl", messageLabel: "hey yourself" };
  assert.equal(
    workflowTriggerDescription(trigger, i18n, options),
    "👾 reaction added by Carl to “hey yourself”",
  );
  assert.equal(
    clause(trigger, options),
    "When someone reacts with 👾 by Carl to “hey yourself”",
  );
});

test("says a reference is loading rather than naming an unresolved one", () => {
  assert.equal(
    clause(
      { on: "message_posted", filter: `trigger_author == "${AUTHOR}"` },
      {
        authorLoading: true,
      },
    ),
    "When a message is posted by loading author",
  );
  assert.equal(
    clause(
      { on: "reaction_added", filter: `trigger_message_id == "${MESSAGE}"` },
      {
        messageLoading: true,
      },
    ),
    "When a reaction is added to loading message",
  );
});
