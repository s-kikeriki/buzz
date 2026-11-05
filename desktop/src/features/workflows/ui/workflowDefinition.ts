import type { I18n } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";

import { resolveDescriptor } from "@/shared/i18n/resolveDescriptor";

import type { Workflow } from "@/shared/api/types";
import {
  scheduleFormFromTrigger,
  SCHEDULE_FREQUENCY_LABELS,
} from "./workflowSchedule";
import {
  ACTION_TYPES,
  TRIGGER_LABELS,
  TRIGGER_TYPES,
} from "./workflowFormTypes";
import type {
  ActionType,
  StepFormState,
  TriggerConfig,
  TriggerType,
} from "./workflowFormTypes";
import { workflowStepDetail } from "./workflowStepDescription";
import { parseConditionExpressions } from "./workflowConditionExpression";
import { workflowTriggerCardClause } from "./workflowTriggerCardClause";
import { workflowTriggerDescription } from "./workflowTriggerDescription";
import { workflowTriggerDescriptor } from "./workflowTriggerDescriptor";
import type { WorkflowTriggerDescriptor } from "./workflowTriggerDescriptor";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function humanizeIdentifier(value: string): string {
  return value.replaceAll("_", " ").replace(/\s+/g, " ").trim();
}

function getWorkflowSteps(
  definition: Record<string, unknown>,
): Record<string, unknown>[] {
  return Array.isArray(definition.steps)
    ? definition.steps.map(asRecord).filter((step) => step !== null)
    : [];
}

export function getWorkflowTriggerType(
  definition: Record<string, unknown>,
): string | null {
  return nonEmptyString(asRecord(definition.trigger)?.on);
}

export function getWorkflowPrimaryAction(
  definition: Record<string, unknown>,
): string | null {
  return nonEmptyString(getWorkflowSteps(definition)[0]?.action);
}

export function getWorkflowPrimaryActionEmoji(
  definition: Record<string, unknown>,
): string | null {
  return getWorkflowActionTiles(definition)[0]?.emoji ?? null;
}

export function getWorkflowActionTiles(
  definition: Record<string, unknown>,
): Array<{ action: string; emoji: string | null; key: string }> {
  return getWorkflowSteps(definition).map((step, index) => ({
    action: nonEmptyString(step.action) ?? "",
    emoji: step.action === "add_reaction" ? nonEmptyString(step.emoji) : null,
    key: nonEmptyString(step.id) ?? `step-${index}`,
  }));
}

export function getWorkflowTriggerEmoji(
  definition: Record<string, unknown>,
): string | null {
  const trigger = asRecord(definition.trigger);
  if (trigger?.on !== "reaction_added") return null;

  const legacyEmoji = nonEmptyString(trigger.emoji);
  if (legacyEmoji) return legacyEmoji;

  const filter = nonEmptyString(trigger.filter);
  if (!filter) return null;
  const conditions = parseConditionExpressions(filter, "reaction_added");
  const emojiCondition = conditions?.find(
    ({ field, operator }) => field === "trigger_emoji" && operator === "equals",
  );
  return nonEmptyString(emojiCondition?.value);
}

export function getWorkflowTriggerConfig(
  definition: Record<string, unknown>,
): TriggerConfig | null {
  const trigger = asRecord(definition.trigger);
  const triggerType = nonEmptyString(trigger?.on);
  if (
    !trigger ||
    !triggerType ||
    !TRIGGER_TYPES.includes(triggerType as TriggerType)
  ) {
    return null;
  }

  return {
    on: triggerType as TriggerType,
    filter: nonEmptyString(trigger.filter) ?? undefined,
    emoji: nonEmptyString(trigger.emoji) ?? undefined,
    cron: nonEmptyString(trigger.cron) ?? undefined,
    interval: nonEmptyString(trigger.interval) ?? undefined,
  };
}

