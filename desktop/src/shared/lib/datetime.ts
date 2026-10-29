import { t } from "@lingui/core/macro";

import { localeDateTimeFormat } from "@/shared/lib/intlLocale";
import type { AppLocale } from "@/shared/lib/localePreference";

/**
 * Relative date labels shared by the chat timeline and the Inbox.
 *
 * Both surfaces group items by calendar day and label the group. They used to
 * do it independently — chat via `messages/lib/dateFormatters.formatDayHeading`,
 * the Inbox inline inside `groupInboxItems` — and the two drifted apart: chat
 * appended an ordinal ("Monday, March 31st") while the Inbox always printed the
 * year ("Jul 8, 2026", even for a date three weeks ago).
 *
 * The ladder follows the Block writing standard for relative dates, with one
 * deliberate deviation noted on `formatDayGroupLabel`.
 *
 * **`locale` is a required argument, not a default.** Every formatter here used
 * to be a module-level `Intl.DateTimeFormat("en-US", …)`, so a German build
 * printed "Saturday, June 20" and "2:34 PM" under German copy. A default would
 * have fixed that for the call sites that remembered to override it and left
 * the rest silently English — the failure mode that produced this work. Making
 * it required means a call site cannot compile without deciding, and a
 * component that passes `useLocale()` re-renders when the preference changes.
 */

/** Days in a week, past which the weekday name stops being unambiguous. */
const WEEKDAY_BAND_DAYS = 7;

const WEEKDAY = { weekday: "long" } as const;
const WEEKDAY_MONTH_DAY = {
  weekday: "long",
  month: "long",
  day: "numeric",
} as const;
const MONTH_DAY_YEAR = {
  month: "long",
  day: "numeric",
  year: "numeric",
} as const;
const SHORT_WEEKDAY_SHORT_MONTH_DAY = {
  weekday: "short",
  month: "short",
  day: "numeric",
} as const;
const SHORT_MONTH_DAY_YEAR = {
  month: "short",
  day: "numeric",
  year: "numeric",
} as const;
const TIME = { hour: "numeric", minute: "2-digit" } as const;

/**
 * Label for a group of items that share a calendar day — a chat day divider or
 * an Inbox section header.
 *
 * ```
 * Today          → "Today"          / "Heute"
 * Yesterday      → "Yesterday"      / "Gestern"
 * 2–6 days ago   → "Monday"         / "Montag"
 * older, this year → "Saturday, June 20" / "Samstag, 20. Juni"
 * earlier years  → "June 20, 2025"  / "20. Juni 2025"
 * ```
 *
 * The weekday rides along within the current year — feedback was that it still
 * orients ("was that a weekend?") well past the six-day band. Beyond a year it
 * stops earning its width: nobody maps "Friday" to anything a year later, and
 * the year itself needs the room.
 *
 * Deliberate deviation from the standard: the standard collapses anything over
 * ten months old to month and year ("Aug 2022"). A group label has to *identify*
 * its day — collapsing would give every day in a month the same header, so
 * scrolling old history would show a run of identical dividers with no way to
 * tell one day from the next. The day is kept and only the year is conditional.
 *
 * No ordinal suffix ("June 20", never "June 20th"), per the standard. German
 * gets its own ordinal ("20. Juni") from `Intl`, not from this code.
 *
 * `nowSeconds` is injectable so the relative bands are testable; it must stay a
 * parameter rather than a captured constant, because a label rendered before
 * midnight has to say "Yesterday" once the day rolls over.
 */
export function formatDayGroupLabel(
  unixSeconds: number,
  {
    locale,
    nowSeconds = Date.now() / 1_000,
  }: { locale: AppLocale; nowSeconds?: number },
): string {
  const date = new Date(unixSeconds * 1_000);
  const now = new Date(nowSeconds * 1_000);
  const dayDiff = calendarDaysBetween(now, date);

  if (dayDiff === 0) return t`Today`;
  if (dayDiff === 1) return t`Yesterday`;
  // Bounded below as well as above: a timestamp in the future (clock skew, or a
  // relay ahead of this machine) must not be labelled with a weekday that reads
  // as the recent past.
  if (dayDiff > 1 && dayDiff < WEEKDAY_BAND_DAYS) {
    return localeDateTimeFormat(locale, WEEKDAY).format(date);
  }

  return date.getFullYear() === now.getFullYear()
    ? localeDateTimeFormat(locale, WEEKDAY_MONTH_DAY).format(date)
    : localeDateTimeFormat(locale, MONTH_DAY_YEAR).format(date);
}

/**
 * Label for a single item's timestamp — an Inbox list row, or a message in the
 * Inbox thread pane.
 *
 * ```
 * withTime: false (narrow rows)   withTime: true (roomy rows)
 * Today   → "2:34 PM"             Today   → "2:34 PM"
 * Yest.   → "Yesterday"           Yest.   → "Yesterday at 2:34 PM"
 * 2–6d    → "Monday"              2–6d    → "Monday at 2:34 PM"
 * year    → "Sat, Jun 20"         year    → "Sat, Jun 20 at 2:34 PM"
 * older   → "Jun 20, 2025"        older   → "Jun 20, 2025 at 2:34 PM"
 * ```
 *
 * The weekday stays through the current year (abbreviated, matching the month)
 * and drops once the year appears — see `formatDayGroupLabel` for why.
 *
 * Today needs no date word in either mode: a bare clock time already reads as
 * today, and "Today at 2:34 PM" is longer without saying more.
 *
 * `withTime` is a surface decision, not a preference. Somewhere you read
 * conversation, the time is part of the content, so pass `true`. In a narrow
 * list row it costs more width than it earns and the full timestamp is a hover
 * away, so pass `false`.
 *
 * Months are abbreviated here but spelled out in `formatDayGroupLabel` — a
 * day divider is a roomy header of its own, an item label shares a row with a
 * name, a channel, and a preview.
 *
 * The joiner is a message, not a concatenation: German says "Gestern **um**
 * 14:34", and a hardcoded " at " would have survived every other part of this
 * being translated.
 */
export function formatItemTimestamp(
  unixSeconds: number,
  {
    locale,
    withTime = false,
    nowSeconds = Date.now() / 1_000,
  }: { locale: AppLocale; withTime?: boolean; nowSeconds?: number },
): string {
  const date = new Date(unixSeconds * 1_000);
  const now = new Date(nowSeconds * 1_000);
  const dayDiff = calendarDaysBetween(now, date);
  const time = localeDateTimeFormat(locale, TIME).format(date);

  if (dayDiff === 0) return time;

  let dayLabel: string;
  if (dayDiff === 1) {
    dayLabel = t`Yesterday`;
  } else if (dayDiff > 1 && dayDiff < WEEKDAY_BAND_DAYS) {
    dayLabel = localeDateTimeFormat(locale, WEEKDAY).format(date);
  } else {
    dayLabel =
      date.getFullYear() === now.getFullYear()
        ? localeDateTimeFormat(locale, SHORT_WEEKDAY_SHORT_MONTH_DAY).format(
            date,
          )
        : localeDateTimeFormat(locale, SHORT_MONTH_DAY_YEAR).format(date);
  }

  return withTime ? t`${dayLabel} at ${time}` : dayLabel;
}

/** Local midnight of the calendar day containing `date`. */
function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Whole calendar days from `date` to `now`, in local time. Rounded rather than
 * floored so a DST transition — a 23- or 25-hour day — still counts as one day.
 */
function calendarDaysBetween(now: Date, date: Date): number {
  return Math.round(
    (startOfLocalDay(now).getTime() - startOfLocalDay(date).getTime()) /
      86_400_000,
  );
}
