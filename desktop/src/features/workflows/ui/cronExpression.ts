import type { I18n, MessageDescriptor } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";

import { resolveDescriptor } from "@/shared/i18n/resolveDescriptor";

/**
 * The five cron fields.
 *
 * `key` is the stable identifier: it builds the input's DOM id and its React
 * key, and names the field in every error below. `label` is only ever read by a
 * person. They were one string before — the id was
 * `wf-trigger-cron-${label.toLowerCase()}`, so translating the label silently
 * renamed every input and every `htmlFor` that pointed at one.
 */
export const CRON_FIELD_DEFINITIONS = [
  { key: "minute", label: msg`Minute`, max: 59, min: 0 },
  { key: "hour", label: msg`Hour`, max: 23, min: 0 },
  { key: "day", label: msg`Day`, max: 31, min: 1 },
  {
    aliases: [
      "JAN",
      "FEB",
      "MAR",
      "APR",
      "MAY",
      "JUN",
      "JUL",
      "AUG",
      "SEP",
      "OCT",
      "NOV",
      "DEC",
    ],
    key: "month",
    label: msg`Month`,
    max: 12,
    min: 1,
  },
  {
    aliases: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"],
    key: "weekday",
    label: msg`Weekday`,
    max: 7,
    min: 0,
  },
] as const;

export type CronFields = [string, string, string, string, string];

/**
 * Every way a cron field can be wrong, as one whole sentence each.
 *
 * The field name is a placeholder rather than a sentence prefix: German needs
 * it in the same opening position, but the verb that follows it inflects, so
 * the sentence cannot be assembled as `label + rest`.
 */
const FIELD_ERRORS = {
  emptyListItem: msg`{field} has an empty list item.`,
  invalidRange: msg`{field} has an invalid range.`,
  invalidStep: msg`{field} has an invalid step.`,
  outOfRange: msg`{field} must be between {min} and {max}.`,
  rangeOrder: msg`{field} range must go from lower to higher.`,
  required: msg`{field} is required.`,
  stepNotPositive: msg`{field} step must be a positive whole number.`,
  unsupportedValue: msg`{field} contains “{atom}”, which is not a supported value.`,
} as const;

export function cronFieldsFromExpression(expression: string): CronFields {
  const values = expression.trim() ? expression.trim().split(/\s+/) : [];
  return [
    values[0] ?? "",
    values[1] ?? "",
    values[2] ?? "",
    values[3] ?? "",
    values[4] ?? "",
  ];
}

export function cronExpressionFromFields(fields: CronFields): string {
  return fields.join(" ");
}

export function normalizeCronExpression(expression: string): string {
  return expression.trim().replace(/\s+/g, " ");
}

export function cronFieldsFromPaste(
  pastedValue: string,
  i18n: I18n,
): { fields: CronFields; ok: true } | { error: string; ok: false } {
  const values = pastedValue.trim().split(/\s+/);
  if (values.length !== CRON_FIELD_DEFINITIONS.length) {
    const count = values.length;
    return {
      // One plural over the whole sentence: German inflects "Feld"/"Felder"
      // inside it, so a `${n} field(s)` fragment has nothing to agree with.
      error: i18n._(
        msg`${plural(count, {
          one: "Paste a 5-field cron expression. Found # field.",
          other: "Paste a 5-field cron expression. Found # fields.",
        })}`,
      ),
      ok: false,
    };
  }
  return { fields: values as CronFields, ok: true };
}

export type CronFieldDefinition = (typeof CRON_FIELD_DEFINITIONS)[number];

function fieldError(
  definition: CronFieldDefinition,
  i18n: I18n,
  descriptor: MessageDescriptor,
  values: Record<string, string | number> = {},
): string {
  return resolveDescriptor(i18n, descriptor, {
    field: i18n._(definition.label),
    ...values,
  });
}

function atomError(
  atom: string,
  definition: CronFieldDefinition,
  i18n: I18n,
): string | null {
  const upperAtom = atom.toUpperCase();
  if (
    "aliases" in definition &&
    definition.aliases.includes(upperAtom as never)
  ) {
    return null;
  }
  if (!/^\d+$/.test(atom)) {
    return fieldError(definition, i18n, FIELD_ERRORS.unsupportedValue, {
      atom,
    });
  }

  const value = Number(atom);
  if (value < definition.min || value > definition.max) {
    return fieldError(definition, i18n, FIELD_ERRORS.outOfRange, {
      max: definition.max,
      min: definition.min,
    });
  }
  return null;
}

function segmentError(
  segment: string,
  definition: CronFieldDefinition,
  i18n: I18n,
): string | null {
  const stepParts = segment.split("/");
  if (stepParts.length > 2 || stepParts.some((part) => !part)) {
    return fieldError(definition, i18n, FIELD_ERRORS.invalidStep);
  }

  const [base, step] = stepParts;
  if (step !== undefined) {
    if (!/^\d+$/.test(step) || Number(step) < 1) {
      return fieldError(definition, i18n, FIELD_ERRORS.stepNotPositive);
    }
  }

  if (base === "*") return null;

  const rangeParts = base.split("-");
  if (rangeParts.length > 2 || rangeParts.some((part) => !part)) {
    return fieldError(definition, i18n, FIELD_ERRORS.invalidRange);
  }

  const startError = atomError(rangeParts[0], definition, i18n);
  if (startError) return startError;
  if (rangeParts.length === 1) return null;

  const endError = atomError(rangeParts[1], definition, i18n);
  if (endError) return endError;

  const start = Number(rangeParts[0]);
  const end = Number(rangeParts[1]);
  if (Number.isFinite(start) && Number.isFinite(end) && start > end) {
    return fieldError(definition, i18n, FIELD_ERRORS.rangeOrder);
  }
  return null;
}

export function validateCronField(
  value: string,
  definition: CronFieldDefinition,
  i18n: I18n,
): string | null {
  if (!value) return fieldError(definition, i18n, FIELD_ERRORS.required);

  const segments = value.split(",");
  if (segments.some((segment) => !segment)) {
    return fieldError(definition, i18n, FIELD_ERRORS.emptyListItem);
  }

  for (const segment of segments) {
    const error = segmentError(segment, definition, i18n);
    if (error) return error;
  }
  return null;
}

export function validateCronFields(
  fields: CronFields,
  i18n: I18n,
): Array<string | null> {
  return fields.map((field, index) =>
    validateCronField(field, CRON_FIELD_DEFINITIONS[index], i18n),
  );
}

export function cronExpressionError(
  expression: string,
  i18n: I18n,
): string | null {
  const parsed = cronFieldsFromPaste(expression, i18n);
  if (!parsed.ok) return parsed.error;
  return validateCronFields(parsed.fields, i18n).find(Boolean) ?? null;
}
