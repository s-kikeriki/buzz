import type { I18n, MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

import { resolveDescriptor } from "@/shared/i18n/resolveDescriptor";

import type { ConditionOperator } from "./workflowConditionExpression";
import { TRIGGER_LABELS } from "./workflowFormTypes";
import type { TriggerConfig } from "./workflowFormTypes";
import { workflowTriggerDescriptor } from "./workflowTriggerDescriptor";
import type {
  WorkflowTriggerDescriptor,
  WorkflowTriggerDescriptorOptions,
  WorkflowTriggerEvent,
  WorkflowTriggerReference,
  WorkflowTriggerTextSubject,
} from "./workflowTriggerDescriptor";

/**
 * Placeholder the author's name is rendered as when the caller wants to put an
 * avatar in its place. U+0000 cannot occur in the copy around it, so splitting
 * on it recovers the two halves in any language — unlike searching the finished
 * sentence for the name, which matched the same name quoted inside user text.
 */
const AUTHOR_SLOT = "\u0000";

/** The event phrase a summary opens with when it has nothing else to say. */
const EVENT_PHRASES: Record<WorkflowTriggerEvent, MessageDescriptor> = {
  diff_posted: msg`Diff posted`,
  message_posted: msg`Message posted`,
  reaction_added: msg`Reaction added`,
};

/** The same event, phrased as the subject a text condition is about. */
const TEXT_SUBJECT_NOUNS: Record<
  WorkflowTriggerTextSubject,
  MessageDescriptor
> = {
  diff: msg`Diff`,
  message: msg`Message`,
};

/**
 * The event phrase with an author attribution.
 *
 * Separate messages rather than `"{eventPhrase} {attribution}"`: German puts
 * the attribution before the participle, so the position has to belong to the
 * translator, not to a `+` in this file.
 */
const EVENT_PHRASES_WITH_AUTHOR: Record<
  WorkflowTriggerEvent,
  MessageDescriptor
> = {
  diff_posted: msg`Diff posted {attribution}`,
  message_posted: msg`Message posted {attribution}`,
  reaction_added: msg`Reaction added {attribution}`,
};

/** `by {author}`, in the four states an author reference can be in. */
const AUTHOR_ATTRIBUTIONS = {
  loadingNegated: msg`by anyone except loading author`,
  loadingPositive: msg`by loading author`,
  negated: msg`by anyone except {author}`,
  positive: msg`by {author}`,
} as const;

/** `to {message}`, appended after the clause it qualifies. */
const MESSAGE_REFERENCES = {
  loadingNegated: msg`anywhere except loading message`,
  loadingPositive: msg`to loading message`,
  negatedPlain: msg`anywhere except {message}`,
  negatedQuoted: msg`anywhere except “{message}”`,
  positivePlain: msg`to {message}`,
  positiveQuoted: msg`to “{message}”`,
} as const;

const EMOJI_CLAUSES = {
  negated: msg`Any reaction except {emoji} added`,
  positive: msg`{emoji} reaction added`,
} as const;

const EMOJI_CLAUSES_WITH_AUTHOR = {
  negated: msg`Any reaction except {emoji} added {attribution}`,
  positive: msg`{emoji} reaction added {attribution}`,
} as const;

/**
 * One whole sentence per text operator, in both author states.
 *
 * The attribution's position is not the same for every operator — English says
 * "Message by Carl contains X" but "Message X is posted by Carl" — and it is
 * not the same in every language either. Each frame therefore carries the slot
 * itself. The subject stays a placeholder because it opens the clause with no
 * article; the card-clause register cannot do that and says why there.
 */
const TEXT_CLAUSES: Record<ConditionOperator, MessageDescriptor> = {
  contains: msg`{subject} contains “{value}”`,
  ends_with: msg`{subject} ends with “{value}”`,
  equals: msg`{subject} “{value}” is posted`,
  is_empty: msg`{subject} without text posted`,
  is_not_empty: msg`{subject} with text posted`,
  not_contains: msg`{subject} doesn’t contain “{value}”`,
  not_equals: msg`{subject} with text other than “{value}” posted`,
  starts_with: msg`{subject} starts with “{value}”`,
};

const TEXT_CLAUSES_WITH_AUTHOR: Record<ConditionOperator, MessageDescriptor> = {
  contains: msg`{subject} {attribution} contains “{value}”`,
  ends_with: msg`{subject} {attribution} ends with “{value}”`,
  equals: msg`{subject} “{value}” is posted {attribution}`,
  is_empty: msg`{subject} without text posted {attribution}`,
  is_not_empty: msg`{subject} with text posted {attribution}`,
  not_contains: msg`{subject} {attribution} doesn’t contain “{value}”`,
  not_equals: msg`{subject} with text other than “{value}” posted {attribution}`,
  starts_with: msg`{subject} {attribution} starts with “{value}”`,
};

/** Strip the private author slot so user text can never forge it. */
function safeValue(value: string): string {
  return value.replaceAll(AUTHOR_SLOT, "");
}

/** `by {author}` for the author reference, in the caller's register. */
export function workflowTriggerAttribution(
  author: WorkflowTriggerReference,
  i18n: I18n,
): string {
  return authorAttribution(author, i18n, "");
}

/** `to {message}` for the message reference, in the caller's register. */
export function workflowTriggerMessageReference(
  message: WorkflowTriggerReference,
  i18n: I18n,
): string {
  return messageReferenceClause(message, i18n);
}

function authorAttribution(
  author: WorkflowTriggerReference,
  i18n: I18n,
  authorSlot: string,
): string {
  if (author.loading) {
    return i18n._(
      author.negated
        ? AUTHOR_ATTRIBUTIONS.loadingNegated
        : AUTHOR_ATTRIBUTIONS.loadingPositive,
    );
  }
  return resolveDescriptor(
    i18n,
    author.negated ? AUTHOR_ATTRIBUTIONS.negated : AUTHOR_ATTRIBUTIONS.positive,
    { author: authorSlot || safeValue(author.value) },
  );
}

function messageReferenceClause(
  message: WorkflowTriggerReference,
  i18n: I18n,
): string {
  if (message.loading) {
    return i18n._(
      message.negated
        ? MESSAGE_REFERENCES.loadingNegated
        : MESSAGE_REFERENCES.loadingPositive,
    );
  }
  const descriptor = message.negated
    ? message.quoted
      ? MESSAGE_REFERENCES.negatedQuoted
      : MESSAGE_REFERENCES.negatedPlain
    : message.quoted
      ? MESSAGE_REFERENCES.positiveQuoted
      : MESSAGE_REFERENCES.positivePlain;
  return resolveDescriptor(i18n, descriptor, {
    message: safeValue(message.value),
  });
}

/**
 * The clause the summary is built around: the emoji condition if there is one,
 * then the text condition, and the bare event phrase if neither applies.
 *
 * The emoji wins over a text condition because it replaced it outright before
 * this was data; the two cannot occur together, since a reaction trigger has no
 * text field and a message trigger has no emoji field.
 */
function baseClause(
  descriptor: WorkflowTriggerDescriptor,
  i18n: I18n,
  attribution: string | null,
): string {
  const { emoji, event, text } = descriptor;
  if (emoji) {
    const table = attribution ? EMOJI_CLAUSES_WITH_AUTHOR : EMOJI_CLAUSES;
    return resolveDescriptor(
      i18n,
      emoji.negated ? table.negated : table.positive,
      { attribution: attribution ?? "", emoji: safeValue(emoji.value) },
    );
  }
  if (text) {
    const table = attribution ? TEXT_CLAUSES_WITH_AUTHOR : TEXT_CLAUSES;
    return resolveDescriptor(i18n, table[text.operator], {
      attribution: attribution ?? "",
      subject: i18n._(TEXT_SUBJECT_NOUNS[text.subject]),
      value: safeValue(text.value),
    });
  }
  return attribution
    ? resolveDescriptor(i18n, EVENT_PHRASES_WITH_AUTHOR[event], { attribution })
    : i18n._(EVENT_PHRASES[event]);
}

function renderDescriptor(
  descriptor: WorkflowTriggerDescriptor,
  i18n: I18n,
  authorSlot: string,
): string {
  const attribution = descriptor.author
    ? authorAttribution(descriptor.author, i18n, authorSlot)
    : null;
  const clause = baseClause(descriptor, i18n, attribution);
  return descriptor.message
    ? `${clause} ${messageReferenceClause(descriptor.message, i18n)}`
    : clause;
}

/** Build the concise trigger summary rendered on the workflow canvas. */
export function workflowTriggerDescription(
  trigger: TriggerConfig,
  i18n: I18n,
  options: WorkflowTriggerDescriptorOptions = {},
): string {
  const descriptor = workflowTriggerDescriptor(trigger, options);
  return descriptor
    ? renderDescriptor(descriptor, i18n, "")
    : i18n._(TRIGGER_LABELS[trigger.on]);
}

/** Render a descriptor the caller already built. */
export function workflowTriggerDescriptorText(
  descriptor: WorkflowTriggerDescriptor,
  i18n: I18n,
): string {
  return renderDescriptor(descriptor, i18n, "");
}

/**
 * Drop a reaction emoji the caller already renders as the node's icon.
 *
 * This removes the emoji *condition*, rather than editing the emoji out of a
 * finished sentence: a negated emoji condition keeps its clause (nothing shows
 * that emoji as an icon), and a message quotation that happens to contain the
 * same emoji is untouched for free.
 */
export function compactWorkflowTriggerDescriptor(
  descriptor: WorkflowTriggerDescriptor,
  triggerEmoji?: string,
): WorkflowTriggerDescriptor {
  const compactable =
    triggerEmoji && descriptor.emoji && !descriptor.emoji.negated;
  return compactable ? { ...descriptor, emoji: undefined } : descriptor;
}

/** The compacted summary as text. */
export function compactWorkflowTriggerDescription(
  descriptor: WorkflowTriggerDescriptor,
  i18n: I18n,
  triggerEmoji?: string,
): string {
  return renderDescriptor(
    compactWorkflowTriggerDescriptor(descriptor, triggerEmoji),
    i18n,
    "",
  );
}

export type WorkflowAuthorDescriptionSegments = {
  prefix: string;
  suffix: string;
};

/**
 * Split the summary where the author's name goes, so the caller can put an
 * avatar there. Returns `null` when the summary names no author.
 */
export function splitWorkflowAuthorDescription(
  descriptor: WorkflowTriggerDescriptor,
  i18n: I18n,
): WorkflowAuthorDescriptionSegments | null {
  if (!descriptor.author || descriptor.author.loading) return null;

  const rendered = renderDescriptor(descriptor, i18n, AUTHOR_SLOT);
  const slot = rendered.indexOf(AUTHOR_SLOT);
  if (slot < 0) return null;
  return {
    prefix: rendered.slice(0, slot).trimEnd(),
    suffix: rendered.slice(slot + AUTHOR_SLOT.length).trimStart(),
  };
}
