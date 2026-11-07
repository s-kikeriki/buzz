import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { i18n } from "@lingui/core";

import {
  DURATION_OPTIONS,
  durationLabel,
  halfHourTimes,
  inferredDuration,
  PRESETS,
} from "./ui/SetStatusDialog.tsx";

/**
 * The three seams the set-status dialog's i18n conversion created.
 *
 * These are exported for this test and nothing else. That is deliberate: each
 * one is a pure function or table whose failure mode is invisible to the
 * catalogue gate, the coverage gate *and* an English e2e run, because all
 * three would still see correct English.
 */

/** Ids every `switch` in the component has a case for. */
const SWITCHED_IDS = ["1-hour", "8-hours", "today", "this-week", "custom"];

describe("expiry option ids are separate from their labels", () => {
  /**
   * The option id used to *be* the displayed label. If a future change puts
   * copy back into the id — or renames one — the component's `switch` loses a
   * case and the chosen expiry silently falls through to `undefined`.
   */
  it("offers exactly the ids the component switches on, in order", () => {
    assert.deepEqual(
      DURATION_OPTIONS.map((option) => option.id),
      SWITCHED_IDS,
    );
  });

  it("carries a message descriptor, never a resolved string", () => {
    for (const option of DURATION_OPTIONS) {
      assert.equal(
        typeof option.label,
        "object",
        `${option.id} must stay a descriptor: a resolved string here freezes in the boot locale`,
      );
      assert.ok(
        typeof option.label.id === "string" && option.label.id.length > 0,
        `${option.id} must carry an extracted message id`,
      );
    }
  });

  /**
   * `inferredDuration` reads a saved status back into a selection. Every value
   * it can return has to be one the menu can show, or reopening a saved status
   * renders a raw id in the trigger.
   */
  it("only infers ids the menu can render", () => {
    const now = Date.now();
    const seconds = (ms) => Math.floor(ms / 1_000);
    const inferred = [
      inferredDuration(undefined, undefined),
      inferredDuration(seconds(now - 60_000), seconds(now)),
      inferredDuration(seconds(now + 60 * 60_000), seconds(now)),
      inferredDuration(seconds(now + 8 * 60 * 60_000), seconds(now)),
      inferredDuration(seconds(now + 72 * 60 * 60_000), seconds(now)),
      inferredDuration(seconds(now + 60 * 60_000), undefined),
    ];
    for (const id of inferred) {
      assert.ok(SWITCHED_IDS.includes(id), `unknown duration id: ${id}`);
    }
    // The two that are pinned by the component's own reset path.
    assert.equal(inferredDuration(undefined, undefined), "today");
    assert.equal(
      inferredDuration(Math.floor((Date.now() + 3_600_000) / 1_000), undefined),
      "custom",
    );
  });

  it("falls back to the id rather than rendering nothing", () => {
    i18n.loadAndActivate({ locale: "en", messages: {} });
    assert.equal(durationLabel(i18n, "not-an-id"), "not-an-id");
  });
});

describe("quick-status ids are locale-independent", () => {
  /**
   * These slugs are the DOM ids `tests/e2e/profile-custom-emoji-status.spec.ts`
   * binds (`set-status-preset-working-remotely`). They used to be derived from
   * the displayed English text, so a German render changed them. Pinning them
   * here means a rename of the copy cannot move a selector by accident.
   */
  it("pins the five slugs the e2e selectors bind", () => {
    assert.deepEqual(
      PRESETS.map((preset) => preset.id),
      [
        "in-a-meeting",
        "commuting",
        "out-sick",
        "vacationing",
        "working-remotely",
      ],
    );
  });

  it("holds no displayed text outside a descriptor", () => {
    for (const preset of PRESETS) {
      assert.equal(typeof preset.label, "object", preset.id);
      assert.equal(typeof preset.emoji, "string", preset.id);
      assert.equal(
        Object.hasOwn(preset, "text"),
        false,
        `${preset.id} must not carry a resolved \`text\` again`,
      );
    }
  });
});

describe("half-hour labels follow the app locale", () => {
  /** The 12-hour clock the menu used to hand-roll, as the English control. */
  function handRolled(hour, minute) {
    const period = hour < 12 ? "AM" : "PM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minute.toString().padStart(2, "0")} ${period}`;
  }

  it("keeps the English labels byte-identical to the old hand-rolled clock", () => {
    const times = halfHourTimes("en");
    assert.equal(times.length, 48);
    times.forEach((time, index) => {
      const hour = Math.floor(index / 2);
      const minute = index % 2 === 0 ? 0 : 30;
      assert.equal(
        time.value,
        `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`,
      );
      assert.equal(
        time.label,
        handRolled(hour, minute),
        `en label drifted at ${time.value}`,
      );
    });
  });

  it("labels German on a 24-hour clock with no AM/PM", () => {
    const times = halfHourTimes("de");
    assert.equal(times.length, 48);
    const byValue = new Map(times.map((time) => [time.value, time.label]));
    assert.equal(byValue.get("00:00"), "0:00");
    assert.equal(byValue.get("13:30"), "13:30");
    assert.equal(byValue.get("23:30"), "23:30");
    for (const time of times) {
      assert.doesNotMatch(
        time.label,
        /AM|PM/,
        `German label ${time.label} still carries a 12-hour period`,
      );
    }
  });

  /**
   * The values are the state the component stores and compares; only the
   * labels may follow the locale. A formatter change that leaked into `value`
   * would make a saved custom time stop matching its own menu row.
   */
  it("keeps the stored values locale-invariant", () => {
    assert.deepEqual(
      halfHourTimes("de").map((time) => time.value),
      halfHourTimes("en").map((time) => time.value),
    );
  });
});
