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
 * agrees with it. The choice itself is a product decision — kikeriki addresses
 * its clients as *du*, so that is what this app speaks. Mixing the two in one
 * interface is not a product decision — it reads as two different products
 * stitched together, and that is what this branch shipped before this rule.
 *
 * `forbid` is the register we are **not** using. It is a closed set of
 * pronouns rather than an attempt to parse German: pronouns are what actually
 * drifted, and they are cheap to match without false positives.
 *
 * `matchCase` is why switching register was not the "swap two arrays" this
 * comment first claimed. The informal pronouns are unambiguous in any casing,
 * so forbidding them could ignore case. The formal ones are only formal when
 * capitalized: lowercase *sie* is "she/they", *ihr* is "her/their", *ihnen*
 * "to them" — all ordinary words in correct *du* prose ("Mitglieder
 * erscheinen hier, sobald sie da sind"). Measured honestly, a
 * case-insensitive formal rule flags 0 of today's 377 entries, because they
 * are mostly short labels; the cost lands on the ~2,400 strings still to be
 * translated, where third-person prose is unavoidable. A gate that fires on
 * correct prose is a gate somebody deletes. So the direction we forbid
 * decides whether case matters, and the register declares it.
 *
 * This direction has the smaller blind spot of the two. German formal address
 * cannot drop its pronoun — "Klicken Sie hier" carries *Sie* and there is no
 * polite imperative without it — whereas the informal imperative can
 * ("Klicke hier"), which is what the old formal rule had to concede.
 *
 * Known limit: the rule reads pronouns, not agreement, so a half-converted
 * sentence whose pronoun is already *du* but whose verb still agrees formally
 * ("damit du … vergleichen können") passes. `check-i18n-catalogs-core.test.mjs`
 * asserts that limit, so a future version that closes it has to update the
 * test deliberately.
 */
export const REGISTERS = new Map([
  [
    "de",
    {
      name: "informal (du)",
      matchCase: true,
      forbid: [
        "Sie",
        "Ihnen",
        "Ihr",
        "Ihre",
        "Ihrem",
        "Ihren",
        "Ihrer",
        "Ihres",
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

/**
 * Entries written in the register this locale does not use.
 *
 * `register` defaults to the declared one and exists so the rule can be
 * tested in both directions rather than only in whichever one the app
 * currently ships. The two are not symmetric — see `matchCase` above — and a
 * rule only tested in today's direction breaks silently the day it is
 * swapped. The gate always passes two arguments.
 */
export function registerViolations(
  locale,
  po,
  register = REGISTERS.get(locale),
) {
  if (register === undefined) return [];

  const pattern = new RegExp(
    `(?<!\\p{L})(${register.forbid.join("|")})(?!\\p{L})`,
    register.matchCase === true ? "gu" : "giu",
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