function getScheduleCardClause(
  trigger: Record<string, unknown>,
  i18n: I18n,
): string {
  const schedule = scheduleFormFromTrigger({
    on: "schedule",
    cron: nonEmptyString(trigger.cron) ?? undefined,
    interval: nonEmptyString(trigger.interval) ?? undefined,
  });
  const { time } = schedule;

  switch (schedule.frequency) {
    case "daily":
      return i18n._(msg`Every day at ${time} UTC`);
    case "weekly":
      return i18n._(msg`Every week at ${time} UTC`);
    case "monthly":
      return i18n._(msg`Every month at ${time} UTC`);
    case "custom_interval": {
      const interval = schedule.customInterval;
      return interval
        ? i18n._(msg`Every ${interval}`)
        : i18n._(msg`On a schedule`);
    }
    case "custom_cron":
      return i18n._(msg`On a custom schedule`);
    default:
      return i18n._(SCHEDULE_FREQUENCY_LABELS[schedule.frequency]);
  }
}

/**
 * The card clause for a trigger with no conditions to describe: webhooks and
 * schedules, an absent trigger, a trigger type this build does not know yet,
 * and an unfiltered message, diff or reaction trigger.
 *
 * A reaction's emoji reaches this clause through `presentedReaction` or the
 * legacy `trigger.emoji` field rather than through a condition, which is why it
 * is not covered by the descriptor path.
 */
function getUnconditionalTriggerCardClause(
  definition: Record<string, unknown>,
  i18n: I18n,
  presentedReaction?: string,
): string {
  const trigger = asRecord(definition.trigger);
  const triggerType = nonEmptyString(trigger?.on);
  if (!trigger || !triggerType) {
    return i18n._(msg`When this workflow starts`);
  }

  switch (triggerType) {
    case "message_posted":
      return nonEmptyString(trigger.filter)
        ? i18n._(msg`When a matching message is posted`)
        : i18n._(msg`When a message is posted`);
    case "diff_posted":
      return nonEmptyString(trigger.filter)
        ? i18n._(msg`When a matching diff is posted`)
        : i18n._(msg`When a diff is posted`);
    case "reaction_added": {
      const emoji = nonEmptyString(presentedReaction ?? trigger.emoji);
      return emoji
        ? resolveDescriptor(i18n, msg`When someone reacts with {emoji}`, {
            emoji,
          })
        : i18n._(msg`When someone adds a reaction`);
    }
    case "webhook":
      return i18n._(msg`When a webhook arrives`);
    case "schedule":
      return getScheduleCardClause(trigger, i18n);
    default: {
      // A trigger type from a newer relay: its identifier is data, so it is
      // humanized rather than translated.
      const event = humanizeIdentifier(triggerType);
      return i18n._(msg`When ${event} happens`);
    }
  }
}

const ACTION_CARD_CLAUSES = {
  add_reaction: msg`add a {detail} reaction`,
  call_webhook: msg`call {detail}`,
  delay: msg`wait {detail}`,
  request_approval: msg`request approval: {detail}`,
  send_dm: msg`send {detail}`,
  send_message: msg`send {detail}`,
  send_message_in: msg`send a message in {detail}`,
  set_channel_topic: msg`set the channel topic to {detail}`,
} as const;

const UNCONFIGURED_ACTION_CARD_CLAUSES = {
  add_reaction: msg`add a reaction`,
  call_webhook: msg`call a webhook`,
  delay: msg`wait for a moment`,
  request_approval: msg`request approval`,
  send_dm: msg`send a direct message`,
  send_message: msg`send a channel message`,
  set_channel_topic: msg`update the channel topic`,
} as const;

function getActionCardClause(
  step: Record<string, unknown>,
  i18n: I18n,
  channelLabel?: string,
): string | null {
  const action = nonEmptyString(step.action);
  if (!action) return null;

  if (!ACTION_TYPES.includes(action as ActionType)) {
    // An action type from a newer relay. Its identifier is data, not copy.
    return humanizeIdentifier(action).toLocaleLowerCase();
  }

  const actionType = action as ActionType;
  const parsedStep: StepFormState = {
    action: actionType,
    id: nonEmptyString(step.id) ?? "step_1",
    duration: nonEmptyString(step.duration) ?? undefined,
    emoji: nonEmptyString(step.emoji) ?? undefined,
    from: nonEmptyString(step.from) ?? undefined,
    message: nonEmptyString(step.message) ?? undefined,
    method: nonEmptyString(step.method) ?? undefined,
    name: nonEmptyString(step.name) ?? undefined,
    text: nonEmptyString(step.text) ?? undefined,
    to: nonEmptyString(step.to) ?? undefined,
    topic: nonEmptyString(step.topic) ?? undefined,
    url: nonEmptyString(step.url) ?? undefined,
  };
  const detail = workflowStepDetail(parsedStep, i18n, channelLabel);
  if (!detail) {
    return i18n._(UNCONFIGURED_ACTION_CARD_CLAUSES[actionType]);
  }

  // A configured `send_message` with no text names the channel it posts in,
  // so it reads as a destination rather than as the message body.
  const descriptor =
    actionType === "send_message" && !nonEmptyString(step.text)
      ? ACTION_CARD_CLAUSES.send_message_in
      : ACTION_CARD_CLAUSES[actionType];
  return resolveDescriptor(i18n, descriptor, { detail });
}

