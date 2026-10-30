import assert from "node:assert/strict";
import test from "node:test";

import {
  formatRelativeTime,
  formatRelativeTimeOrDate,
  resetRelativeTimeFormattersForTests,
} from "./relativeTime.ts";

const MINUTE = 60;
const HOUR = 3_600;
const DAY = 86_400;
const WEEK = 604_800;

/** Fixed clock, so no case depends on when the suite runs. */
const NOW = 1_800_000_000;

function ago(seconds, options = {}) {
  return formatRelativeTime(NOW - seconds, {
    locale: "en",
    nowSeconds: NOW,
    ...options,
  });
}

test("English compact reproduces the labels the private copies produced", () => {
  // The eleven deleted formatters all built `${n}m ago` by hand. These are the
  // exact strings they emitted; if `Intl` narrow style ever stopped matching,
  // every chip in the app would change wording at once and this is the test
  // that says so.
  assert.equal(ago(5 * MINUTE), "5m ago");
  assert.equal(ago(1 * MINUTE), "1m ago");
  assert.equal(ago(59 * MINUTE), "59m ago");
  assert.equal(ago(3 * HOUR), "3h ago");
  assert.equal(ago(23 * HOUR), "23h ago");
  assert.equal(ago(2 * DAY), "2d ago");
  assert.equal(ago(6 * DAY), "6d ago");
  assert.equal(ago(3 * WEEK), "3w ago");
});

test("below a minute is just now, and so is the future", () => {
  assert.equal(ago(0), "just now");
  assert.equal(ago(59), "just now");
  // Clock skew, or a relay running ahead of this machine. Bounded at zero so
  // the label never reads as a negative count or in the future tense.
  assert.equal(ago(-5), "just now");
  assert.equal(ago(-10 * DAY), "just now");
});

test("each rung starts exactly at its boundary", () => {
  assert.equal(ago(MINUTE - 1), "just now");
  assert.equal(ago(MINUTE), "1m ago");
  assert.equal(ago(HOUR - 1), "59m ago");
  assert.equal(ago(HOUR), "1h ago");
  assert.equal(ago(DAY - 1), "23h ago");
  assert.equal(ago(DAY), "1d ago");
  assert.equal(ago(WEEK - 1), "6d ago");
  assert.equal(ago(WEEK), "1w ago");
});

test("the day ceiling keeps counting days instead of switching to weeks", () => {
  // The surfaces that show a calendar date past a week cap here and format the
  // rest themselves; a `1w ago` from this function would override that.
  assert.equal(ago(WEEK, { ceiling: "day" }), "7d ago");
  assert.equal(ago(400 * DAY, { ceiling: "day" }), "400d ago");
  assert.equal(ago(400 * DAY, { ceiling: "week" }), "57w ago");
});

test("long style is prose, compact style is a chip", () => {
  assert.equal(ago(5 * MINUTE, { style: "long" }), "5 minutes ago");
  assert.equal(ago(MINUTE, { style: "long" }), "1 minute ago");
  assert.equal(ago(5 * MINUTE, { style: "compact" }), "5m ago");
});

test("German compact says Min., not a bare m", () => {
  // `Intl` narrow German abbreviates minutes to "vor 5 m", which reads as five
  // metres. This is the one place the module makes a per-locale choice, so it
  // is also the one that needs pinning: `short` for German, `narrow` for
  // English, both verified against the runtime rather than assumed.
  const german = (seconds, options) =>
    formatRelativeTime(NOW - seconds, {
      locale: "de",
      nowSeconds: NOW,
      ...options,
    });

  assert.equal(german(5 * MINUTE), "vor 5 Min.");
  assert.equal(german(MINUTE), "vor 1 Min.");
  assert.equal(german(3 * HOUR), "vor 3 Std.");
  assert.equal(german(2 * DAY), "vor 2 Tagen");
  assert.equal(german(3 * WEEK), "vor 3 Wochen");

  assert.doesNotMatch(german(5 * MINUTE), /\bm\b/);
});

test("German carries its own plural rules", () => {
  const german = (seconds) =>
    formatRelativeTime(NOW - seconds, {
      locale: "de",
      nowSeconds: NOW,
      style: "long",
    });

  assert.equal(german(MINUTE), "vor 1 Minute");
  assert.equal(german(2 * MINUTE), "vor 2 Minuten");
  assert.equal(german(DAY), "vor 1 Tag");
  assert.equal(german(2 * DAY), "vor 2 Tagen");
});

