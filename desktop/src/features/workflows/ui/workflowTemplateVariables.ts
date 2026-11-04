import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

import type {
  ActionType,
  StepFormState,
  TriggerType,
} from "./workflowFormTypes";

/**
 * Which section of the suggestion list a variable belongs to.
 *
 * A token, not the heading. The group used to *be* the heading string, and
 * the popover both printed it and compared it against the previous row to
 * decide where to draw a section break — so translating the heading would
 * have kept working by accident in German while any future heading change
 * silently split the list. The label lives in
 * `TEMPLATE_VARIABLE_GROUP_LABELS`; the code reads this key.
 */
export type WorkflowTemplateVariableGroup = "trigger" | "previous_steps";

export const TEMPLATE_VARIABLE_GROUP_LABELS: Record<
  WorkflowTemplateVariableGroup,
  MessageDescriptor
> = {
  trigger: msg`Trigger`,
  previous_steps: msg`Previous steps`,
};

export type WorkflowTemplateVariable = {
  description: MessageDescriptor;
  group: WorkflowTemplateVariableGroup;
  value: string;
};

export type ActiveTemplateToken = {
  end: number;
  query: string;
  start: number;
};

const COMMON_EVENT_VARIABLES: WorkflowTemplateVariable[] = [
  {
    value: "trigger.author",
    description: msg`Author pubkey`,
    group: "trigger",
  },
  {
    value: "trigger.channel_id",
    description: msg`Channel UUID`,
    group: "trigger",
  },
  {
    value: "trigger.timestamp",
    description: msg`Unix timestamp`,
    group: "trigger",
  },
  {
    value: "trigger.message_id",
    description: msg`Message event ID`,
    group: "trigger",
  },
];

const STEP_OUTPUTS: Partial<
  Record<ActionType, Record<string, MessageDescriptor>>
> = {
  delay: { slept_secs: msg`Seconds elapsed` },
  send_message: {
    sent: msg`Whether the message was sent`,
    event_id: msg`Sent message ID`,
  },
  call_webhook: {
    status: msg`HTTP response status`,
    body: msg`HTTP response body`,
  },
  add_reaction: {
    added: msg`Whether the reaction was added`,
  },
};

function triggerVariables(
  triggerType: TriggerType,
): WorkflowTemplateVariable[] {
  switch (triggerType) {
    case "message_posted":
      return [
        {
          value: "trigger.text",
          description: msg`Message text`,
          group: "trigger",
        },
        ...COMMON_EVENT_VARIABLES,
      ];
    case "diff_posted":
      return [
        {
          value: "trigger.text",
          description: msg`Diff text`,
          group: "trigger",
        },
        ...COMMON_EVENT_VARIABLES,
      ];
    case "reaction_added":
      return [
        {
          value: "trigger.emoji",
          description: msg`Reaction emoji`,
          group: "trigger",
        },
        ...COMMON_EVENT_VARIABLES,
      ];
    case "schedule":
      return COMMON_EVENT_VARIABLES.filter(
        ({ value }) =>
          value === "trigger.channel_id" || value === "trigger.timestamp",
      );
    case "webhook":
      return [
        {
          value: "trigger.channel_id",
          description: msg`Workflow channel UUID`,
          group: "trigger",
        },
      ];
  }
}

export function workflowTemplateVariables(
  triggerType: TriggerType,
  previousSteps: StepFormState[],
): WorkflowTemplateVariable[] {
  const priorOutputs = previousSteps.flatMap((step) => {
    const outputs = STEP_OUTPUTS[step.action];
    if (!outputs || !/^[A-Za-z0-9_]+$/.test(step.id)) return [];
    return Object.entries(outputs).map(([field, description]) => ({
      value: `steps.${step.id}.output.${field}`,
      description,
      group: "previous_steps" as const,
    }));
  });

  return [...triggerVariables(triggerType), ...priorOutputs];
}

/** Find an unfinished `{{variable` token immediately before the caret. */
export function activeTemplateToken(
  value: string,
  caret: number,
): ActiveTemplateToken | null {
  const beforeCaret = value.slice(0, caret);
  const start = beforeCaret.lastIndexOf("{{");
  if (start < 0) return null;

  const query = beforeCaret.slice(start + 2);
  if (query.includes("}}") || !/^[A-Za-z0-9._]*$/.test(query)) return null;

  // If the caret is inside an existing template, replace the complete token
  // instead of leaving its old suffix behind after a suggestion is chosen.
  const closingBraces = value.indexOf("}}", caret);
  const nestedOpening = value.indexOf("{{", start + 2);
  const end =
    closingBraces >= 0 && (nestedOpening < 0 || closingBraces < nestedOpening)
      ? closingBraces + 2
      : caret;
  return { start, end, query };
}

export function insertTemplateVariable(
  value: string,
  token: ActiveTemplateToken,
  variable: string,
): { caret: number; value: string } {
  const insertion = `{{${variable}}}`;
  return {
    value: `${value.slice(0, token.start)}${insertion}${value.slice(token.end)}`,
    caret: token.start + insertion.length,
  };
}
