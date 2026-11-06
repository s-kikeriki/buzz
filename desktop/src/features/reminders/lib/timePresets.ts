import type { I18n, MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

/**
 * Stable preset identity, independent of the displayed label. React keys and
 * tests bind this, never `label`: a translated label would otherwise change
 * every key with the locale, and pin the tests to English copy.
 */
export type TimePresetId =
  | "in30m"
  | "in1h"
  | "in3h"
  | "tomorrow9am"
  | "nextMonday9am";

/**
 * Shared reminder time presets — the single source of truth for both the
 * create dialog and the snooze dropdown. Each preset returns a Unix timestamp
 * (seconds) strictly in the future.
 */
export type TimePreset = {
  /** Locale-independent identity for React keys and tests. */
  id: TimePresetId;
  /** Button label in the active locale. */
  label: string;
  getTimestamp: () => number;
};

type TimePresetSpec = Omit<TimePreset, "label"> & {
  label: MessageDescriptor;
};

function nowSeconds(): number {
  return Math.floor(Date.now() / 1_000);
}

/**
 * Next occurrence of `dayOffset` days from now at 9am local time. If that
 * instant is already past (e.g. it is after 9am and offset is 0), roll to the
 * following day so the result is always in the future.
 */
function nextDayAt9am(dayOffset: number): number {
  const now = new Date();
  const target = new Date(now);
  target.setDate(target.getDate() + dayOffset);
  target.setHours(9, 0, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return Math.floor(target.getTime() / 1_000);
}

/**
 * The presets as message descriptors rather than resolved strings. Resolving
 * at module scope would freeze every label in whichever locale happened to
 * boot first — the same trap `localArchiveKinds` documents.
 */
const TIME_PRESET_SPECS: ReadonlyArray<TimePresetSpec> = [
  {
    id: "in30m",
    label: msg`In 30 minutes`,
    getTimestamp: () => nowSeconds() + 30 * 60,
  },
  {
    id: "in1h",
    label: msg`In 1 hour`,
    getTimestamp: () => nowSeconds() + 60 * 60,
  },
  {
    id: "in3h",
    label: msg`In 3 hours`,
    getTimestamp: () => nowSeconds() + 3 * 60 * 60,
  },
  {
    id: "tomorrow9am",
    label: msg`Tomorrow at 9am`,
    getTimestamp: () => nextDayAt9am(1),
  },
  {
    id: "nextMonday9am",
    label: msg`Next Monday at 9am`,
    getTimestamp: () => {
      const daysUntilMonday = (8 - new Date().getDay()) % 7 || 7;
      return nextDayAt9am(daysUntilMonday);
    },
  },
];

/**
 * The presets in the active locale.
 *
 * `i18n` is a required parameter rather than a module import, following
 * `kindGroups`: both call sites are render paths, and a module-level constant
 * would resolve once and never follow a language change.
 */
export function timePresets(i18n: I18n): ReadonlyArray<TimePreset> {
  return TIME_PRESET_SPECS.map((spec) => ({
    id: spec.id,
    label: i18n._(spec.label),
    getTimestamp: spec.getTimestamp,
  }));
}

/** Today as `YYYY-MM-DD` in local time, for the custom date input `min`. */
export function todayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parse a `YYYY-MM-DD` + `HH:MM` pair into a future Unix timestamp (seconds),
 * or null if the inputs are malformed or not strictly in the future. The shared
 * guard for both create and snooze custom surfaces: the native time input has
 * no `min`, so a past time would otherwise fire immediately.
 */
export function parseCustomDateTime(date: string, time: string): number | null {
  if (!date || !time) return null;
  const timestamp = Math.floor(new Date(`${date}T${time}`).getTime() / 1_000);
  if (Number.isNaN(timestamp)) return null;
  if (timestamp <= nowSeconds()) return null;
  return timestamp;
}
