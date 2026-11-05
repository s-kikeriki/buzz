import type { I18n, MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

import { resolveDescriptor } from "@/shared/i18n/resolveDescriptor";
import { stringify as yamlStringify, parse as yamlParse } from "yaml";

import {
  parsePubkeyInput as parseCanonicalPubkey,
  safeNpub,
} from "@/shared/lib/nostrUtils";

import { cronExpressionError } from "./cronExpression";
import {
  formatDurationSeconds,
  parseDurationSeconds,
} from "./workflowDuration";

export const TRIGGER_TYPES = [
  "message_posted",
  "reaction_added",
  "diff_posted",
  "webhook",
  "schedule",
] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export function supportsMessageTextCondition(
  triggerType: TriggerType,
): boolean {
  return triggerType === "message_posted" || triggerType === "diff_posted";
}

export const SELECTABLE_TRIGGER_TYPES = [
  "message_posted",
  "reaction_added",
  "diff_posted",
  "webhook",
  "schedule",
] as const satisfies readonly TriggerType[];

export const ACTION_TYPES = [
  "delay",
  "send_message",
  "send_dm",
  "call_webhook",
  "request_approval",
  "add_reaction",
  "set_channel_topic",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const SELECTABLE_ACTION_TYPES = [
  "send_message",
  "delay",
  "call_webhook",
] as const satisfies readonly ActionType[];

export type TriggerConfig = {
  on: TriggerType;
  filter?: string;
  emoji?: string;
  cron?: string;
  interval?: string;
};

export type HeaderFormState = {
  id: string;
  key: string;
  value: string;
};

export type StepFormState = {
  id: string;
  name?: string;
  action: ActionType;
  condition?: string;
  timeoutSecs?: string;
  duration?: string;
  text?: string;
  channel?: string;
  replyInThread?: boolean;
  to?: string;
  url?: string;
  method?: string;
  headers?: HeaderFormState[];
  body?: string;
  emoji?: string;
  topic?: string;
  from?: string;
  message?: string;
  timeout?: string;
};

export type WorkflowFormState = {
  name: string;
  description: string;
  enabled: boolean;
  trigger: TriggerConfig;
  steps: StepFormState[];
};

export const DEFAULT_FORM_STATE: WorkflowFormState = {
  name: "",
  description: "",
  enabled: true,
  trigger: { on: "message_posted" },
  steps: [],
};

/**
 * Trigger and action names, as message descriptors resolved per render with
 * `i18n._(...)`. A plain string here would freeze in whichever locale happened
 * to be active when the module first loaded, and the coverage detector cannot
 * see a table whose values are single words — `webhook: "Webhook"` switches its
 * own table's rule off — so nothing but reading catches it.
 */
export const TRIGGER_LABELS: Record<TriggerType, MessageDescriptor> = {
  message_posted: msg`Message Posted`,
  reaction_added: msg`Reaction Added`,
  diff_posted: msg`Diff Posted`,
  webhook: msg`Webhook`,
  schedule: msg`Schedule`,
};

export const ACTION_LABELS: Record<ActionType, MessageDescriptor> = {
  delay: msg`Delay`,
  send_message: msg`Send Message`,
  send_dm: msg`Send DM`,
  call_webhook: msg`Call Webhook`,
  request_approval: msg`Request Approval`,
  add_reaction: msg`Add Reaction`,
  set_channel_topic: msg`Set Channel Topic`,
};

const EXACT_HEX_64 = /^[0-9a-fA-F]{64}$/;

/**
 * Display form of a DM recipient (`to`) or approver (`from`): an exact 64-char
 * hex pubkey from stored YAML is shown as its npub; npubs, templates
 * (`{{trigger.author}}`), roles, and any other free text pass through
 * unchanged. Encoding failures (non-canonical hex) keep the stored value.
 */
function keyDisplayValue(value: string | undefined): string | undefined {
  if (value === undefined || !EXACT_HEX_64.test(value)) return value;
  return safeNpub(value.toLowerCase()) ?? value;
}

/**
 * Storage form: an exact npub decodes back to the canonical hex pubkey so the
 * wire YAML keeps its machine-readable hex contract. Hex, templates, roles,
 * and any other free text pass through unchanged.
 */
function keyStorageValue(value: string): string {
  if (!value.trim().toLowerCase().startsWith("npub1")) return value;
  return parseCanonicalPubkey(value) ?? value;
}

function toHeaderRows(
  headers: unknown,
  stepId: string,
): HeaderFormState[] | undefined {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    return undefined;
  }

  const rows = Object.entries(headers).map(([key, value], index) => ({
    id: `${stepId}_header_${index + 1}`,
    key,
    value: typeof value === "string" ? value : String(value),
  }));

  return rows.length > 0 ? rows : undefined;
}

function headersToRecord(
  headers: HeaderFormState[] | undefined,
): Record<string, string> | undefined {
  if (!headers) return undefined;

  const entries = headers
    .map(({ key, value }) => [key.trim(), value] as const)
    .filter(([key]) => key.length > 0);

  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
}

function parseTimeoutSecs(timeoutSecs: string | undefined): number | undefined {
  if (!timeoutSecs) return undefined;
  const parsed = parseDurationSeconds(timeoutSecs);
  return parsed !== null && parsed > 0 ? parsed : undefined;
}

function actionFieldsForStep(step: StepFormState): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (step.name?.trim()) fields.name = step.name.trim();
  if (step.condition?.trim()) fields.if = step.condition.trim();
  const timeoutSecs = parseTimeoutSecs(step.timeoutSecs);
  if (timeoutSecs !== undefined) fields.timeout_secs = timeoutSecs;

  switch (step.action) {
    case "delay":
      if (step.duration) fields.duration = step.duration;
      break;
    case "send_message":
      if (step.text) fields.text = step.text;
      if (step.channel) fields.channel = step.channel;
      if (step.replyInThread) fields.reply_in_thread = true;
      break;
    case "send_dm":
      if (step.to) fields.to = keyStorageValue(step.to);
      if (step.text) fields.text = step.text;
      break;
    case "call_webhook":
      if (step.url) fields.url = step.url;
      fields.method = step.method || "POST";
      {
        const headers = headersToRecord(step.headers);
        if (headers) fields.headers = headers;
      }
      if (step.body) fields.body = step.body;
      break;
    case "request_approval":
      if (step.from) fields.from = keyStorageValue(step.from);
      if (step.message) fields.message = step.message;
      if (step.timeout) fields.timeout = step.timeout;
      break;
    case "add_reaction":
      if (step.emoji) fields.emoji = step.emoji;
      break;
    case "set_channel_topic":
      if (step.topic) fields.topic = step.topic;
      break;
  }
  return fields;
}

