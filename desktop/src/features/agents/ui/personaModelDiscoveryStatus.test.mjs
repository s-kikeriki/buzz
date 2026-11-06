import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { i18n } from "@lingui/core";

import { formatModelDiscoveryErrorStatus } from "./personaModelDiscoveryStatus.ts";

test("model discovery status names missing Anthropic credentials", () => {
  const status = formatModelDiscoveryErrorStatus(
    new Error("config: ANTHROPIC_API_KEY required"),
    "anthropic",
  );

  assert.equal(status?.tone, "warning");
  assert.match(status?.message ?? "", /Anthropic API key/);
  assert.match(status?.message ?? "", /Anthropic models/);
});

test("model discovery status names missing OpenAI-compatible credentials", () => {
  const status = formatModelDiscoveryErrorStatus(
    new Error("config: OPENAI_COMPAT_API_KEY required"),
    "openai-compat",
  );

  assert.equal(status?.tone, "warning");
  assert.match(status?.message ?? "", /OpenAI runtime API key/);
  assert.match(status?.message ?? "", /OPENAI_COMPAT_API_KEY/);
  assert.match(status?.message ?? "", /OpenAI models/);
});

test("Buzz shared compute names the empty state and next action", () => {
  const status = formatModelDiscoveryErrorStatus(
    new Error("no Buzz shared compute serving members are available"),
    "relay-mesh",
  );

  assert.equal(status?.tone, "warning");
  assert.match(status?.message ?? "", /No members are sharing compute/);
  assert.match(status?.message ?? "", /Settings > Compute/);
});

