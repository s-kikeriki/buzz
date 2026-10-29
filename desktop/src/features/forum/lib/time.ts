import type { AppLocale } from "@/shared/lib/localePreference";
import { formatRelativeTime } from "@/shared/lib/relativeTime";

/**
 * How long ago a forum post or reply was written.
 *
 * `ceiling: "day"` preserves this surface's existing behaviour: a year-old
 * thread reads "400d ago" rather than rolling up to weeks. That is a forum
 * convention worth keeping separate from the chat chips, so it stays an
 * explicit argument instead of being flattened into the shared default.
 */
export function formatRelativeTimeLabel(
  unixSeconds: number,
  locale: AppLocale,
): string {
  return formatRelativeTime(unixSeconds, { ceiling: "day", locale });
}
