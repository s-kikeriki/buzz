import { i18n } from "@lingui/core";
import assert from "node:assert/strict";
import test from "node:test";

import {
  CRON_FIELD_DEFINITIONS,
  cronExpressionError,
  cronExpressionFromFields,
  cronFieldsFromPaste,
  validateCronField,
  validateCronFields,
} from "./cronExpression.ts";

test("accepts supported five-field cron syntax", () => {
  for (const expression of [
    "0 9 * * 1-5",
    "*/15 * * * *",
    "0 */2 1,15 JAN,MAR MON-FRI",
  ]) {
    const result = cronFieldsFromPaste(expression, i18n);
    assert.equal(result.ok, true);
    assert.deepEqual(validateCronFields(result.fields, i18n), [
      null,
      null,
      null,
      null,
      null,
    ]);
    assert.equal(cronExpressionFromFields(result.fields), expression);
    assert.equal(cronExpressionError(expression, i18n), null);
  }
});

test("validates cron field ranges and structure locally", () => {
  assert.equal(
    validateCronField("60", CRON_FIELD_DEFINITIONS[0], i18n),
    "Minute must be between 0 and 59.",
  );
  assert.equal(
    validateCronField("5-2", CRON_FIELD_DEFINITIONS[2], i18n),
    "Day range must go from lower to higher.",
  );
  assert.equal(
    validateCronField("*/0", CRON_FIELD_DEFINITIONS[1], i18n),
    "Hour step must be a positive whole number.",
  );
});

test("whole-expression validation requires exactly five fields", () => {
  assert.deepEqual(cronFieldsFromPaste("0 9 * *", i18n), {
    error: "Paste a 5-field cron expression. Found 4 fields.",
    ok: false,
  });
  assert.match(cronExpressionError("not-a-cron", i18n), /Found 1 field/);
});

test("field ids come from the stable key, not the translated label", () => {
  // The input's DOM id and React key are built from `key`. They were built
  // from `label.toLowerCase()`, so every id changed with the UI language.
  assert.deepEqual(
    CRON_FIELD_DEFINITIONS.map((definition) => definition.key),
    ["minute", "hour", "day", "month", "weekday"],
  );
  for (const definition of CRON_FIELD_DEFINITIONS) {
    assert.equal(typeof definition.key, "string");
    assert.equal(typeof definition.label, "object", "label is a descriptor");
  }
});
