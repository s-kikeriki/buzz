import assert from "node:assert/strict";
import { test } from "node:test";

import {
  latestChannelActivityMs,
  orderSectionsByRecency,
} from "./sectionRecencyOrder.ts";

const channel = (id, lastMessageAt) => ({ id, name: id, lastMessageAt });
const section = (id, order) => ({ id, name: id, order });

test("takes the newest timestamp across a section's channels", () => {
  assert.equal(
    latestChannelActivityMs([
      channel("a", "2026-10-01T00:00:00Z"),
      channel("b", "2026-10-03T00:00:00Z"),
      channel("c", "2026-10-02T00:00:00Z"),
    ]),
    Date.parse("2026-10-03T00:00:00Z"),
  );
});

test("reads no activity as null, including unparseable timestamps", () => {
  assert.equal(latestChannelActivityMs([]), null);
  assert.equal(latestChannelActivityMs([channel("a", null)]), null);
  assert.equal(latestChannelActivityMs([channel("a", "not a date")]), null);
});

test("orders sections newest first", () => {
  const latest = {
    quiet: Date.parse("2026-10-01T00:00:00Z"),
    loud: Date.parse("2026-10-09T00:00:00Z"),
    middle: Date.parse("2026-10-05T00:00:00Z"),
  };
  const ordered = orderSectionsByRecency(
    [section("quiet", 0), section("loud", 1), section("middle", 2)],
    (id) => latest[id] ?? null,
  );
  assert.deepEqual(
    ordered.map((entry) => entry.id),
    ["loud", "middle", "quiet"],
  );
});

test("sinks sections with no activity to the bottom in their stored order", () => {
  const ordered = orderSectionsByRecency(
    [
      section("empty-first", 0),
      section("active", 1),
      section("empty-second", 2),
    ],
    (id) => (id === "active" ? Date.parse("2026-10-09T00:00:00Z") : null),
  );
  assert.deepEqual(
    ordered.map((entry) => entry.id),
    ["active", "empty-first", "empty-second"],
  );
});

test("breaks ties on the stored order so the result is stable", () => {
  const same = Date.parse("2026-10-09T00:00:00Z");
  const input = [section("second", 0), section("first", 1)];
  const ordered = orderSectionsByRecency(input, () => same);
  assert.deepEqual(
    ordered.map((entry) => entry.id),
    ["second", "first"],
  );
  assert.deepEqual(
    input.map((entry) => entry.id),
    ["second", "first"],
    "the input array must not be sorted in place",
  );
});
