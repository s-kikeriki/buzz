import assert from "node:assert/strict";
import test from "node:test";

import {
  formatShortMonthDay,
  formatThreadSummaryLastReplyTime,
  formatTimeWithoutDayPeriod,
  startOfLocalDaySeconds,
} from "./dateFormatters.ts";

function localUnixSeconds(year, monthIndex, day) {
  return new Date(year, monthIndex, day, 12).getTime() / 1_000;
}

test("formatShortMonthDay abbreviates the month and omits the ordinal", () => {
  assert.equal(
    formatShortMonthDay(localUnixSeconds(2026, 4, 19), "en"),
    "May 19",
  );
  assert.equal(
    formatShortMonthDay(localUnixSeconds(2026, 4, 1), "en"),
    "May 1",
  );
});

test("formatShortMonthDay follows the app locale, not the machine's", () => {
  // The whole point of threading `locale` through: this assertion is what the
  // old module-level `new Intl.DateTimeFormat("en-US", …)` made impossible.
  assert.equal(
    formatShortMonthDay(localUnixSeconds(2026, 4, 19), "de"),
    "19. Mai",
  );
});

test("no day carries an ordinal suffix", () => {
  for (const day of [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31]) {
    const label = formatShortMonthDay(localUnixSeconds(2026, 4, day), "en");
    assert.doesNotMatch(label, /\d(?:st|nd|rd|th)\b/, `ordinal in "${label}"`);
  }
});

test("formatTimeWithoutDayPeriod removes AM/PM suffixes", () => {
  assert.equal(formatTimeWithoutDayPeriod("8:00 AM"), "8:00");
  assert.equal(formatTimeWithoutDayPeriod("12:34\u202fPM"), "12:34");
  assert.equal(formatTimeWithoutDayPeriod("16:20"), "16:20");
});

test("formatThreadSummaryLastReplyTime expands relative units", () => {
  const now = localUnixSeconds(2026, 4, 19);

  assert.equal(
    formatThreadSummaryLastReplyTime(now - 30, {
      locale: "en",
      nowSeconds: now,
    }),
    "just now",
  );
  assert.equal(
    formatThreadSummaryLastReplyTime(now - 60, {
      locale: "en",
      nowSeconds: now,
    }),
    "1 minute ago",
  );
  assert.equal(
    formatThreadSummaryLastReplyTime(now - 180, {
      locale: "en",
      nowSeconds: now,
    }),
    "3 minutes ago",
  );
  assert.equal(
    formatThreadSummaryLastReplyTime(now - 3_600, {
      locale: "en",
      nowSeconds: now,
    }),
    "1 hour ago",
  );
  assert.equal(
    formatThreadSummaryLastReplyTime(now - 10_800, {
      locale: "en",
      nowSeconds: now,
    }),
    "3 hours ago",
  );
  assert.equal(
    formatThreadSummaryLastReplyTime(now - 86_400, {
      locale: "en",
      nowSeconds: now,
    }),
    "1 day ago",
  );
  assert.equal(
    formatThreadSummaryLastReplyTime(now - 345_600, {
      locale: "en",
      nowSeconds: now,
    }),
    "4 days ago",
  );
});

test("formatThreadSummaryLastReplyTime reads as German prose in German", () => {
  const now = localUnixSeconds(2026, 4, 19);
  const german = (seconds) =>
    formatThreadSummaryLastReplyTime(now - seconds, {
      locale: "de",
      nowSeconds: now,
    });

  // `Intl` carries the plural rules, so the singular/plural split that the old
  // hand-rolled `${value} ${unit}${value === 1 ? "" : "s"}` could only do for
  // English comes out right here without this module knowing any German.
  assert.equal(german(60), "vor 1 Minute");
  assert.equal(german(180), "vor 3 Minuten");
  assert.equal(german(3_600), "vor 1 Stunde");
  assert.equal(german(10_800), "vor 3 Stunden");
  assert.equal(german(86_400), "vor 1 Tag");
  assert.equal(german(345_600), "vor 4 Tagen");
});

test("formatThreadSummaryLastReplyTime dates older replies without an ordinal", () => {
  const now = localUnixSeconds(2026, 5, 15);
  const replyAt = localUnixSeconds(2026, 4, 19);

  assert.equal(
    formatThreadSummaryLastReplyTime(replyAt, {
      locale: "en",
      nowSeconds: now,
    }),
    "on May 19",
  );
});

test("startOfLocalDaySeconds collapses a day's timestamps to one value", () => {
  const morning = new Date(2026, 5, 14, 8, 30, 15).getTime() / 1_000;
  const evening = new Date(2026, 5, 14, 23, 59, 59).getTime() / 1_000;
  const midnight = new Date(2026, 5, 14, 0, 0, 0).getTime() / 1_000;

  assert.equal(startOfLocalDaySeconds(morning), midnight);
  assert.equal(startOfLocalDaySeconds(evening), midnight);
});

test("startOfLocalDaySeconds separates adjacent calendar days", () => {
  const lateOn14 = new Date(2026, 5, 14, 23, 0, 0).getTime() / 1_000;
  const earlyOn15 = new Date(2026, 5, 15, 1, 0, 0).getTime() / 1_000;

  assert.notEqual(
    startOfLocalDaySeconds(lateOn14),
    startOfLocalDaySeconds(earlyOn15),
  );
});
