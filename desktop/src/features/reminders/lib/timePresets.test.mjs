import assert from "node:assert/strict";
import test from "node:test";
import { i18n } from "@lingui/core";

import {
  parseCustomDateTime,
  timePresets,
  todayDateString,
} from "./timePresets.ts";

const nowSeconds = () => Math.floor(Date.now() / 1_000);

// Presets are looked up by their locale-independent `id`, never by the label
// the user reads. One test below pins the English labels so a copy change is
// still visible here.
function presetById(id) {
  const preset = timePresets(i18n).find((p) => p.id === id);
  if (!preset) throw new Error(`preset not found: ${id}`);
  return preset;
}

test("TIME_PRESETS_every_preset_returns_strictly_future_timestamp", () => {
  const now = nowSeconds();
  for (const preset of timePresets(i18n)) {
    assert.ok(
      preset.getTimestamp() > now,
      `${preset.id} must be strictly in the future`,
    );
  }
});

test("TIME_PRESETS_relative_offsets_match_their_ids", () => {
  const before = nowSeconds();
  const byId = Object.fromEntries(
    timePresets(i18n).map((p) => [p.id, p.getTimestamp()]),
  );
  // Allow a 2s window for clock drift across the getTimestamp calls.
  assert.ok(Math.abs(byId.in30m - (before + 30 * 60)) <= 2);
  assert.ok(Math.abs(byId.in1h - (before + 60 * 60)) <= 2);
  assert.ok(Math.abs(byId.in3h - (before + 3 * 60 * 60)) <= 2);
});

test("TIME_PRESETS_9am_presets_land_on_a_9am_boundary", () => {
  for (const id of ["tomorrow9am", "nextMonday9am"]) {
    const d = new Date(presetById(id).getTimestamp() * 1_000);
    assert.equal(d.getHours(), 9);
    assert.equal(d.getMinutes(), 0);
  }
});

test("TIME_PRESETS_next_monday_lands_on_a_monday", () => {
  const d = new Date(presetById("nextMonday9am").getTimestamp() * 1_000);
  assert.equal(d.getDay(), 1); // Monday
});

test("timePresets_resolvesLabelsThroughI18n_andKeepsIdsStable", () => {
  const presets = timePresets(i18n);
  assert.deepEqual(
    presets.map((p) => p.id),
    ["in30m", "in1h", "in3h", "tomorrow9am", "nextMonday9am"],
  );
  // English copy, pinned: the test-loader activates `en`.
  assert.deepEqual(
    presets.map((p) => p.label),
    [
      "In 30 minutes",
      "In 1 hour",
      "In 3 hours",
      "Tomorrow at 9am",
      "Next Monday at 9am",
    ],
  );
});

test("parseCustomDateTime_future_datetime_returns_timestamp", () => {
  const future = new Date(Date.now() + 24 * 60 * 60 * 1_000);
  const date = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`;
  const result = parseCustomDateTime(date, "14:30");
  assert.ok(result !== null);
  assert.ok(result > nowSeconds());
});

test("parseCustomDateTime_past_datetime_returns_null", () => {
  // One year ago — unambiguously past regardless of run time.
  const past = new Date(Date.now() - 365 * 24 * 60 * 60 * 1_000);
  const date = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, "0")}-${String(past.getDate()).padStart(2, "0")}`;
  assert.equal(parseCustomDateTime(date, "09:00"), null);
});

test("parseCustomDateTime_empty_inputs_return_null", () => {
  assert.equal(parseCustomDateTime("", "09:00"), null);
  assert.equal(parseCustomDateTime("2099-01-01", ""), null);
  assert.equal(parseCustomDateTime("", ""), null);
});

test("parseCustomDateTime_malformed_inputs_return_null", () => {
  assert.equal(parseCustomDateTime("not-a-date", "09:00"), null);
  assert.equal(parseCustomDateTime("2099-01-01", "99:99"), null);
});

test("todayDateString_returns_today_in_YYYY_MM_DD_local", () => {
  const now = new Date();
  const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  assert.equal(todayDateString(), expected);
});
