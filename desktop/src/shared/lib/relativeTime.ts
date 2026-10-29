import { t } from "@lingui/core/macro";

import { intlLocale, localeDateTimeFormat } from "@/shared/lib/intlLocale";
import type { AppLocale } from "@/shared/lib/localePreference";

/**
 * One relative-time ladder for the whole app.
 *
 * Eleven files each carried a private copy of this — `AgentSessionThreadPanel`,
 * `CommunityMembersCard`, `forum/lib/time`, `messages/lib/dateFormatters`,
 * `UserProfilePanelTabs`, `projectsViewHelpers`, `AgentActivityCard`,
 * `SearchResultItem`, `TopbarSearch`, `ChannelDeepLink`, `MessageLinkPill` —
 * and every one of them built the label by concatenating an English suffix
 * onto a number (`` `${minutes}m ago` ``). A string built that way cannot be
 * translated at all: there is no message for a catalogue to hold.
 *
 * `Intl.RelativeTimeFormat` replaces the concatenation. It carries the plural
 * rules for each locale, so nothing here has to know that German says "vor 1
 * Minute" but "vor 2 Minuten", and the English output is byte-identical to
 * what the eleven copies produced.
 */

/** Seconds in each rung of the ladder. */
const MINUTE = 60;
const HOUR = 3_600;
const DAY = 86_400;
const WEEK = 604_800;

/**
 * Coarsest rung a caller wants. The surfaces disagree today and the
 * disagreement is deliberate, so it stays a parameter rather than being
 * flattened: the forum shows `400d ago` on a year-old post, a profile row
 * shows `57w ago`, and the surfaces that switch to a calendar date past a week
 * cap at `day` and handle the rest themselves.
 */
export type RelativeTimeCeiling = "day" | "week";

/**
 * `compact` is the chip-and-badge form (`5m ago`), `long` is prose (`5 minutes
 * ago`). They are separate styles rather than one with a width hint because
 * the two read differently in German as well: "vor 5 Min." against "vor 5
 * Minuten".
 */
export type RelativeTimeStyle = "compact" | "long";

/**
 * `Intl` style per app locale and app style.
 *
 * English compact is `narrow` because that is what reproduces today's `5m
 * ago`. German compact is **`short`, not `narrow`**: German narrow abbreviates
 * minutes to a bare `m` ("vor 5 m"), which reads as five metres. `short`
 * gives "vor 5 Min.", which is both correct and what German chat UIs use. One
 * extra character, so it costs nothing in a chip.
 */
function intlStyle(
  locale: AppLocale,
  style: RelativeTimeStyle,
): Intl.RelativeTimeFormatStyle {
  if (style === "long") return "long";
  return locale === "de" ? "short" : "narrow";
}

const formatterCache = new Map<string, Intl.RelativeTimeFormat>();

function formatter(
  locale: AppLocale,
  style: RelativeTimeStyle,
): Intl.RelativeTimeFormat {
  const key = `${locale}|${style}`;
  const cached = formatterCache.get(key);
  if (cached) return cached;

  const created = new Intl.RelativeTimeFormat(intlLocale(locale), {
    // `always` keeps every rung numeric. `auto` would swap the one-day case
    // for the word "yesterday", which collides with the day-group heading that
    // already says Yesterday and reads wrong inside a chip.
    numeric: "always",
    style: intlStyle(locale, style),
  });
  formatterCache.set(key, created);
  return created;
}

/** Test seam: drop memoised formatters between cases. */
export function resetRelativeTimeFormattersForTests(): void {
  formatterCache.clear();
}

export type RelativeTimeOptions = {
  ceiling?: RelativeTimeCeiling;
  locale: AppLocale;
  nowSeconds?: number;
  style?: RelativeTimeStyle;
};

/**
 * "just now", or how long ago `unixSeconds` was.
 *
 * Bounded below: a timestamp in the future — clock skew, or a relay ahead of
 * this machine — reads as "just now" rather than as a negative count or a
 * label in the future tense.
 */
export function formatRelativeTime(
  unixSeconds: number,
  {
    ceiling = "week",
    locale,
    nowSeconds = Date.now() / 1_000,
    style = "compact",
  }: RelativeTimeOptions,
): string {
  const elapsed = Math.max(0, nowSeconds - unixSeconds);
  if (elapsed < MINUTE) return t`just now`;

  const format = formatter(locale, style);
  if (elapsed < HOUR) {
    return format.format(-Math.floor(elapsed / MINUTE), "minute");
  }
  if (elapsed < DAY) {
    return format.format(-Math.floor(elapsed / HOUR), "hour");
  }
  if (ceiling === "day" || elapsed < WEEK) {
    return format.format(-Math.floor(elapsed / DAY), "day");
  }
  return format.format(-Math.floor(elapsed / WEEK), "week");
}

/**
 * Relative inside a week, a calendar date beyond it.
 *
 * The project rows and the Pulse note card each had their own copy of this
 * ladder, and each got it half right: one appended an English unit name to a
 * number, the other passed `undefined` to `toLocaleDateString` — the host
 * locale, not the app's. Keeping it in one place also keeps the year rule in
 * one place: the year appears only when the date falls in a different year
 * from now, because "8. Juni" is unambiguous this year and misleading next.
 */
export function formatRelativeTimeOrDate(
  unixSeconds: number,
  {
    locale,
    nowSeconds = Date.now() / 1_000,
    style = "compact",
  }: {
    locale: AppLocale;
    nowSeconds?: number;
    style?: RelativeTimeStyle;
  },
): string {
  const elapsed = Math.max(0, nowSeconds - unixSeconds);
  if (elapsed < WEEK) {
    return formatRelativeTime(unixSeconds, {
      ceiling: "day",
      locale,
      nowSeconds,
      style,
    });
  }

  const date = new Date(unixSeconds * 1_000);
  const now = new Date(nowSeconds * 1_000);
  return localeDateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  }).format(date);
}
