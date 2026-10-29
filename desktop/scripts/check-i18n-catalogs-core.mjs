/**
 * The register rule, separated from the gate that runs it so it can be tested.
 *
 * `check-i18n-catalogs.mjs` shells out to `lingui extract` and reads the
 * locale directory, so it cannot be imported by a unit test without doing
 * both. Everything here is pure: a catalogue string in, violations out.
 */

/**
 * How each locale addresses the person using the app.
 *
 * German forces a choice English never makes: every sentence that addresses
 * the reader picks either the formal *Sie* or the informal *du*, and the verb
 * agrees with it. The choice itself is a product decision. Mixing the two in
 * one interface is not — it reads as two different products stitched
 * together, and that is what this branch shipped before this rule: two
 * appearance-settings strings said *du* while 257 new ones said *Sie*.
 *
 * `forbid` is the register we are **not** using. It is a closed set of
 * pronouns rather than an attempt to parse German: pronouns are what actually
 * drifted, and they are cheap to match without false positives. To switch the
 * whole app to *du*, swap the two arrays and retranslate — the gate then
 * holds the opposite line with no other change.
 *
 * Known limit: a bare informal imperative with no pronoun ("Klicke hier")
 * passes. Detecting that needs real morphology and would fire on legitimate
 * formal infinitives, so it is out of scope by choice, not by oversight.
 * `check-i18n-catalogs-core.test.mjs` asserts that limit, so a future version
 * that closes it has to update the test deliberately.
 */
export const REGISTERS = new Map([
  [
    "de",
    {
      name: "formal (Sie)",
      forbid: [
        "du",
        "dich",
        "dir",
        "dein",
        "deine",
        "deinem",
        "deinen",
        "deiner",
        "deines",
      ],
    },
  ],
]);

/**
 * `locale:msgid` entries allowed to use the other register, each with a
 * reason. Empty is the honest state — add one only when a string genuinely
 * quotes someone speaking informally.
 */
export const REGISTER_OVERRIDES = new Map([]);

function joinPoString(match) {
  if (!match) return null;
  return [...match[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)]
    .map((part) => part[1])
    .join("");
}

/**
 * `{ id, translation }` per entry, with PO continuation lines joined.
 *
 * `emptyTranslations` in the gate only needs the first line, because a blank
 * `msgstr` is blank on that line. The register rule needs the whole string:
 * the two sentences that drifted were both long enough to be wrapped, and
 * their pronoun sat on a continuation line.
 */
export function catalogEntries(po) {
  const entries = [];
  for (const block of po.split(/\n\n+/)) {
    const id = joinPoString(
      block.match(/^msgid((?:[ \t]*"(?:[^"\\]|\\.)*"\n?)+)/m),
    );
    if (id === null || id.length === 0) continue;
    const translation = joinPoString(
      block.match(/^msgstr((?:[ \t]*"(?:[^"\\]|\\.)*"\n?)+)/m),
    );
    if (translation === null) continue;
    entries.push({ id, translation });
  }
  return entries;
}

/** Entries written in the register this locale does not use. */
export function registerViolations(locale, po) {
  const register = REGISTERS.get(locale);
  if (register === undefined) return [];

  const pattern = new RegExp(
    `(?<!\\p{L})(${register.forbid.join("|")})(?!\\p{L})`,
    "giu",
  );

  const violations = [];
  for (const { id, translation } of catalogEntries(po)) {
    if (REGISTER_OVERRIDES.has(`${locale}:${id}`)) continue;
    // A placeholder name is not prose — a message interpolating `{dir}` must
    // not read as informal German. Only simple `{name}` placeholders are
    // stripped: an ICU plural's braces wrap real translated sentences
    // (`{n, plural, one {# Kanal} other {# Kanäle}}`), and dropping those
    // would exempt every plural message from this rule.
    //
    // Lingui's `<0>` tag markers need no stripping: `<` and `>` are not
    // letters, so the boundaries below already treat them as word breaks.
    // Stripping them was dead code — break-testing it changed no outcome.
    const prose = translation.replace(/\{\s*[A-Za-z_$][\w$]*\s*\}/g, " ");
    const found = [...new Set([...prose.matchAll(pattern)].map((m) => m[1]))];
    if (found.length > 0) violations.push({ id, found });
  }
  return violations;
}
