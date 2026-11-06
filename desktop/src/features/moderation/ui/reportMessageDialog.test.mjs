/**
 * Unit tests for reportErrorMessage (item 8 — report-failure UX).
 *
 * Verifies that the relay's own error message is surfaced instead of the
 * generic "Failed to submit report" string. Also covers the status-prefix
 * stripping so raw HTTP status codes don't appear in the toast.
 *
 * `i18n` is the real Lingui instance, activated to `en` by `test-loader.mjs`,
 * so the English assertions below are the shipped copy. The last test is the
 * one that distinguishes the two kinds of string this function returns: the
 * app's own fallback is translated, the relay's message is not.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { i18n } from "@lingui/core";

import { reportErrorMessage } from "./ReportMessageDialog.tsx";

test("surfaces-relay-message: returns relay error text stripped of status prefix", () => {
  // A relay rejection arrives as "400: you cannot report your own message".
  assert.equal(
    reportErrorMessage(
      i18n,
      new Error("400: you cannot report your own message"),
    ),
    "you cannot report your own message",
  );
});

test("surfaces-relay-message-no-prefix: relay error without prefix returned verbatim", () => {
  assert.equal(
    reportErrorMessage(i18n, new Error("report is invalid: missing event id")),
    "report is invalid: missing event id",
  );
});

test("fallback-empty-stripped: empty message after stripping returns generic string", () => {
  // "400: " strips to "" → fallback.
  assert.equal(
    reportErrorMessage(i18n, new Error("400: ")),
    "Failed to submit report",
  );
});

test("fallback-non-error: non-Error input returns generic string", () => {
  assert.equal(reportErrorMessage(i18n, null), "Failed to submit report");
  assert.equal(reportErrorMessage(i18n, undefined), "Failed to submit report");
  assert.equal(
    reportErrorMessage(i18n, "bare string"),
    "Failed to submit report",
  );
});

test("fallback-empty-error-message: Error with empty message returns generic string", () => {
  assert.equal(
    reportErrorMessage(i18n, new Error("")),
    "Failed to submit report",
  );
});

test("translates-only-the-fallback: the app's string goes through i18n, the relay's does not", () => {
  // A stub instance rather than a catalogue: it makes the seam visible in both
  // directions. Resolving the fallback is what must change with the locale;
  // the relay's own message must reach the toast untouched, because it is a
  // server string this catalogue does not own.
  const stub = { _: () => "ÜBERSETZT" };
  assert.equal(reportErrorMessage(stub, null), "ÜBERSETZT");
  assert.equal(reportErrorMessage(stub, new Error("400: ")), "ÜBERSETZT");
  assert.equal(
    reportErrorMessage(stub, new Error("400: you cannot report your own")),
    "you cannot report your own",
  );
});

test("preserves-non-status-numeric-prefix: only 4xx/5xx prefixes strip, others survive verbatim", () => {
  // "1234: rule id" is not an HTTP status prefix — keep it intact.
  assert.equal(
    reportErrorMessage(i18n, new Error("1234: rule id")),
    "1234: rule id",
  );
  // "200: ok" is a numeric prefix but not a 4xx/5xx rejection — keep it intact.
  assert.equal(reportErrorMessage(i18n, new Error("200: ok")), "200: ok");
});
