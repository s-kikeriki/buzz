import type { I18n } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { parse as yamlParse } from "yaml";

import {
  formatDurationSecondsVerbose,
  parseDurationSeconds,
} from "./workflowDuration";

type WorkflowActivationWarning = {
  description: string;
  title: string;
};

const FREQUENT_SCHEDULE_THRESHOLD_SECONDS = 60 * 60;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function frequentIntervalDescription(
  interval: string,
  i18n: I18n,
): string | null {
  const seconds = parseDurationSeconds(interval);
  if (
    seconds === null ||
    seconds <= 0 ||
    seconds > FREQUENT_SCHEDULE_THRESHOLD_SECONDS
  ) {
    return null;
  }
  const duration = formatDurationSecondsVerbose(seconds, i18n);
  return i18n._(
    msg`It is scheduled to run every ${duration}. Review the schedule before turning it on.`,
  );
}

function normalizedCronFields(cron: string): string[] | null {
  const fields = cron.trim().split(/\s+/);
  if (fields.length === 5) return ["0", ...fields, "*"];
  if (fields.length === 6) return [...fields, "*"];
  return fields.length === 7 ? fields : null;
}

function repeatedFieldCount(field: string, maximum: number): number | null {
  if (field === "*") return maximum + 1;
  const step = /^\*\/(\d+)$/.exec(field);
  if (step) {
    const size = Number(step[1]);
    return size >= 1 && size <= maximum + 1
      ? Math.ceil((maximum + 1) / size)
      : null;
  }
  if (field.includes(",") || field.includes("-")) return 2;
  return /^\d+$/.test(field) ? 1 : null;
}

/**
 * Reports whether an hour field selects every hour of the day, so schedules
 * written as `*`, `*\/1`, `0-23`, or an equivalent list still classify as
 * hourly. Unrecognized fields are treated as not matching every hour.
 */
function matchesEveryHour(field: string): boolean {
  const HOURS = 24;
  const selected = new Set<number>();
  for (const segment of field.split(",")) {
    const [base, step] = segment.split("/");
    if (step !== undefined && (!/^\d+$/.test(step) || Number(step) < 1)) {
      return false;
    }
    const size = step === undefined ? 1 : Number(step);
    let start: number, end: number;
    if (base === "*") {
      start = 0;
      end = HOURS - 1;
    } else {
      const bounds = base.split("-");
      if (bounds.length > 2 || bounds.some((part) => !/^\d+$/.test(part))) {
        return false;
      }
      start = Number(bounds[0]);
      end = bounds.length === 2 ? Number(bounds[1]) : start;
      if (start > end || end >= HOURS) return false;
      // A bare hour selects only itself; a stepped one runs to end of day.
      if (bounds.length === 1) {
        if (step === undefined) {
          selected.add(start);
          continue;
        }
        end = HOURS - 1;
      }
    }
    for (let hour = start; hour <= end; hour += size) selected.add(hour);
  }
  return selected.size === HOURS;
}

function frequentCronDescription(cron: string, i18n: I18n): string | null {
  const fields = normalizedCronFields(cron);
  if (!fields) return null;
  const [second, minute, hour] = fields;
  const secondRuns = repeatedFieldCount(second, 59);
  const minuteRuns = repeatedFieldCount(minute, 59);
  if (secondRuns === null || minuteRuns === null) return null;
  if (!matchesEveryHour(hour)) return null;

  if (secondRuns > 1) {
    return i18n._(
      msg`It is scheduled to run multiple times a minute. Review the schedule before turning it on.`,
    );
  }
  if (minute === "*") {
    return i18n._(
      msg`It is scheduled to run every minute. Review the schedule before turning it on.`,
    );
  }
  const steppedMinute = /^\*\/(\d+)$/.exec(minute);
  if (steppedMinute) {
    const minutes = Number(steppedMinute[1]);
    // The whole sentence is one ICU plural rather than a `${n} minute(s)`
    // fragment spliced into it: German puts the cardinal and the inflected
    // noun inside the clause, and `jede Minute` / `alle 5 Minuten` do not
    // share a stem to splice into.
    return i18n._(
      msg`${plural(minutes, {
        one: "It is scheduled to run every # minute. Review the schedule before turning it on.",
        other:
          "It is scheduled to run every # minutes. Review the schedule before turning it on.",
      })}`,
    );
  }
  if (minuteRuns === 1) {
    return i18n._(
      msg`It is scheduled to run every hour. Review the schedule before turning it on.`,
    );
  }
  if (minuteRuns > 1) {
    return i18n._(
      msg`It is scheduled to run multiple times an hour. Review the schedule before turning it on.`,
    );
  }
  return null;
}

export function getWorkflowActivationWarning(
  yaml: string,
  i18n: I18n,
): WorkflowActivationWarning | null {
  let definition: Record<string, unknown> | null;
  try {
    definition = asRecord(yamlParse(yaml));
  } catch {
    return null;
  }
  const trigger = asRecord(definition?.trigger);
  const triggerType = nonEmptyString(trigger?.on);

  if (triggerType === "message_posted" && !nonEmptyString(trigger?.filter)) {
    return {
      description: i18n._(
        msg`It will run for every new message in this channel. Review the trigger before turning it on.`,
      ),
      title: i18n._(msg`This workflow may run often`),
    };
  }

  if (triggerType === "schedule") {
    const interval = nonEmptyString(trigger?.interval);
    const cron = nonEmptyString(trigger?.cron);
    const description = interval
      ? frequentIntervalDescription(interval, i18n)
      : cron
        ? frequentCronDescription(cron, i18n)
        : null;
    if (description) {
      return {
        description,
        title: i18n._(msg`This workflow may run often`),
      };
    }
  }

  return null;
}