export function isThreadReplyEligibleTrigger(trigger: TriggerType): boolean {
  return trigger !== "webhook" && trigger !== "schedule";
}

export function withTriggerType(
  state: WorkflowFormState,
  triggerType: TriggerType,
): WorkflowFormState {
  return {
    ...state,
    trigger: { on: triggerType },
    // Clear threaded-reply state on every step, not just send_message ones:
    // a hidden `replyInThread` on a step whose action was changed away from
    // send_message would otherwise resurrect when the action is switched back.
    steps: isThreadReplyEligibleTrigger(triggerType)
      ? state.steps
      : state.steps.map((step) =>
          step.replyInThread ? { ...step, replyInThread: false } : step,
        ),
  };
}

export function formStateToYaml(state: WorkflowFormState): string {
  const trigger: Record<string, unknown> = { on: state.trigger.on };
  if (
    (state.trigger.on === "message_posted" ||
      state.trigger.on === "diff_posted" ||
      state.trigger.on === "reaction_added") &&
    state.trigger.filter
  ) {
    trigger.filter = state.trigger.filter;
  }
  if (state.trigger.on === "reaction_added" && state.trigger.emoji) {
    trigger.emoji = state.trigger.emoji;
  }
  if (state.trigger.on === "schedule") {
    if (state.trigger.cron) {
      trigger.cron = state.trigger.cron;
    } else if (state.trigger.interval) {
      trigger.interval = state.trigger.interval;
    }
  }

  const steps = state.steps.map((step) => ({
    id: step.id,
    action: step.action,
    ...actionFieldsForStep(step),
  }));

  const workflow: Record<string, unknown> = {
    name: state.name,
    trigger,
    steps,
  };

  if (state.description.trim()) {
    workflow.description = state.description.trim();
  }
  if (!state.enabled) {
    workflow.enabled = false;
  }

  return yamlStringify(workflow);
}

