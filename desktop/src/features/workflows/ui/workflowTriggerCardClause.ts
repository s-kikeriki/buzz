import type { I18n, MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

import { resolveDescriptor } from "@/shared/i18n/resolveDescriptor";

import type { ConditionOperator } from "./workflowConditionExpression";
import {
  workflowTriggerAttribution,
  workflowTriggerMessageReference,
} from "./workflowTriggerDescription";
import type {
  WorkflowTriggerDescriptor,
  WorkflowTriggerTextSubject,
} from "./workflowTriggerDescriptor";

/**
 * The "When …" clause a workflow card opens with.
 *
 * This is the same information as the canvas summary in a different register:
 * the canvas says "Message contains X", the card says "When a message contains
 * X, send Y". It is built from the descriptor, not from the canvas sentence —
 * five regex parsers used to recover the facts from that sentence's English,
 * and all five silently produced nothing under any other language.
 *
 * Unlike the canvas register, the event noun cannot be a placeholder here: it
 * follows an article, and German's article agrees with the noun's gender
 * ("eine Nachricht", "ein Diff"). So each operator carries one whole sentence
 * per subject.
 */
type CardTextClauses = Record<
  WorkflowTriggerTextSubject,
  Record<ConditionOperator, MessageDescriptor>
>;

const CARD_TEXT_CLAUSES: CardTextClauses = {
  diff: {
    contains: msg`When a diff contains “{value}”`,
    ends_with: msg`When a diff ends with “{value}”`,
    equals: msg`When a diff “{value}” is posted`,
    is_empty: msg`When a diff without text is posted`,
    is_not_empty: msg`When a diff with text is posted`,
    not_contains: msg`When a diff doesn’t contain “{value}”`,
    not_equals: msg`When a diff with text other than “{value}” is posted`,
    starts_with: msg`When a diff starts with “{value}”`,
  },
  message: {
    contains: msg`When a message contains “{value}”`,
    ends_with: msg`When a message ends with “{value}”`,
    equals: msg`When “{value}” is posted`,
    is_empty: msg`When a message without text is posted`,
    is_not_empty: msg`When a message with text is posted`,
    not_contains: msg`When a message doesn’t contain “{value}”`,
    not_equals: msg`When a message with text other than “{value}” is posted`,
    starts_with: msg`When a message starts with “{value}”`,
  },
};

const CARD_TEXT_CLAUSES_WITH_AUTHOR: CardTextClauses = {
  diff: {
    contains: msg`When a diff {attribution} contains “{value}”`,
    ends_with: msg`When a diff {attribution} ends with “{value}”`,
    equals: msg`When a diff “{value}” is posted {attribution}`,
    is_empty: msg`When a diff without text is posted {attribution}`,
    is_not_empty: msg`When a diff with text is posted {attribution}`,
    not_contains: msg`When a diff {attribution} doesn’t contain “{value}”`,
    not_equals: msg`When a diff with text other than “{value}” is posted {attribution}`,
    starts_with: msg`When a diff {attribution} starts with “{value}”`,
  },
  message: {
    contains: msg`When a message {attribution} contains “{value}”`,
    ends_with: msg`When a message {attribution} ends with “{value}”`,
    equals: msg`When “{value}” is posted {attribution}`,
    is_empty: msg`When a message without text is posted {attribution}`,
    is_not_empty: msg`When a message with text is posted {attribution}`,
    not_contains: msg`When a message {attribution} doesn’t contain “{value}”`,
    not_equals: msg`When a message with text other than “{value}” is posted {attribution}`,
    starts_with: msg`When a message {attribution} starts with “{value}”`,
  },
};

const CARD_POSTED_CLAUSES: Record<
  WorkflowTriggerTextSubject,
  MessageDescriptor
> = {
  diff: msg`When a diff is posted`,
  message: msg`When a message is posted`,
};

const CARD_POSTED_CLAUSES_WITH_AUTHOR: Record<
  WorkflowTriggerTextSubject,
  MessageDescriptor
> = {
  diff: msg`When a diff is posted {attribution}`,
  message: msg`When a message is posted {attribution}`,
};

const CARD_REACTION_CLAUSES = {
  emojiNegated: msg`When any reaction except {emoji} is added`,
  emojiPositive: msg`When someone reacts with {emoji}`,
  plain: msg`When a reaction is added`,
} as const;

const CARD_REACTION_CLAUSES_WITH_AUTHOR = {
  emojiNegated: msg`When any reaction except {emoji} is added {attribution}`,
  emojiPositive: msg`When someone reacts with {emoji} {attribution}`,
  plain: msg`When a reaction is added {attribution}`,
} as const;

const TEXT_SUBJECTS: Record<
  "diff_posted" | "message_posted",
  WorkflowTriggerTextSubject
> = {
  diff_posted: "diff",
  message_posted: "message",
};

function reactionCardClause(
  descriptor: WorkflowTriggerDescriptor,
  i18n: I18n,
  attribution: string | null,
): string {
  const { emoji } = descriptor;
  const table = attribution
    ? CARD_REACTION_CLAUSES_WITH_AUTHOR
    : CARD_REACTION_CLAUSES;
  if (!emoji) {
    return resolveDescriptor(i18n, table.plain, {
      attribution: attribution ?? "",
    });
  }
  return resolveDescriptor(
    i18n,
    emoji.negated ? table.emojiNegated : table.emojiPositive,
    { attribution: attribution ?? "", emoji: emoji.value },
  );
}

function postedCardClause(
  descriptor: WorkflowTriggerDescriptor,
  subject: WorkflowTriggerTextSubject,
  i18n: I18n,
  attribution: string | null,
): string {
  const { text } = descriptor;
  if (!text) {
    return attribution
      ? resolveDescriptor(i18n, CARD_POSTED_CLAUSES_WITH_AUTHOR[subject], {
          attribution,
        })
      : i18n._(CARD_POSTED_CLAUSES[subject]);
  }
  const table = attribution ? CARD_TEXT_CLAUSES_WITH_AUTHOR : CARD_TEXT_CLAUSES;
  return resolveDescriptor(i18n, table[subject][text.operator], {
    attribution: attribution ?? "",
    value: text.value,
  });
}

/** Build the "When …" clause a workflow card's plain-language label opens with. */
export function workflowTriggerCardClause(
  descriptor: WorkflowTriggerDescriptor,
  i18n: I18n,
): string {
  const attribution = descriptor.author
    ? workflowTriggerAttribution(descriptor.author, i18n)
    : null;
  const clause =
    descriptor.event === "reaction_added"
      ? reactionCardClause(descriptor, i18n, attribution)
      : postedCardClause(
          descriptor,
          TEXT_SUBJECTS[descriptor.event],
          i18n,
          attribution,
        );
  return descriptor.message
    ? `${clause} ${workflowTriggerMessageReference(descriptor.message, i18n)}`
    : clause;
}
