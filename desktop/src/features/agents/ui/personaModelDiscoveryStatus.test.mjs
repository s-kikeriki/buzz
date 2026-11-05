import assert from "node:assert/strict";
import test from "node:test";

import { i18n } from "@lingui/core";

import { formatModelDiscoveryErrorStatus } from "./personaModelDiscoveryStatus.ts";

/**
 * The exact strings `agent_models_databricks.rs` emits. That crate has no
 * i18n, so these are always English, whatever locale the app is in.
 */
const RUST_SIGN_IN_REQUIRED =
  "Databricks sign-in is required; save this agent, then open its model picker to sign in, or run `buzz-agent auth databricks`";
const RUST_SIGN_IN_TIMED_OUT =
  "Databricks sign-in timed out; open the model picker to retry, or run `buzz-agent auth databricks`";
const RUST_SIGN_IN_FAILED = "Databricks sign-in failed: invalid_grant";

/**
 * Run `body` with a catalogue that translates the ids the old code matched on.
 *
 * Deliberately a hand-written three-entry catalogue rather than the real `.po`:
 * the point is only to prove the matcher does not read the catalogue, and
 * `test-loader.mjs` documents why pulling the real catalogue into unit tests
 * would make a translation edit able to break an unrelated test.
 */
function withTranslatedAuthStrings(body) {
  i18n.loadAndActivate({
    locale: "xx",
    messages: {
      "Databricks sign-in is required": "ÜBERSETZT-REQUIRED",
      "Databricks sign-in failed": "ÜBERSETZT-FAILED",
      "Databricks sign-in timed out": "ÜBERSETZT-TIMEOUT",
    },
  });
  try {
    body();
  } finally {
    // Restore what test-loader.mjs set up for every other test in the process.
    i18n.loadAndActivate({ locale: "en", messages: {} });
  }
}

const GENERIC_FALLBACK = "Using built-in model options";

test("Databricks sign-in outcomes are classified under any locale", () => {
  withTranslatedAuthStrings(() => {
    const required = formatModelDiscoveryErrorStatus(
      new Error(RUST_SIGN_IN_REQUIRED),
      "databricks",
    );
    assert.equal(
      required.tone,
      "muted",
      "sign-in required is a quiet note, not a warning",
    );
    assert.ok(
      !required.message.includes(GENERIC_FALLBACK),
      "sign-in required must not fall through to the generic model-load message",
    );

    for (const message of [RUST_SIGN_IN_TIMED_OUT, RUST_SIGN_IN_FAILED]) {
      const status = formatModelDiscoveryErrorStatus(
        new Error(message),
        "databricks",
      );
      assert.equal(status.tone, "warning", message);
      assert.ok(
        !status.message.includes(GENERIC_FALLBACK),
        `a failed sign-in must not fall through to the generic message: ${message}`,
      );
    }
  });
});

test("an unrelated Databricks error still gets the generic fallback", () => {
  const status = formatModelDiscoveryErrorStatus(
    new Error("connection reset by peer"),
    "databricks",
  );

  assert.equal(status.tone, "warning");
  assert.ok(
    status.message.includes(GENERIC_FALLBACK),
    "only the three sign-in outcomes are special-cased",
  );
});

test("the provider fallback label is translatable", () => {
  const status = formatModelDiscoveryErrorStatus(
    new Error("connection reset by peer"),
    "   ",
  );

  // Empty provider → "this provider", which was a bare literal and is now in
  // the catalogue. Asserted through the sentence it is interpolated into.
  assert.ok(status.message.includes("this provider"), status.message);
});