const STEP_ID_PATTERN = /^step_(\d+)$/;

export function nextStepId(existingSteps: StepFormState[]): string {
  const existingIds = new Set(existingSteps.map((s) => s.id));
  let maxN = 0;
  for (const id of existingIds) {
    const match = STEP_ID_PATTERN.exec(id);
    if (match) maxN = Math.max(maxN, Number(match[1]));
  }
  let n = maxN + 1;
  while (existingIds.has(`step_${n}`)) n++;
  return `step_${n}`;
}

const TOP_LEVEL_KEYS = new Set([
  "name",
  "description",
  "enabled",
  "trigger",
  "steps",
]);
const TRIGGER_KEYS: Record<TriggerType, ReadonlySet<string>> = {
  message_posted: new Set(["on", "filter"]),
  reaction_added: new Set(["on", "emoji", "filter"]),
  diff_posted: new Set(["on", "filter"]),
  webhook: new Set(["on"]),
  schedule: new Set(["on", "cron", "interval"]),
};
const COMMON_STEP_KEYS = ["id", "name", "action", "if", "timeout_secs"];
const ACTION_STEP_KEYS: Record<ActionType, ReadonlySet<string>> = {
  delay: new Set([...COMMON_STEP_KEYS, "duration"]),
  send_message: new Set([
    ...COMMON_STEP_KEYS,
    "text",
    "channel",
    "reply_in_thread",
  ]),
  send_dm: new Set([...COMMON_STEP_KEYS, "to", "text"]),
  call_webhook: new Set([
    ...COMMON_STEP_KEYS,
    "url",
    "method",
    "headers",
    "body",
  ]),
  request_approval: new Set([
    ...COMMON_STEP_KEYS,
    "from",
    "message",
    "timeout",
  ]),
  add_reaction: new Set([...COMMON_STEP_KEYS, "emoji"]),
  set_channel_topic: new Set([...COMMON_STEP_KEYS, "topic"]),
};
const REQUIRED_ACTION_STRING_KEYS: Record<ActionType, readonly string[]> = {
  delay: ["duration"],
  send_message: ["text"],
  send_dm: ["to", "text"],
  call_webhook: ["url"],
  request_approval: ["from", "message"],
  add_reaction: ["emoji"],
  set_channel_topic: ["topic"],
};
const OPTIONAL_ACTION_STRING_KEYS: Record<ActionType, readonly string[]> = {
  delay: [],
  send_message: ["channel"],
  send_dm: [],
  call_webhook: ["method", "body"],
  request_approval: ["timeout"],
  add_reaction: [],
  set_channel_topic: [],
};
const WEBHOOK_METHODS = new Set(["POST", "GET", "PUT", "PATCH", "DELETE"]);
const STEP_ID_PATTERN_STRICT = /^[A-Za-z0-9_]{1,64}$/;

type UnknownRecord = Record<string, unknown>;

function objectRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function unknownKey(
  record: UnknownRecord,
  allowed: ReadonlySet<string>,
): string | null {
  return Object.keys(record).find((key) => !allowed.has(key)) ?? null;
}

/**
 * Why a workflow's YAML cannot be shown in Form mode.
 *
 * These render in the editor's "Cannot switch to form view" banner, so they are
 * screen copy. The detector reports three of them: the rest are `error:`
 * properties of returned object literals, a shape `PROSE_PARENTS` does not
 * cover. The field names inside them (`trigger.on`, `reply_in_thread`) stay in
 * English — they are YAML keys the reader has to type, not words to translate.
 */
