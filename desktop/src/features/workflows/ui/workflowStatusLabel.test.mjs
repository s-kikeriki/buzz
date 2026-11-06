import { setupI18n } from "@lingui/core";
import assert from "node:assert/strict";
import test from "node:test";

import {
  WORKFLOW_RUN_STEP_STATUSES,
  workflowStatusLabel,
} from "./workflowStatusLabel.ts";

const MISSING = "went-through-the-catalogue:";

/**
 * An i18n with no catalogue and a `missing` handler, so a lookup is
 * observable.
 *
 * Asserting the rendered words would prove nothing: under English
 * `status.replace(/_/g, " ")` returns exactly the source message for every
 * status in the list, which is why the run trace could carry an untranslated
 * copy of this function indefinitely. What separates the two is whether the
 * status reaches the catalogue at all.
 */
function observable() {
  const i18n = setupI18n({ missing: (_locale, id) => `${MISSING}${id}` });
  i18n.loadAndActivate({ locale: "de", messages: {} });
  return i18n;
}

test("takes every known status through the catalogue", () => {
  const i18n = observable();
  for (const status of WORKFLOW_RUN_STEP_STATUSES) {
    const label = workflowStatusLabel(status, i18n);
    assert.ok(
      label.startsWith(MISSING),
      `${status} was not looked up: ${label}`,
    );
  }
});

test("falls back to the stripped token for a status it does not know", () => {
  // A newer relay can send a status this build has never seen. It reads as
  // words rather than as nothing, and it never reaches the catalogue.
  const i18n = observable();
  assert.equal(
    workflowStatusLabel("partially_applied", i18n),
    "partially applied",
  );
  assert.equal(workflowStatusLabel("", i18n), "");
});
