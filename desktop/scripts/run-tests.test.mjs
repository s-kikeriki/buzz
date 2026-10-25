import assert from "node:assert/strict";
import test from "node:test";

import { PHASES, summarizeExitCode, summarizeOutcome } from "./run-tests.mjs";

test("both phases are declared, and the jsdom phase is one of them", () => {
  assert.deepEqual(
    PHASES.map((phase) => phase.name),
    ["node", "jsdom"],
  );
  const jsdom = PHASES.find((phase) => phase.name === "jsdom");
  assert.ok(jsdom.args.includes("./test-jsdom-setup.mjs"));
  assert.ok(jsdom.args.includes("src/**/*.jsdom-test.mjs"));
});

test("the node phase still covers both source and script tests", () => {
  const node = PHASES.find((phase) => phase.name === "node");
  assert.ok(node.args.includes("src/**/*.test.mjs"));
  assert.ok(node.args.includes("scripts/*.test.mjs"));
});

test("all phases passing exits zero", () => {
  assert.equal(
    summarizeExitCode([
      { name: "node", code: 0 },
      { name: "jsdom", code: 0 },
    ]),
    0,
  );
});

test("a failing first phase does not hide the second phase's result", () => {
  // The regression this guards: `phase1 && phase2` skipped phase two entirely,
  // so a pre-existing phase-one failure left 161 jsdom tests unreported.
  const results = [
    { name: "node", code: 1 },
    { name: "jsdom", code: 0 },
  ];
  assert.equal(summarizeExitCode(results), 1);
  assert.match(summarizeOutcome(results), /node failed/);
  assert.match(summarizeOutcome(results), /jsdom=pass/);
});

test("a failing second phase fails the run even when the first passed", () => {
  const results = [
    { name: "node", code: 0 },
    { name: "jsdom", code: 7 },
  ];
  assert.equal(summarizeExitCode(results), 7);
  assert.match(summarizeOutcome(results), /jsdom failed/);
});

test("both failing reports both and exits with the first code", () => {
  const results = [
    { name: "node", code: 3 },
    { name: "jsdom", code: 5 },
  ];
  assert.equal(summarizeExitCode(results), 3);
  assert.match(summarizeOutcome(results), /node, jsdom failed/);
});

test("the all-passed summary still names every phase", () => {
  const summary = summarizeOutcome([
    { name: "node", code: 0 },
    { name: "jsdom", code: 0 },
  ]);
  assert.match(summary, /all phases passed/);
  assert.match(summary, /node=pass/);
  assert.match(summary, /jsdom=pass/);
});
