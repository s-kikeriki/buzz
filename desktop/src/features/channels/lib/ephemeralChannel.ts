import { plural, t } from "@lingui/core/macro";

import type { Channel } from "@/shared/api/types";
import { intlLocale, localeDateTimeFormat } from "@/shared/lib/intlLocale";
import type { AppLocale } from "@/shared/lib/localePreference";

const relativeFormatterCache = new Map<AppLocale, Intl.RelativeTimeFormat>();

function relativeTimeFormatter(locale: AppLocale): Intl.RelativeTimeFormat {
  const cached = relativeFormatterCache.get(locale);
  if (cached) return cached;
  // `numeric: "auto"` is kept: this is a countdown, where "tomorrow" reads
  // better than "in 1 day".
  const created = new Intl.RelativeTimeFormat(intlLocale(locale), {
    numeric: "auto",
  });
  relativeFormatterCache.set(locale, created);
  return created;
}

const ABSOLUTE_DEADLINE = {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
} as const;

type EphemeralChannelLike = Pick<Channel, "ttlSeconds" | "ttlDeadline">;

export const EPHEMERAL_CHANNEL_LABEL = "Ephemeral";

/** Default TTL for ephemeral channels: 7 days of inactivity. */
export const DEFAULT_EPHEMERAL_TTL_SECONDS = 7 * 24 * 60 * 60;

export type EphemeralChannelDisplay = {
  detailLabel: string | null;
  tooltipLabel: string;
};

export function isEphemeralChannel(channel: EphemeralChannelLike): boolean {
  return channel.ttlSeconds !== null || channel.ttlDeadline !== null;
}

function resolveRemainingSeconds(
  ttlDeadline: string | null,
  nowMs: number,
): number | null {
  if (!ttlDeadline) {
    return null;
  }

  const deadlineMs = Date.parse(ttlDeadline);
  if (Number.isNaN(deadlineMs)) {
    return null;
  }

  return Math.ceil((deadlineMs - nowMs) / 1_000);
}

/**
 * Compact "time left" badge text.
 *
 * `plural` rather than a concatenated suffix: German needs "1 Min. übrig" and
 * "5 Min. übrig" from the same message, and the unit word itself inflects.
 */
function formatCompactRemaining(remainingSeconds: number): string {
  if (remainingSeconds <= 0) {
    return t`Cleanup due`;
  }

  if (remainingSeconds < 60 * 60) {
    const minutes = Math.max(1, Math.ceil(remainingSeconds / 60));
    return plural(minutes, { one: "#m left", other: "#m left" });
  }

  if (remainingSeconds < 60 * 60 * 24) {
    const hours = Math.max(1, Math.ceil(remainingSeconds / (60 * 60)));
    return plural(hours, { one: "#h left", other: "#h left" });
  }

  const days = Math.max(1, Math.ceil(remainingSeconds / (60 * 60 * 24)));
  return plural(days, { one: "#d left", other: "#d left" });
}

/** "in 5 minutes" / "in 5 Minuten", from `Intl`. */
function formatVerboseRemaining(
  remainingSeconds: number,
  locale: AppLocale,
): string {
  if (remainingSeconds <= 0) {
    return t`now`;
  }

  const formatter = relativeTimeFormatter(locale);
  if (remainingSeconds <= 60 * 60) {
    return formatter.format(
      Math.max(1, Math.ceil(remainingSeconds / 60)),
      "minute",
    );
  }

  if (remainingSeconds < 60 * 60 * 24) {
    return formatter.format(
      Math.max(1, Math.ceil(remainingSeconds / (60 * 60))),
      "hour",
    );
  }

  return formatter.format(
    Math.max(1, Math.ceil(remainingSeconds / (60 * 60 * 24))),
    "day",
  );
}

function formatCompactTtl(ttlSeconds: number): string {
  if (ttlSeconds < 60) {
    const seconds = Math.max(1, ttlSeconds);
    return plural(seconds, { one: "#s TTL", other: "#s TTL" });
  }

  if (ttlSeconds < 60 * 60) {
    const minutes = Math.max(1, Math.ceil(ttlSeconds / 60));
    return plural(minutes, { one: "#m TTL", other: "#m TTL" });
  }

  if (ttlSeconds < 60 * 60 * 24) {
    const hours = Math.max(1, Math.ceil(ttlSeconds / (60 * 60)));
    return plural(hours, { one: "#h TTL", other: "#h TTL" });
  }

  const days = Math.max(1, Math.ceil(ttlSeconds / (60 * 60 * 24)));
  return plural(days, { one: "#d TTL", other: "#d TTL" });
}