const FORM_MODE_ERRORS = {
  descriptionNotString: msg`description must be a string`,
  descriptionWhitespace: msg`description cannot be empty or have surrounding whitespace in Form mode — use the YAML editor`,
  duplicateStepId: msg`Duplicate step ID "{id}" — use the YAML editor`,
  emptyOwned: msg`{label} cannot be empty in Form mode — use the YAML editor`,
  enabledNotBoolean: msg`enabled must be a boolean`,
  headerNamesUnsafe: msg`Webhook header names cannot be empty or have surrounding whitespace in Form mode`,
  headersNotObject: msg`Webhook headers must be a non-empty object containing string values`,
  invalidYaml: msg`Invalid YAML`,
  nameNotString: msg`name must be a string`,
  notAnObject: msg`YAML must be an object`,
  notAString: msg`{label} must be a string`,
  notNonEmptyString: msg`{label} must be a non-empty string`,
  replyInThreadNotBoolean: msg`Step {number} reply_in_thread must be a boolean — use the YAML editor`,
  replyInThreadUnsupported: msg`reply_in_thread is not supported for {triggerType} triggers — use the YAML editor`,
  scheduleBoth: msg`Schedule triggers cannot specify both cron and interval — use the YAML editor`,
  scheduleNeither: msg`Schedule triggers require either cron or interval — use the YAML editor`,
  stepConditions: msg`Step conditions are only available in the YAML editor`,
  stepFieldLabel: msg`Step {number} {field}`,
  useYamlEditorSuffix: msg`{error} — use the YAML editor`,
  stepId: msg`Step {number} requires a unique 1–64 character alphanumeric or underscore ID`,
  stepNameWhitespace: msg`Step {number} name has surrounding whitespace — use the YAML editor`,
  stepNotAnObject: msg`Step {number} must be an object`,
  stepsNotAList: msg`steps must be a list`,
  timeoutSecs: msg`Step {number} timeout_secs must be a positive integer`,
  triggerOnRequired: msg`trigger.on is required`,
  unsupportedAction: msg`Unsupported action type "{action}" — use the YAML editor`,
  unsupportedCron: msg`Unsupported cron expression: {error} Use the YAML editor`,
  unsupportedStepField: msg`Unsupported {action} step field "{field}" — use the YAML editor`,
  unsupportedTriggerField: msg`Unsupported {triggerType} trigger field "{field}" — use the YAML editor`,
  unsupportedTriggerType: msg`Unsupported trigger type "{triggerType}" — use the YAML editor`,
  unsupportedWorkflowField: msg`Unsupported workflow field "{field}" — use the YAML editor`,
  webhookMethod: msg`Unsupported webhook method "{method}" — use the YAML editor`,
} as const;

function requireNonEmptyString(
  record: UnknownRecord,
  key: string,
  label: string,
  i18n: I18n,
): string | { error: string } {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    return {
      error: resolveDescriptor(i18n, FORM_MODE_ERRORS.notNonEmptyString, {
        label,
      }),
    };
  }
  return value;
}

/**
 * The error carries whether it already tells the reader to use the YAML editor.
 *
 * The schedule branch below used to decide that with
 * `error.includes("YAML editor")` — reading translated copy as a flag, so in
 * German the condition is always true and the advice is appended a second time.
 */
type OwnedStringError = { error: string; suggestsYamlEditor: boolean };

function optionalOwnedStringError(
  record: UnknownRecord,
  key: string,
  label: string,
  i18n: I18n,
): OwnedStringError | null {
  const value = record[key];
  if (value === undefined) return null;
  if (typeof value !== "string") {
    return {
      error: resolveDescriptor(i18n, FORM_MODE_ERRORS.notAString, { label }),
      suggestsYamlEditor: false,
    };
  }
  if (value.length === 0) {
    return {
      error: resolveDescriptor(i18n, FORM_MODE_ERRORS.emptyOwned, { label }),
      suggestsYamlEditor: true,
    };
  }
  return null;
}

