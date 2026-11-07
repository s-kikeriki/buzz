import assert from "node:assert/strict";
import test from "node:test";
import { i18n } from "@lingui/core";

import {
  formatTimeoutRemaining,
  isTimeoutActive,
  parseTimeoutRejection,
  timeoutExpiresAt,
  TIMEOUT_PRESETS,
} from "./timeout.ts";

test("parses a well-formed timeout rejection to epoch ms", () => {
  const result = parseTimeoutRejection(
    "restricted: you are timed out until 1751920000",
  );
  assert.deepEqual(result, { expiresAtMs: 1751920000 * 1000 });
});

test("tolerates surrounding whitespace", () => {
  const result = parseTimeoutRejection(
    "  restricted: you are timed out until 1751920000  ",
  );
  assert.deepEqual(result, { expiresAtMs: 1751920000 * 1000 });
});

test("returns null for a non-timeout rejection", () => {
  assert.equal(
    parseTimeoutRejection("blocked: you are banned from this community"),
    null,
  );
  assert.equal(parseTimeoutRejection("restricted: not a channel member"), null);
  assert.equal(parseTimeoutRejection(""), null);
  assert.equal(parseTimeoutRejection(null), null);
  assert.equal(parseTimeoutRejection(undefined), null);
});

test("timeout with unparseable timestamp still signals timed-out", () => {
  assert.deepEqual(
    parseTimeoutRejection("restricted: you are timed out until soon"),
    { expiresAtMs: null },
  );
  assert.deepEqual(
    parseTimeoutRejection("restricted: you are timed out until "),
    { expiresAtMs: null },
  );
  assert.deepEqual(
    parseTimeoutRejection("restricted: you are timed out until -5"),
    { expiresAtMs: null },
  );
});

test("isTimeoutActive: future expiry active, past expiry inactive", () => {
  const now = 1_000_000_000_000;
  assert.equal(isTimeoutActive(now + 5000, now), true);
  assert.equal(isTimeoutActive(now - 5000, now), false);
});

test("isTimeoutActive: unknown expiry fails closed (active)", () => {
  assert.equal(isTimeoutActive(null, 1_000_000_000_000), true);
});

test("formatTimeoutRemaining: hours, minutes, seconds tiers", () => {
  // Each rung is a whole message with the counts as placeholders, so the
  // English output below is byte-identical to the concatenation it replaced
  // and German can put "Std."/"Min."/"Sek." where it needs them.
  const now = 1_000_000_000_000;
  assert.equal(
    formatTimeoutRemaining(i18n, now + (2 * 3600 + 5 * 60) * 1000, now),
    "2h 5m",
  );
  assert.equal(
    formatTimeoutRemaining(i18n, now + (3 * 60 + 20) * 1000, now),
    "3m 20s",
  );
  assert.equal(formatTimeoutRemaining(i18n, now + 12 * 1000, now), "12s");
});

test("formatTimeoutRemaining: every rung is translated, not glued together", () => {
  // The guard this test exists for: gluing the units back onto the numbers
  // returns the same English string, so the three assertions above still pass
  // and the coverage detector does not look inside a `return`. Nothing else
  // anywhere goes red.
  //
  // A stub instance rather than a catalogue, because a Lingui id is a content
  // hash of the message and keying a catalogue by the English text activates
  // nothing. The stub returns the descriptor's own message with the units
  // swapped, which is what a real German catalogue does to these three.
  const german = {
    _: (descriptor) =>
      descriptor.message
        .replace("h ", " Std. ")
        .replace("m ", " Min. ")
        .replace(/m$/, " Min.")
        .replace(/s$/, " Sek."),
  };
  const now = 1_000_000_000_000;
  assert.equal(
    formatTimeoutRemaining(german, now + (2 * 3600 + 5 * 60) * 1000, now),
    "{hours} Std. {minutes} Min.",
  );
  assert.equal(
    formatTimeoutRemaining(german, now + (3 * 60 + 20) * 1000, now),
    "{minutes} Min. {seconds} Sek.",
  );
  assert.equal(
    formatTimeoutRemaining(german, now + 12 * 1000, now),
    "{seconds} Sek.",
  );
});

test("formatTimeoutRemaining: null when unknown or elapsed", () => {
  const now = 1_000_000_000_000;
  assert.equal(formatTimeoutRemaining(i18n, null, now), null);
  assert.equal(formatTimeoutRemaining(i18n, now - 1000, now), null);
  assert.equal(formatTimeoutRemaining(i18n, now, now), null);
});

test("timeoutExpiresAt: absolute expiry is now (seconds) + preset seconds", () => {
  const nowMs = 1_000_000_000_000;
  assert.equal(timeoutExpiresAt(3600, nowMs), 1_000_000_000 + 3600);
  // Floors sub-second now before adding, so the result is a whole second.
  assert.equal(timeoutExpiresAt(60, nowMs + 999), 1_000_000_000 + 60);
});

test("TIMEOUT_PRESETS: the shared 1h/24h/7d set", () => {
  assert.deepEqual(
    TIMEOUT_PRESETS.map((preset) => preset.seconds),
    [60 * 60, 24 * 60 * 60, 7 * 24 * 60 * 60],
  );
});

test("TIMEOUT_PRESETS: labels are descriptors resolved per render, not strings", () => {
  // A resolved string here would freeze in whichever locale booted first —
  // the table is built at module load. Every label must be a descriptor the
  // consumer passes through `i18n._()`.
  for (const preset of TIMEOUT_PRESETS) {
    assert.equal(
      typeof preset.label,
      "object",
      `preset ${preset.seconds} must carry a MessageDescriptor, not a resolved string`,
    );
    assert.equal(typeof preset.label.id, "string");
  }
  // English copy, pinned: the test-loader activates `en` with an empty
  // catalogue, so this is the source copy the macro inlined.
  assert.deepEqual(
    TIMEOUT_PRESETS.map((preset) => i18n._(preset.label)),
    ["1 hour", "24 hours", "7 days"],
  );
});
