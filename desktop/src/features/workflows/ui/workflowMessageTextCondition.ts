import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export const MESSAGE_TEXT_CONDITION_OPERATORS = [
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "equals",
  "not_equals",
  "is_not_empty",
  "is_empty",
] as const;

export type MessageTextConditionOperator =
  (typeof MESSAGE_TEXT_CONDITION_OPERATORS)[number];

export type MessageTextCondition = {
  operator: MessageTextConditionOperator;
  value: string;
};

/**
 * The operator labels, in the lower case both call sites render them in.
 *
 * They were title case and every consumer called `.toLowerCase()` on the way
 * out — a locale-sensitive transform over copy, with no locale passed, to
 * recover a form the table could just hold. German's capitalization rules are
 * not English's, and `toLowerCase()` on a translated string is wrong in at
 * least one locale (Turkish dotless i) whatever the copy says.
 */
export const MESSAGE_TEXT_CONDITION_LABELS: Record<
  MessageTextConditionOperator,
  MessageDescriptor
> = {
  contains: msg`contains`,
  not_contains: msg`does not contain`,
  starts_with: msg`starts with`,
  ends_with: msg`ends with`,
  equals: msg`equals`,
  not_equals: msg`does not equal`,
  is_not_empty: msg`has text`,
  is_empty: msg`has no text`,
};

export function messageTextConditionNeedsValue(
  operator: MessageTextConditionOperator,
): boolean {
  return operator !== "is_not_empty" && operator !== "is_empty";
}

function escapeEvalexprString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export function buildMessageTextCondition(
  condition: MessageTextCondition,
): string | null {
  if (condition.operator === "is_not_empty") {
    return "str_len(trigger_text) > 0";
  }
  if (condition.operator === "is_empty") {
    return "str_len(trigger_text) == 0";
  }
  if (!condition.value.trim()) return null;

  const quotedValue = `"${escapeEvalexprString(condition.value)}"`;
  switch (condition.operator) {
    case "contains":
      return `str_contains(trigger_text, ${quotedValue})`;
    case "not_contains":
      return `!str_contains(trigger_text, ${quotedValue})`;
    case "starts_with":
      return `str_starts_with(trigger_text, ${quotedValue})`;
    case "ends_with":
      return `str_ends_with(trigger_text, ${quotedValue})`;
    case "equals":
      return `trigger_text == ${quotedValue}`;
    case "not_equals":
      return `trigger_text != ${quotedValue}`;
  }
}

function unescapeEvalexprString(value: string): string {
  return value.replaceAll(/\\(["\\])/g, "$1");
}

/** Parse only the exact expression shapes emitted by the structured editor. */
export function parseMessageTextCondition(
  expression: string,
): MessageTextCondition | null {
  let parsed: MessageTextCondition | null = null;
  if (expression === "str_len(trigger_text) > 0") {
    parsed = { operator: "is_not_empty", value: "" };
  } else if (expression === "str_len(trigger_text) == 0") {
    parsed = { operator: "is_empty", value: "" };
  } else {
    const stringLiteral = '"((?:\\\\["\\\\]|[^"\\\\])*)"';
    const functionMatch = new RegExp(
      `^(!)?str_(contains|starts_with|ends_with)\\(trigger_text, ${stringLiteral}\\)$`,
    ).exec(expression);
    if (functionMatch) {
      parsed = {
        operator: functionMatch[1]
          ? "not_contains"
          : functionMatch[2] === "starts_with"
            ? "starts_with"
            : functionMatch[2] === "ends_with"
              ? "ends_with"
              : "contains",
        value: unescapeEvalexprString(functionMatch[3]),
      };
    } else {
      const equalityMatch = new RegExp(
        `^trigger_text (!=|==) ${stringLiteral}$`,
      ).exec(expression);
      if (equalityMatch) {
        parsed = {
          operator: equalityMatch[1] === "==" ? "equals" : "not_equals",
          value: unescapeEvalexprString(equalityMatch[2]),
        };
      }
    }
  }

  return parsed && buildMessageTextCondition(parsed) === expression
    ? parsed
    : null;
}