export function yamlToFormState(
  yaml: string,
  i18n: I18n,
): { ok: true; state: WorkflowFormState } | { ok: false; error: string } {
  const fail = (
    descriptor: MessageDescriptor,
    values: Record<string, string | number> = {},
  ) => ({
    ok: false as const,
    error: resolveDescriptor(i18n, descriptor, values),
  });

  try {
    const parsed = objectRecord(yamlParse(yaml));
    if (!parsed) return fail(FORM_MODE_ERRORS.notAnObject);

    const topUnknown = unknownKey(parsed, TOP_LEVEL_KEYS);
    if (topUnknown) {
      return fail(FORM_MODE_ERRORS.unsupportedWorkflowField, {
        field: topUnknown,
      });
    }
    if (typeof parsed.name !== "string") {
      return fail(FORM_MODE_ERRORS.nameNotString);
    }
    if (parsed.description !== undefined) {
      if (typeof parsed.description !== "string") {
        return fail(FORM_MODE_ERRORS.descriptionNotString);
      }
      if (
        parsed.description.length === 0 ||
        parsed.description.trim() !== parsed.description
      ) {
        return fail(FORM_MODE_ERRORS.descriptionWhitespace);
      }
    }
    if (parsed.enabled !== undefined && typeof parsed.enabled !== "boolean") {
      return fail(FORM_MODE_ERRORS.enabledNotBoolean);
    }

    const rawTrigger = objectRecord(parsed.trigger);
    if (!rawTrigger || typeof rawTrigger.on !== "string") {
      return fail(FORM_MODE_ERRORS.triggerOnRequired);
    }
    if (!TRIGGER_TYPES.includes(rawTrigger.on as TriggerType)) {
      return fail(FORM_MODE_ERRORS.unsupportedTriggerType, {
        triggerType: rawTrigger.on,
      });
    }
    const triggerOn = rawTrigger.on as TriggerType;
    const triggerUnknown = unknownKey(rawTrigger, TRIGGER_KEYS[triggerOn]);
    if (triggerUnknown) {
      return fail(FORM_MODE_ERRORS.unsupportedTriggerField, {
        field: triggerUnknown,
        triggerType: triggerOn,
      });
    }
    for (const key of ["filter", "emoji", "cron", "interval"] as const) {
      // `trigger.filter` is a YAML path, not a phrase: it is the key the
      // reader has to find in the document, so it stays verbatim.
      const error = optionalOwnedStringError(
        rawTrigger,
        key,
        `trigger.${key}`,
        i18n,
      );
      if (error) {
        return {
          ok: false,
          error:
            triggerOn === "schedule" && !error.suggestsYamlEditor
              ? resolveDescriptor(i18n, FORM_MODE_ERRORS.useYamlEditorSuffix, {
                  error: error.error,
                })
              : error.error,
        };
      }
    }
    if (triggerOn === "schedule") {
      const hasCron = rawTrigger.cron !== undefined;
      const hasInterval = rawTrigger.interval !== undefined;
      if (hasCron === hasInterval) {
        return fail(
          hasCron
            ? FORM_MODE_ERRORS.scheduleBoth
            : FORM_MODE_ERRORS.scheduleNeither,
        );
      }
      if (typeof rawTrigger.cron === "string") {
        const error = cronExpressionError(rawTrigger.cron, i18n);
        if (error) {
          return fail(FORM_MODE_ERRORS.unsupportedCron, { error });
        }
      }
    }
    const trigger: TriggerConfig = {
      on: triggerOn,
      filter: rawTrigger.filter as string | undefined,
      emoji: rawTrigger.emoji as string | undefined,
      cron: rawTrigger.cron as string | undefined,
      interval: rawTrigger.interval as string | undefined,
    };

    if (!Array.isArray(parsed.steps)) {
      return fail(FORM_MODE_ERRORS.stepsNotAList);
    }
    const ids = new Set<string>();
    const steps: StepFormState[] = [];
    for (const [index, value] of parsed.steps.entries()) {
      const number = index + 1;
      const step = objectRecord(value);
      if (!step) return fail(FORM_MODE_ERRORS.stepNotAnObject, { number });
      if (
        typeof step.id !== "string" ||
        !STEP_ID_PATTERN_STRICT.test(step.id)
      ) {
        return fail(FORM_MODE_ERRORS.stepId, { number });
      }
      if (ids.has(step.id)) {
        return fail(FORM_MODE_ERRORS.duplicateStepId, { id: step.id });
      }
      ids.add(step.id);

      if (
        typeof step.action !== "string" ||
        !ACTION_TYPES.includes(step.action as ActionType)
      ) {
        return fail(FORM_MODE_ERRORS.unsupportedAction, {
          action: String(step.action),
        });
      }
      const action = step.action as ActionType;
      const stepUnknown = unknownKey(step, ACTION_STEP_KEYS[action]);
      if (stepUnknown) {
        return fail(FORM_MODE_ERRORS.unsupportedStepField, {
          action,
          field: stepUnknown,
        });
      }
      if (step.if !== undefined) {
        return fail(FORM_MODE_ERRORS.stepConditions);
      }
      const stepFieldLabel = (field: string) =>
        resolveDescriptor(i18n, FORM_MODE_ERRORS.stepFieldLabel, {
          field,
          number,
        });
      const nameError = optionalOwnedStringError(
        step,
        "name",
        stepFieldLabel("name"),
        i18n,
      );
      if (nameError) return { ok: false, error: nameError.error };
      if (typeof step.name === "string" && step.name.trim() !== step.name) {
        return fail(FORM_MODE_ERRORS.stepNameWhitespace, { number });
      }
      if (
        step.timeout_secs !== undefined &&
        (!Number.isSafeInteger(step.timeout_secs) ||
          (step.timeout_secs as number) <= 0)
      ) {
        return fail(FORM_MODE_ERRORS.timeoutSecs, { number });
      }

      for (const key of REQUIRED_ACTION_STRING_KEYS[action]) {
        const required = requireNonEmptyString(
          step,
          key,
          stepFieldLabel(key),
          i18n,
        );
        if (typeof required !== "string")
          return { ok: false, error: required.error };
      }
      for (const key of OPTIONAL_ACTION_STRING_KEYS[action]) {
        const error = optionalOwnedStringError(
          step,
          key,
          stepFieldLabel(key),
          i18n,
        );
        if (error) return { ok: false, error: error.error };
      }
      if (
        action === "call_webhook" &&
        step.method !== undefined &&
        !WEBHOOK_METHODS.has(step.method as string)
      ) {
        return fail(FORM_MODE_ERRORS.webhookMethod, {
          method: String(step.method),
        });
      }
      if (step.headers !== undefined) {
        const headers = objectRecord(step.headers);
        if (
          !headers ||
          Object.keys(headers).length === 0 ||
          Object.values(headers).some((header) => typeof header !== "string")
        ) {
          return fail(FORM_MODE_ERRORS.headersNotObject);
        }
        const unsafeHeader = Object.keys(headers).find(
          (key) => key.length === 0 || key.trim() !== key,
        );
        if (unsafeHeader !== undefined) {
          return fail(FORM_MODE_ERRORS.headerNamesUnsafe);
        }
      }

      if (step.reply_in_thread !== undefined) {
        if (typeof step.reply_in_thread !== "boolean") {
          return fail(FORM_MODE_ERRORS.replyInThreadNotBoolean, { number });
        }
        if (step.reply_in_thread && !isThreadReplyEligibleTrigger(triggerOn)) {
          return fail(FORM_MODE_ERRORS.replyInThreadUnsupported, {
            triggerType: triggerOn,
          });
        }
      }

      steps.push({
        id: step.id,
        name: step.name as string | undefined,
        action,
        timeoutSecs:
          step.timeout_secs === undefined
            ? undefined
            : formatDurationSeconds(step.timeout_secs as number),
        duration: step.duration as string | undefined,
        text: step.text as string | undefined,
        channel: step.channel as string | undefined,
        replyInThread: step.reply_in_thread === true,
        to: keyDisplayValue(step.to as string | undefined),
        url: step.url as string | undefined,
        method: step.method as string | undefined,
        headers: toHeaderRows(step.headers, step.id),
        body: step.body as string | undefined,
        emoji: step.emoji as string | undefined,
        topic: step.topic as string | undefined,
        from: keyDisplayValue(step.from as string | undefined),
        message: step.message as string | undefined,
        timeout: step.timeout as string | undefined,
      });
    }

    return {
      ok: true,
      state: {
        name: parsed.name,
        description: (parsed.description as string | undefined) ?? "",
        enabled: parsed.enabled !== false,
        trigger,
        steps,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : i18n._(FORM_MODE_ERRORS.invalidYaml),
    };
  }
}