function formatVerboseTtl(ttlSeconds: number): string {
  if (ttlSeconds < 60) {
    const seconds = Math.max(1, ttlSeconds);
    return plural(seconds, { one: "# second", other: "# seconds" });
  }

  if (ttlSeconds < 60 * 60) {
    const minutes = Math.max(1, Math.ceil(ttlSeconds / 60));
    return plural(minutes, { one: "# minute", other: "# minutes" });
  }

  if (ttlSeconds < 60 * 60 * 24) {
    const hours = Math.max(1, Math.ceil(ttlSeconds / (60 * 60)));
    return plural(hours, { one: "# hour", other: "# hours" });
  }

  const days = Math.max(1, Math.ceil(ttlSeconds / (60 * 60 * 24)));
  return plural(days, { one: "# day", other: "# days" });
}

export function getEphemeralChannelDisplay(
  channel: EphemeralChannelLike,
  locale: AppLocale,
  nowMs = Date.now(),
): EphemeralChannelDisplay | null {
  if (!isEphemeralChannel(channel)) {
    return null;
  }

  const remainingSeconds = resolveRemainingSeconds(channel.ttlDeadline, nowMs);
  const absoluteDeadlineLabel =
    channel.ttlDeadline && !Number.isNaN(Date.parse(channel.ttlDeadline))
      ? localeDateTimeFormat(locale, ABSOLUTE_DEADLINE).format(
          new Date(channel.ttlDeadline),
        )
      : null;
  if (remainingSeconds === null) {
    if (channel.ttlSeconds === null) {
      return {
        detailLabel: null,
        tooltipLabel: t`Ephemeral channel. Cleans up automatically after inactivity.`,
      };
    }
    const window = formatVerboseTtl(channel.ttlSeconds);
    return {
      detailLabel: formatCompactTtl(channel.ttlSeconds),
      tooltipLabel: t`Ephemeral channel. Cleans up after ${window} of inactivity.`,
    };
  }

  const compactRemaining = formatCompactRemaining(remainingSeconds);
  if (remainingSeconds <= 0) {
    return {
      detailLabel: compactRemaining,
      tooltipLabel: t`Ephemeral channel. Cleanup is due now.`,
    };
  }

  const when = formatVerboseRemaining(remainingSeconds, locale);
  return {
    detailLabel: compactRemaining,
    tooltipLabel: absoluteDeadlineLabel
      ? t`Ephemeral channel. Cleans up ${when}. Scheduled for ${absoluteDeadlineLabel}.`
      : t`Ephemeral channel. Cleans up ${when}.`,
  };
}

const TTL_UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 60 * 60 * 24,
};

const TTL_TOKEN_RE = /(\d+)([smhd])/giy;

/**
 * Parse a friendly duration string (`30m`, `12h`, `1d`, or combinations like
 * `1d12h`) into a positive number of seconds.
 *
 * Whitespace is tolerated, units are case-insensitive, and a bare number is
 * rejected (a unit is always required). Returns `null` for empty or malformed
 * input, or for a total of zero. The same unit may not appear twice.
 */
export function parseTtlDuration(input: string): number | null {
  const cleaned = input.trim().toLowerCase().replace(/\s+/g, "");
  if (cleaned === "") {
    return null;
  }

  TTL_TOKEN_RE.lastIndex = 0;
  const seen = new Set<string>();
  let total = 0;
  let consumed = 0;
  for (
    let match = TTL_TOKEN_RE.exec(cleaned);
    match !== null;
    match = TTL_TOKEN_RE.exec(cleaned)
  ) {
    const [token, amount, unit] = match;
    if (seen.has(unit)) {
      return null;
    }
    seen.add(unit);
    total += Number(amount) * TTL_UNIT_SECONDS[unit];
    consumed += token.length;
  }

  // Reject leftover characters (e.g. "1x", "1d!", "abc") and zero totals.
  if (consumed !== cleaned.length || total <= 0) {
    return null;
  }
  return total;
}

/**
 * Format a number of seconds back into a compact friendly string (`30m`,
 * `12h`, `1d`, `1d12h`) — the inverse of `parseTtlDuration` for the common
 * cases. Components that are zero are omitted; a non-positive input yields `""`.
 */
export function formatTtlDuration(ttlSeconds: number): string {
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    return "";
  }
  let remaining = Math.floor(ttlSeconds);
  const parts: string[] = [];
  for (const unit of ["d", "h", "m", "s"] as const) {
    const size = TTL_UNIT_SECONDS[unit];
    const count = Math.floor(remaining / size);
    if (count > 0) {
      parts.push(`${count}${unit}`);
      remaining -= count * size;
    }
  }
  return parts.join("");
}
