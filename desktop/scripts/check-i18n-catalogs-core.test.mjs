import assert from "node:assert/strict";
import test from "node:test";

import {
  REGISTERS,
  catalogEntries,
  registerViolations,
} from "./check-i18n-catalogs-core.mjs";

/** A minimal `de` catalogue: header, then one entry per `[id, translation]`. */
function catalogue(entries) {
  const header = ['msgid ""', 'msgstr ""', '"Language: de\\n"', ""].join("\n");
  const blocks = entries.map(([id, translation]) =>
    [`msgid "${id}"`, `msgstr ${translation}`].join("\n"),
  );
  return [header, ...blocks].join("\n\n");
}

const ids = (violations) => violations.map((violation) => violation.id);

test("German is declared formal, so the informal pronouns are the forbidden set", () => {
  const register = REGISTERS.get("de");
  assert.equal(register.name, "formal (Sie)");
  assert.ok(register.forbid.includes("du"));
  assert.ok(!register.forbid.includes("sie"));
});

test("flags an informal pronoun", () => {
  const result = registerViolations(
    "de",
    catalogue([["Actions", '"Deine Aktionen"']]),
  );
  assert.deepEqual(ids(result), ["Actions"]);
  assert.deepEqual(result[0].found, ["Deine"]);
});

test("flags a pronoun on a wrapped continuation line", () => {
  // This is the shape that actually drifted: both real offenders were long
  // enough for the PO writer to wrap them, with the pronoun past line one.
  const result = registerViolations(
    "de",
    catalogue([
      [
        "All available keyboard shortcuts.",
        ['""', '"Alle verfügbaren Tastaturkürzel. "', '"Lass dir Zeit."'].join(
          "\n",
        ),
      ],
    ]),
  );
  assert.deepEqual(ids(result), ["All available keyboard shortcuts."]);
});

test("looks inside an ICU plural body", () => {
  // The brace-stripping must not swallow a plural's arms: they hold real
  // translated sentences, and exempting them would exempt every plural
  // message in the catalogue from this rule.
  const result = registerViolations(
    "de",
    catalogue([
      [
        "{0, plural, one {# member} other {# members}}",
        '"{0, plural, one {dein # Mitglied} other {deine # Mitglieder}}"',
      ],
    ]),
  );
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].found.sort(), ["dein", "deine"]);
});

test("a placeholder merely named `dir` is not prose", () => {
  const result = registerViolations(
    "de",
    catalogue([["Actions in {dir}", '"Aktionen in {dir}"']]),
  );
  assert.deepEqual(result, []);
});

test("a Lingui tag marker sits next to prose without joining it", () => {
  const result = registerViolations(
    "de",
    catalogue([["<0>{0}</0>", '"<0>Aktionen</0> <1>„{query}“</1>"']]),
  );
  assert.deepEqual(result, []);
});

test("a word that merely contains a forbidden pronoun is left alone", () => {
  // Both boundaries matter and both are exercised here. "Duplikate" and
  // "direkt" need the lookahead; "Urdu" and "Hindu" need the lookbehind, and
  // a language picker is exactly where those two show up.
  const result = registerViolations(
    "de",
    catalogue([
      ["Reduce duplicates", '"Duplikate reduzieren"'],
      ["Directory", '"Verzeichnis direkt öffnen"'],
      ["Urdu", '"Urdu"'],
      ["Hindi and Hindu", '"Hindi und Hindu"'],
    ]),
  );
  assert.deepEqual(result, []);
});

test("the formal register itself passes", () => {
  const result = registerViolations(
    "de",
    catalogue([
      [
        "All open channels are available in the sidebar.",
        '"Alle offenen Kanäle finden Sie in der Seitenleiste."',
      ],
      ["Cancel", '"Abbrechen"'],
    ]),
  );
  assert.deepEqual(result, []);
});

test("KNOWN LIMIT: a bare informal imperative with no pronoun passes", () => {
  // Asserted so that closing this hole has to be a deliberate edit to this
  // test rather than a silent change in coverage. Catching it needs real
  // morphology and would fire on legitimate formal infinitives.
  const result = registerViolations(
    "de",
    catalogue([["Copy link", '"Kopiere den Link"']]),
  );
  assert.deepEqual(result, []);
});

test("a locale with no declared register is not checked", () => {
  const result = registerViolations(
    "fr",
    catalogue([["Actions", '"Tes actions, du moins"']]),
  );
  assert.deepEqual(result, []);
});

test("catalogEntries joins continuations and skips the header", () => {
  const entries = catalogEntries(
    catalogue([["Close", ['""', '"Schl"', '"ießen"'].join("\n")]]),
  );
  assert.deepEqual(entries, [{ id: "Close", translation: "Schließen" }]);
});