test("Buzz shared compute distinguishes relay lookup failures", () => {
  const status = formatModelDiscoveryErrorStatus(
    new Error("Buzz shared compute model discovery failed: relay offline"),
    "relay-mesh",
  );

  assert.equal(status?.tone, "warning");
  assert.match(status?.message ?? "", /couldn't check shared compute/);
  assert.match(status?.message ?? "", /relay connection/);
});

test("Buzz shared compute names a missing relay member roster", () => {
  const status = formatModelDiscoveryErrorStatus(
    new Error("Buzz shared compute is waiting for the current member roster"),
    "relay-mesh",
  );

  assert.equal(status?.tone, "warning");
  assert.match(status?.message ?? "", /waiting for the relay's member roster/);
  assert.match(status?.message ?? "", /membership configuration/);
  assert.doesNotMatch(status?.message ?? "", /relay connection/);
});

for (const error of [
  "config: DATABRICKS_HOST required",
  "buzz-acp models failed (exit 1): config: DATABRICKS_MODEL required",
]) {
  test(`missing Databricks host is named, not swallowed: ${error}`, () => {
    const status = formatModelDiscoveryErrorStatus(
      new Error(error),
      "databricks_v2",
    );

    assert.equal(status.tone, "warning");
    assert.match(status.message, /DATABRICKS_HOST/);
    assert.match(status.message, /Advanced/);
  });
}

test("missing provider asks the user to choose one", () => {
  const status = formatModelDiscoveryErrorStatus(
    new Error("config: BUZZ_AGENT_PROVIDER is required"),
    "",
  );

  assert.equal(status.tone, "muted");
  assert.match(status.message, /Choose a provider/);
});

test("Databricks sign-in-required is a muted note pointing at the picker and CLI", () => {
  const status = formatModelDiscoveryErrorStatus(
    new Error(
      "Databricks sign-in is required; save this agent, then open its model picker to sign in, or run `buzz-agent auth databricks`",
    ),
    "databricks_v2",
  );

  assert.equal(status?.tone, "muted");
  assert.match(status?.message ?? "", /model picker/);
  assert.match(status?.message ?? "", /buzz-agent auth databricks/);
});

test("Databricks sign-in failure warns and points at the explicit retry", () => {
  const status = formatModelDiscoveryErrorStatus(
    new Error("Databricks sign-in failed: oauth callback: access_denied"),
    "databricks_v2",
  );

  assert.equal(status?.tone, "warning");
  assert.match(status?.message ?? "", /didn't complete/);
  assert.match(status?.message ?? "", /model picker/);
});

test("Databricks sign-in timeout warns and points at the explicit retry", () => {
  const status = formatModelDiscoveryErrorStatus(
    new Error(
      "Databricks sign-in timed out; open the model picker to retry, or run `buzz-agent auth databricks`",
    ),
    "databricks_v2",
  );

  assert.equal(status?.tone, "warning");
  assert.match(status?.message ?? "", /didn't complete/);
  assert.match(status?.message ?? "", /buzz-agent auth databricks/);
});

test("other Databricks discovery failures fall through to the generic notice", () => {
  const status = formatModelDiscoveryErrorStatus(
    new Error("Databricks model discovery failed: relay offline"),
    "databricks_v2",
  );

  assert.equal(status?.tone, "warning");
  assert.match(status?.message ?? "", /Using built-in model options/);
});

test("auth-required errors name the agent and ask for sign-in", () => {
  // Real shape from run_agent_models_command wrapping buzz-acp stderr when
  // cursor-agent is signed out (spec ErrorCode::AuthRequired text).
  const status = formatModelDiscoveryErrorStatus(
    new Error(
      "buzz-acp models failed (exit 1): agent communication failed: Agent reported error (code -32000): Authentication required",
    ),
    "",
    "Cursor",
  );

  assert.equal(status?.tone, "warning");
  assert.match(status?.message ?? "", /Cursor requires sign-in/);
  assert.match(status?.message ?? "", /Sign in with the Cursor CLI/);
});

test("auth-required copy degrades gracefully without an agent label", () => {
  const status = formatModelDiscoveryErrorStatus(
    new Error("Agent reported error (code -32000): Authentication required"),
    "",
  );

  assert.equal(status?.tone, "warning");
  assert.match(status?.message ?? "", /This agent requires sign-in/);
});

test("non-auth -32000 errors do NOT get the sign-in copy", () => {
  // -32000 is the catch-all fallback code for unclassified agent errors
  // (agent_error_from_json unwrap_or(-32000)); only the spec-reserved
  // "Authentication required" text may route to the sign-in message.
  const status = formatModelDiscoveryErrorStatus(
    new Error(
      "buzz-acp models failed (exit 1): Agent reported error (code -32000): model catalog fetch timed out",
    ),
    "anthropic",
    "Cursor",
  );

  assert.equal(status?.tone, "warning");
  assert.doesNotMatch(status?.message ?? "", /sign-in/i);
  assert.match(status?.message ?? "", /Using built-in model options/);
});

/**
 * Lingui ids are content hashes, not the source string.
 *
 * `@lingui/message-utils` is a dependency of `@lingui/core` rather than a
 * direct one, so it is resolved through core. Verified against the real
 * catalogue: `generateMessageId(message, "")` reproduces all 2812 ids in
 * `src/locales/de/messages.po` exactly, which is what makes the hand-built
 * catalogue below land on the same ids the macro emits.
 *
 * Without this, a catalogue keyed by the English text activates nothing, every
 * lookup falls back to the inlined source message, and a test meant to prove
 * locale-independence passes no matter what the code does. That is exactly how
 * the first version of these tests passed three of four deliberate breaks.
 */
const { generateMessageId } = createRequire(
  import.meta.resolve("@lingui/core"),
)("@lingui/message-utils/generateMessageId");

/** The three ids the old copy-matching code resolved through the catalogue. */
const MATCHED_SOURCES = [
  "Databricks sign-in is required",
  "Databricks sign-in failed",
  "Databricks sign-in timed out",
];

/**
 * Run `body` with a catalogue that translates exactly those three ids.
 *
 * Hand-built rather than loaded from the real `.po`: the point is only to
 * prove the matcher does not resolve its needles through the catalogue, and
 * `test-loader.mjs` documents why pulling real translations into unit tests
 * would make a catalogue edit able to break an unrelated assertion.
 */
function withTranslatedAuthStrings(body) {
  const messages = {};
  for (const source of MATCHED_SOURCES) {
    messages[generateMessageId(source, "")] = `ÜBERSETZT:${source}`;
  }
  i18n.loadAndActivate({ locale: "xx", messages });
  try {
    body();
  } finally {
    // Restore what test-loader.mjs set up for every other test in the process.
    i18n.loadAndActivate({ locale: "en", messages: {} });
  }
}

test("the fake catalogue really is active (guards the test below)", () => {
  withTranslatedAuthStrings(() => {
    assert.equal(
      i18n._(generateMessageId("Databricks sign-in is required", "")),
      "ÜBERSETZT:Databricks sign-in is required",
      "if this fails the ids no longer match the macro and the locale test proves nothing",
    );
  });
});

/**
 * The three cases above this one assert the same classification in English.
 * This one is the regression: the needles used to be `t` macros, so they
 * resolved through the catalogue and matched the backend's English only while
 * the app was in English. Outside it, every Databricks sign-in outcome fell
 * through to the generic "Using built-in model options" notice.
 */
test("Databricks sign-in outcomes are classified under any locale", () => {
  withTranslatedAuthStrings(() => {
    const required = formatModelDiscoveryErrorStatus(
      new Error(
        "Databricks sign-in is required; save this agent, then open its model picker to sign in, or run `buzz-agent auth databricks`",
      ),
      "databricks_v2",
    );
    assert.equal(
      required.tone,
      "muted",
      "sign-in required is a quiet note, not a warning",
    );
    assert.doesNotMatch(required.message, /Using built-in model options/);

    for (const message of [
      "Databricks sign-in timed out; open the model picker to retry, or run `buzz-agent auth databricks`",
      "Databricks sign-in failed: oauth callback: access_denied",
    ]) {
      const status = formatModelDiscoveryErrorStatus(
        new Error(message),
        "databricks_v2",
      );
      assert.equal(status.tone, "warning", message);
      assert.doesNotMatch(
        status.message,
        /Using built-in model options/,
        `a failed sign-in must not fall through to the generic message: ${message}`,
      );
    }
  });
});

test("the provider fallback label is translatable", () => {
  const status = formatModelDiscoveryErrorStatus(
    new Error("Databricks model discovery failed: relay offline"),
    "   ",
  );

  // Empty provider → "this provider", which was a bare literal and is now in
  // the catalogue. Asserted through the sentence it is interpolated into.
  assert.match(status.message, /this provider/);
});
