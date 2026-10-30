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

test("German is declared informal, so the formal pronouns are the forbidden set", () => {
  const register = REGISTERS.get("de");
  assert.equal(register.name, "informal (du)");
  assert.ok(register.forbid.includes("Sie"));
  assert.ok(!register.forbid.includes("du"));
  // Not a style preference: matching the formal set without case turns
  // ordinary third-person prose into a violation. See the test below.
  assert.equal(register.matchCase, true);
});

test("flags a formal pronoun", () => {
  const result = registerViolations(
    "de",
    catalogue([["Actions", '"Ihre Aktionen"']]),
  );
  assert.deepEqual(ids(result), ["Actions"]);
  assert.deepEqual(result[0].found, ["Ihre"]);
});

test("the lowercase pronouns are ordinary informal German, not the formal ones", () => {
  // The load-bearing case for `matchCase`. Lowercase *sie* is "she/they",
  // *ihr* "her/their", *ihnen* "to them" — all correct in a `du` interface.
  // A case-insensitive formal rule flags all three. None of these shapes is
  // in today's catalogue, which is why the rule has to be tested rather than
  // measured: the cost arrives with the tranches still to be translated.
  const result = registerViolations(
    "de",
    catalogue([
      [
        "Members appear here",
        '"Mitglieder erscheinen hier, sobald sie da sind"',
      ],
      ["Their channels", '"ihre Kanäle"'],
      ["Reply to them", '"Antworte ihnen direkt"'],
    ]),
  );
  assert.deepEqual(result, []);
});

test("flags a pronoun on a wrapped continuation line", () => {
  // This is the shape that actually drifted: both real offenders were long
  // enough for the PO writer to wrap them, with the pronoun past line one.
  const result = registerViolations(
    "de",
    catalogue([
      [
        "All available keyboard shortcuts.",
        [
          '""',
          '"Alle verfügbaren Tastaturkürzel. "',
          '"Nehmen Sie sich Zeit."',
        ].join("\n"),
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
        '"{0, plural, one {Ihr # Mitglied} other {Ihre # Mitglieder}}"',
      ],
    ]),
  );
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].found.sort(), ["Ihr", "Ihre"]);
});

test("a simple placeholder is stripped before matching, an ICU plural is not", () => {
  // `{Sie}` is a synthetic name: the forbidden tokens are all capitalized
  // under this register and this codebase's placeholders are lowercase, so no
  // real name collides today. The formal direction has the realistic case
  // (`{dir}`) and is covered below; this asserts the strip itself.
  const result = registerViolations(
    "de",
    catalogue([["Actions in {Sie}", '"Aktionen in {Sie}"']]),
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

test("a word that merely starts with a forbidden pronoun is left alone", () => {
  // Only the lookahead is reachable in this direction: German capitalizes a
  // noun at its first letter, so a capitalized "Sie"/"Ihr" preceded by a
  // letter does not occur. The lookbehind is exercised by the formal-register
  // test below, which is the direction that needs it.
  const result = registerViolations(
    "de",
    catalogue([
      ["Seventh column", '"Siebte Spalte"'],
      ["Siemens", '"Siemens"'],
      ["Settlement", '"Siedlung"'],
    ]),
  );
  assert.deepEqual(result, []);
});

test("the other direction still works: forbidding the informal set", () => {
  // The register is a product decision and can be swapped back. The rule has
  // to keep working in both directions, so the direction the app does not
  // ship is tested with an explicit register rather than left for a future
  // swap to discover. Case-insensitive here, and that is the asymmetry:
  // "Dein"/"dein" are both informal, where lowercase "sie"/"ihr" are not
  // formal at all.
  const formal = {
    name: "formal (Sie)",
    forbid: ["du", "dich", "dir", "dein", "deine"],
  };
  const flagged = registerViolations(
    "de",
    catalogue([
      ["Actions", '"Deine Aktionen"'],
      ["Take your time", '"Lass dir Zeit."'],
    ]),
    formal,
  );
  assert.deepEqual(ids(flagged), ["Actions", "Take your time"]);

  // The lookbehind, on a real catalogue string: a language picker lists Urdu.
  // The lookahead too — "Duplikate" starts with the forbidden "du".
  const clean = registerViolations(
    "de",
    catalogue([
      ["Urdu", '"Urdu"'],
      ["Hindi and Hindu", '"Hindi und Hindu"'],
      ["Reduce duplicates", '"Duplikate reduzieren"'],
      ["Open directly", '"Direkt öffnen"'],
      ["Actions in {dir}", '"Aktionen in {dir}"'],
    ]),
    formal,
  );
  assert.deepEqual(clean, []);
});

test("the informal register itself passes", () => {
  const result = registerViolations(
    "de",
    catalogue([
      [
        "All open channels are available in the sidebar.",
        '"Alle offenen Kanäle findest du in der Seitenleiste."',
      ],
      ["Copy link", '"Kopiere den Link"'],
      ["Cancel", '"Abbrechen"'],
    ]),
  );
  assert.deepEqual(result, []);
});

test("KNOWN LIMIT: an informal pronoun with formal verb agreement passes", () => {
  // The rule reads pronouns, not agreement. A half-converted sentence keeps
  // the allowed pronoun and the wrong verb, and nothing here notices.
  // Asserted so that closing this hole has to be a deliberate edit to this
  // test rather than a silent change in coverage.
  const result = registerViolations(
    "de",
    catalogue([
      [
        "I added a longer message so you can compare line height.",
        '"… damit du Zeilenhöhe vergleichen können."',
      ],
    ]),
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