test("the one-day case stays numeric rather than becoming 'yesterday'", () => {
  // `numeric: "auto"` would say "yesterday", which collides with the day-group
  // heading that already says Yesterday directly above the row.
  assert.equal(ago(DAY), "1d ago");
  assert.equal(ago(DAY, { style: "long" }), "1 day ago");
});

test("the memo cache is keyed by locale and style, not shared across them", () => {
  resetRelativeTimeFormattersForTests();

  // A single module-level formatter is exactly how the old code ended up
  // locale-frozen. Interleaving the locales proves the second one is not
  // served the first one's formatter.
  assert.equal(ago(5 * MINUTE), "5m ago");
  assert.equal(
    formatRelativeTime(NOW - 5 * MINUTE, { locale: "de", nowSeconds: NOW }),
    "vor 5 Min.",
  );
  assert.equal(ago(5 * MINUTE), "5m ago");
  assert.equal(ago(5 * MINUTE, { style: "long" }), "5 minutes ago");
  assert.equal(ago(5 * MINUTE), "5m ago");
});

test("the pseudo-locale formats as English rather than following the host", () => {
  // `Intl` does not reject an unmatched tag, it silently uses the runtime
  // default — so an unmapped `pseudo` would print whatever locale this machine
  // happens to be in, and the overflow guard would be measuring noise.
  assert.equal(
    formatRelativeTime(NOW - 5 * MINUTE, {
      locale: "pseudo",
      nowSeconds: NOW,
    }),
    "5m ago",
  );
});

test("an unknown locale fails loudly instead of using the host locale", () => {
  assert.throws(
    () => formatRelativeTime(NOW - 5 * MINUTE, { nowSeconds: NOW }),
    /not an app locale/,
  );
  assert.throws(
    () =>
      formatRelativeTime(NOW - 5 * MINUTE, {
        locale: "fr",
        nowSeconds: NOW,
      }),
    /not an app locale/,
  );
});

// ── formatRelativeTimeOrDate ────────────────────────────────────────────────

test("the date switch happens exactly at one week", () => {
  const orDate = (seconds, options = {}) =>
    formatRelativeTimeOrDate(NOW - seconds, {
      locale: "en",
      nowSeconds: NOW,
      ...options,
    });

  assert.equal(orDate(WEEK - 1), "6d ago");
  assert.doesNotMatch(orDate(WEEK), /ago/);
  assert.equal(orDate(8 * DAY, { style: "long" }), orDate(8 * DAY));
});

test("the year appears only across a year boundary", () => {
  // NOW is 2027-01-15; both of these are more than a week back, so both take
  // the date branch, and only one of them needs the year to be unambiguous.
  const sameYear = Date.UTC(2027, 0, 2) / 1_000;
  const lastYear = Date.UTC(2026, 11, 20) / 1_000;
  const now = Date.UTC(2027, 0, 15) / 1_000;

  assert.equal(
    formatRelativeTimeOrDate(sameYear, { locale: "en", nowSeconds: now }),
    "Jan 2",
  );
  assert.equal(
    formatRelativeTimeOrDate(lastYear, { locale: "en", nowSeconds: now }),
    "Dec 20, 2026",
  );
  assert.equal(
    formatRelativeTimeOrDate(lastYear, { locale: "de", nowSeconds: now }),
    "20. Dez. 2026",
  );
});

test("both halves follow the locale, not just the relative one", () => {
  // The original defect was exactly half-and-half: an English unit table on
  // one side, `toLocaleDateString(undefined)` on the other.
  const now = Date.UTC(2027, 0, 15) / 1_000;

  assert.equal(
    formatRelativeTimeOrDate(now - 2 * DAY, { locale: "de", nowSeconds: now }),
    "vor 2 Tagen",
  );
  // 30 days back from 15 January is still 2026, so the year comes with it.
  assert.equal(
    formatRelativeTimeOrDate(now - 30 * DAY, { locale: "de", nowSeconds: now }),
    "16. Dez. 2026",
  );
  // And a date more than a week back inside the same year does not.
  assert.equal(
    formatRelativeTimeOrDate(now - 10 * DAY, { locale: "de", nowSeconds: now }),
    "5. Jan.",
  );
});
