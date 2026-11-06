import { truncateNpub, truncatePubkey } from "@/shared/lib/pubkey";
import { parseConditionExpressions } from "./workflowConditionExpression";
import type {
  ConditionOperator,
  ParsedConditionExpression,
} from "./workflowConditionExpression";
import type { TriggerConfig, TriggerType } from "./workflowFormTypes";

/**
 * The three trigger types whose summary is a sentence about an event. `webhook`
 * and `schedule` have no event clause and fall back to their trigger label.
 */
export const DESCRIBED_TRIGGER_EVENTS = [
  "message_posted",
  "diff_posted",
  "reaction_added",
] as const;
export type WorkflowTriggerEvent = (typeof DESCRIBED_TRIGGER_EVENTS)[number];

/** The grammatical subject a text condition is phrased about. */
export type WorkflowTriggerTextSubject = "message" | "diff";

export type WorkflowTriggerTextClause = {
  operator: ConditionOperator;
  subject: WorkflowTriggerTextSubject;
  /** Normalized and abbreviated for display; the renderer adds the quotes. */
  value: string;
};

/**
 * A pubkey or event id the trigger filters on, reduced to what the renderer
 * needs: whether the condition is negated, whether the reference is still
 * resolving, and the display form of a resolved one.
 */
export type WorkflowTriggerReference = {
  loading: boolean;
  negated: boolean;
  /** Resolved display text. Empty while `loading`. */
  value: string;
  /** Resolved free text that reads as a quotation, never an identifier. */
  quoted: boolean;
};

/**
 * Everything the trigger summary says, as data.
 *
 * The copy is built from this by `workflowTriggerDescription` (the canvas
 * summary) and `workflowTriggerCardClause` (the "When …" card clause). Those
 * two registers word the same facts differently, and before this type existed
 * the card clause recovered the facts by re-parsing the canvas summary's
 * English prose — five parsers that all broke silently under any other
 * language. Anything that needs the facts reads them here instead.
 */
export type WorkflowTriggerDescriptor = {
  author?: WorkflowTriggerReference;
  emoji?: { negated: boolean; value: string };
  event: WorkflowTriggerEvent;
  message?: WorkflowTriggerReference;
  text?: WorkflowTriggerTextClause;
};

export type WorkflowTriggerDescriptorOptions = {
  authorLabel?: string;
  authorLoading?: boolean;
  messageLabel?: string;
  messageLoading?: boolean;
  /**
   * Drop an author or message condition whose label has not resolved. Card
   * labels use this so a workflow list never shows a raw npub or event id.
   */
  omitUnresolvedReferences?: boolean;
};

const TEXT_SUBJECTS: Partial<
  Record<WorkflowTriggerEvent, WorkflowTriggerTextSubject>
> = {
  diff_posted: "diff",
  message_posted: "message",
};

const VALUE_LIMIT = 36;
const VALUE_ABBREVIATION_LIMIT = 33;

/** Collapse whitespace and abbreviate a user value to a canvas-sized span. */
export function abbreviatedTriggerValue(value: string): string {
  const normalized = value.trim().replaceAll(/\s+/g, " ");
  return normalized.length > VALUE_LIMIT
    ? `${normalized.slice(0, VALUE_ABBREVIATION_LIMIT)}...`
    : normalized;
}

function isDescribedEvent(
  triggerType: TriggerType,
): triggerType is WorkflowTriggerEvent {
  return (DESCRIBED_TRIGGER_EVENTS as readonly string[]).includes(triggerType);
}

function authorReference(
  condition: ParsedConditionExpression,
  options: WorkflowTriggerDescriptorOptions,
): WorkflowTriggerReference | null {
  const negated = condition.operator === "not_equals";
  if (options.authorLoading) {
    return { loading: true, negated, quoted: false, value: "" };
  }
  if (options.authorLabel) {
    return {
      loading: false,
      negated,
      quoted: false,
      value: options.authorLabel,
    };
  }
  if (options.omitUnresolvedReferences) return null;
  // The trigger author is a pubkey identity; the unresolved fallback renders
  // the npub compact, never raw hex.
  return {
    loading: false,
    negated,
    quoted: false,
    value: truncateNpub(condition.value),
  };
}

function messageReference(
  condition: ParsedConditionExpression,
  options: WorkflowTriggerDescriptorOptions,
): WorkflowTriggerReference | null {
  const negated = condition.operator === "not_equals";
  if (options.messageLoading) {
    return { loading: true, negated, quoted: false, value: "" };
  }
  if (options.messageLabel) {
    return {
      loading: false,
      negated,
      quoted: true,
      value: abbreviatedTriggerValue(options.messageLabel),
    };
  }
  if (options.omitUnresolvedReferences) return null;
  // The referenced message is an event id, not a pubkey identity: it keeps
  // the generic hex truncation.
  return {
    loading: false,
    negated,
    quoted: false,
    value: truncatePubkey(condition.value),
  };
}

/**
 * Reduce a trigger to the facts its summary states, or `null` when the trigger
 * has no event clause at all (`webhook`, `schedule`) and the caller should use
 * the trigger label instead.
 *
 * A descriptor with no conditions is not the same as `null`: it renders as the
 * bare event phrase ("Message posted"), which is what an unfiltered trigger and
 * an unparseable filter both show today.
 */
export function workflowTriggerDescriptor(
  trigger: TriggerConfig,
  options: WorkflowTriggerDescriptorOptions = {},
): WorkflowTriggerDescriptor | null {
  if (!isDescribedEvent(trigger.on)) return null;

  const event = trigger.on;
  const descriptor: WorkflowTriggerDescriptor = { event };
  const conditions = trigger.filter
    ? parseConditionExpressions(trigger.filter, trigger.on)
    : [];
  if (!conditions || conditions.length === 0) return descriptor;

  const textSubject = TEXT_SUBJECTS[event];
  const textCondition = conditions.find(
    ({ field }) => field === "trigger_text",
  );
  if (textCondition && textSubject) {
    descriptor.text = {
      operator: textCondition.operator,
      subject: textSubject,
      value: abbreviatedTriggerValue(textCondition.value),
    };
  }

  const emojiCondition = conditions.find(
    ({ field }) => field === "trigger_emoji",
  );
  if (emojiCondition) {
    descriptor.emoji = {
      negated: emojiCondition.operator === "not_equals",
      value: emojiCondition.value,
    };
  }

  const authorCondition = conditions.find(
    ({ field }) => field === "trigger_author",
  );
  if (authorCondition) {
    const author = authorReference(authorCondition, options);
    if (author) descriptor.author = author;
  }

  const messageCondition = conditions.find(
    ({ field }) => field === "trigger_message_id",
  );
  if (messageCondition) {
    const message = messageReference(messageCondition, options);
    if (message) descriptor.message = message;
  }

  return descriptor;
}

/** Whether the descriptor states anything beyond the bare event. */
export function hasWorkflowTriggerConditions(
  descriptor: WorkflowTriggerDescriptor,
): boolean {
  return Boolean(
    descriptor.author ||
      descriptor.emoji ||
      descriptor.message ||
      descriptor.text,
  );
}