export function getWorkflowStepCount(
  definition: Record<string, unknown>,
): number {
  return getWorkflowSteps(definition).length;
}

/** Build a short plain-language label from the workflow's trigger and steps. */
export function getWorkflowCardLabel(
  definition: Record<string, unknown>,
  i18n: I18n,
  options: {
    actionChannelLabel?: string;
    triggerDescriptor?: WorkflowTriggerDescriptor | null;
    triggerReaction?: string;
  } = {},
): string {
  const triggerConfig = getWorkflowTriggerConfig(definition);
  // The caller's descriptor is preferred: it carries the author and message
  // labels it has already resolved. Falling back to one built here, references
  // that have not resolved are left out rather than shown as a raw npub or
  // event id — and a caller that presents the reaction itself wants the
  // reaction clause, not a condition sentence.
  const descriptor =
    options.triggerDescriptor ??
    (triggerConfig?.filter && !options.triggerReaction
      ? workflowTriggerDescriptor(triggerConfig, {
          omitUnresolvedReferences: true,
        })
      : null);
  const triggerClause = descriptor
    ? workflowTriggerCardClause(descriptor, i18n)
    : getUnconditionalTriggerCardClause(
        definition,
        i18n,
        options.triggerReaction,
      );

  const steps = getWorkflowSteps(definition);
  const firstAction = steps[0]
    ? getActionCardClause(steps[0], i18n, options.actionChannelLabel)
    : null;
  if (!firstAction) return triggerClause;

  const remainingStepCount = steps.length - 1;
  if (remainingStepCount === 0) {
    return i18n._(msg`${triggerClause}, ${firstAction}`);
  }

  // One plural covering the whole tail, not a `${n} more step(s)` fragment
  // spliced into it: the cardinal and its noun sit together in the clause and
  // German inflects both.
  return i18n._(
    msg`${triggerClause}, ${firstAction}, then ${plural(remainingStepCount, {
      one: "# more step",
      other: "# more steps",
    })}`,
  );
}

export function getWorkflowDescription(
  definition: Record<string, unknown>,
): string | null {
  return nonEmptyString(definition.description);
}

export function getWorkflowEnabled(
  definition: Record<string, unknown>,
): boolean {
  return definition.enabled !== false;
}

export function withWorkflowEnabled(
  definition: Record<string, unknown>,
  enabled: boolean,
): Record<string, unknown> {
  const updated = { ...definition };
  if (enabled) {
    delete updated.enabled;
  } else {
    updated.enabled = false;
  }
  return updated;
}

export function getWorkflowDisplayStatus(
  workflow: Workflow,
): Workflow["status"] | "disabled" {
  if (workflow.status !== "active") {
    return workflow.status;
  }

  return getWorkflowEnabled(workflow.definition) ? workflow.status : "disabled";
}

export function getWorkflowTriggerSummary(
  definition: Record<string, unknown>,
  i18n: I18n,
): string | null {
  const trigger = getWorkflowTriggerConfig(definition);
  if (trigger) {
    return workflowTriggerDescription(trigger, i18n, {
      omitUnresolvedReferences: true,
    });
  }

  const rawTrigger = asRecord(definition.trigger);
  const triggerType = nonEmptyString(rawTrigger?.on);
  if (!triggerType) return null;
  const label = TRIGGER_LABELS[triggerType as TriggerType];
  return label ? i18n._(label) : triggerType;
}
