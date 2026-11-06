import { execFile } from "node:child_process";
import { readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { REGISTERS, registerViolations } from "./check-i18n-catalogs-core.mjs";

const run = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const localesDir = path.join(projectRoot, "src", "locales");

/**
 * Catalogues must be committed in sync with the source.
 *
 * This is not bookkeeping. When a `<Trans>` has no catalogue entry, Lingui
 * falls back to the message **id** — and because production builds strip the
 * `message` property, that id is the compiled hash. The UI renders literally
 * `2fQh92` where the label should be. It looks like data corruption, it
 * survives review (the source still reads `msg\`Spacious\``), and no type
 * checker or lint rule sees it.
 *
 * Three things are enforced:
 *   1. `lingui extract` produces no change — every string in the source has a
 *      catalogue entry, and no stale entry survives a deletion.
 *   2. The source locale has no empty `msgstr` — an entry that exists but is
 *      blank fails back to the hash in exactly the same way.
 *   3. **Every target locale is complete.** German used to be exempt on the
 *      grounds that `fallbackLocales` degrades an untranslated string to
 *      readable English. It does — and that is exactly the reported bug: with
 *      the app set to German, a lot of the UI still showed English, and
 *      nothing failed. An empty `msgstr` is now a build failure, so a tranche
 *      that extracts a string without translating it cannot land. The
 *      fallback stays as the runtime safety net it was meant to be.
 *
 *   4. **Every message survives compilation.** A message whose ICU syntax is
 *      invalid is dropped from *every* compiled catalogue — `en`, `de` and
 *      `pseudo` alike — and Lingui only logs it. Rules 1–3 all pass, so does
 *      `tsc`, so does the build: the string simply renders its English source
 *      in a German app. That is what happened to the channel-templates hint in
 *      #35, where `Use {channel.name} and {template.name} as placeholders.`
 *      put a dot inside ICU braces; it went unnoticed until a bundle was read
 *      by hand. `lingui compile --strict` turns that log line into a failure.
 *
 * `pseudo` is exempt from rule 3. Its `msgstr` entries are committed **empty**
 * on purpose:
 * Lingui generates the accented-and-padded text at compile time from the
 * source string, so a filled catalogue there would be a stale copy of `en`.
 * Checking it is what a first version of this rule did, and it reported all
 * 323 messages as untranslated in a tree where nothing was wrong.
 */
const GENERATED_LOCALES = new Set(["pseudo"]);

async function readCatalogs() {
  const locales = await readdir(localesDir);
  const catalogs = new Map();
  for (const locale of locales.sort()) {
    const file = path.join(localesDir, locale, "messages.po");
    catalogs.set(locale, await readFile(file, "utf8"));
  }
  return catalogs;
}

/** Entries whose translation is blank, excluding the PO header (empty id). */
function emptyTranslations(po) {
  const empty = [];
  const entries = po.split(/\n\n+/);
  for (const entry of entries) {
    const idMatch = entry.match(/^msgid\s+"((?:[^"\\]|\\.)*)"/m);
    const strMatch = entry.match(/^msgstr\s+"((?:[^"\\]|\\.)*)"/m);
    if (!idMatch || !strMatch) continue;
    if (idMatch[1].length === 0) continue;
    if (strMatch[1].length === 0) empty.push(idMatch[1]);
  }
  return empty;
}

/**
 * Compile every catalogue with `--strict` and return the compiler's output if
 * it refused, else `null`.
 *
 * `lingui compile` writes `messages.js` next to each `messages.po`; the app
 * never reads those (the Vite plugin compiles in memory), so they are build
 * output and this removes them again. The `.gitignore` entry is the second
 * half of that: a hand-run `lingui compile` must not be committable either.
 */
async function compileStrictError(locales) {
  try {
    await run("pnpm", ["exec", "lingui", "compile", "--strict"], {
      cwd: projectRoot,
    });
    return null;
  } catch (error) {
    // Both streams, not the first non-empty one: the compiler writes its
    // progress line to stdout and the message it refused to stderr, so
    // preferring stdout reports "Done in 354ms" and hides the diagnosis.
    const output = [error.stdout, error.stderr].filter(Boolean).join("\n");
    return output || error.message;
  } finally {
    for (const locale of locales) {
      await rm(path.join(localesDir, locale, "messages.js"), { force: true });
    }
  }
}

async function main() {
  const before = await readCatalogs();

  try {
    await run("pnpm", ["exec", "lingui", "extract", "--clean"], {
      cwd: projectRoot,
    });
  } catch (error) {
    console.error("lingui extract failed:\n");
    console.error(error.stderr || error.stdout || error.message);
    process.exitCode = 1;
    return;
  }

  const after = await readCatalogs();
  const drifted = [];

  for (const [locale, contents] of after) {
    const previous = before.get(locale);
    if (previous === undefined) {
      drifted.push(`${locale} (new catalogue was not committed)`);
      continue;
    }
    // The header carries a creation timestamp that changes on every run; it
    // is not drift. Compare everything after it.
    const strip = (po) => po.replace(/^"POT-Creation-Date:.*\n/m, "");
    if (strip(previous) !== strip(contents)) drifted.push(locale);
  }

  const emptyByLocale = new Map();
  for (const [locale, contents] of after) {
    if (GENERATED_LOCALES.has(locale)) continue;
    const empty = emptyTranslations(contents);
    if (empty.length > 0) emptyByLocale.set(locale, empty);
  }

  const registerByLocale = new Map();
  for (const [locale, contents] of after) {
    if (GENERATED_LOCALES.has(locale)) continue;
    const mixed = registerViolations(locale, contents);
    if (mixed.length > 0) registerByLocale.set(locale, mixed);
  }

  const compileError = await compileStrictError(after.keys());

  if (
    drifted.length === 0 &&
    emptyByLocale.size === 0 &&
    registerByLocale.size === 0 &&
    compileError === null
  ) {
    const registers = [...REGISTERS]
      .filter(([locale]) => after.has(locale))
      .map(([locale, { name }]) => `${locale} ${name}`)
      .join(", ");
    console.log(
      `i18n catalogues: ${after.size} locale(s) in sync and complete${
        registers ? `; register ${registers}` : ""
      }.`,
    );
    return;
  }

  if (drifted.length > 0) {
    console.error(
      `Message catalogues are out of sync with the source: ${drifted.join(", ")}\n`,
    );
    console.error(
      [
        "A <Trans> or msg`` without a catalogue entry renders its compiled",
        "hash id (e.g. `2fQh92`) instead of the label, because production",
        "builds strip the fallback message.",
        "",
        "Run this and commit the result:",
        "",
        "  cd desktop && pnpm exec lingui extract --clean",
        "",
      ].join("\n"),
    );
  }

  for (const [locale, empty] of emptyByLocale) {
    console.error(`\n${locale} has ${empty.length} untranslated message(s):\n`);
    for (const id of empty.slice(0, 30)) console.error(`  ${id}`);
    if (empty.length > 30) console.error(`  … and ${empty.length - 30} more`);
    console.error(
      locale === "en"
        ? "\nAn empty source translation falls back to the compiled hash id, the\nsame way a missing entry does."
        : `\nTranslate these in src/locales/${locale}/messages.po. A string that is\nextracted but not translated renders English under ${locale}, which is the\nexact failure this gate exists to catch.`,
    );
  }

  if (compileError !== null) {
    console.error("\nA message does not survive catalogue compilation:\n");
    console.error(compileError.trim());
    console.error(
      [
        "",
        "Lingui drops an invalid-ICU message from every compiled catalogue —",
        "en, de and pseudo alike — and otherwise only logs it, so the string",
        "renders its English source in a translated app while every other",
        "gate stays green.",
        "",
        "The usual cause is a literal brace in the message. ICU reads `{…}` as",
        "a placeholder, so `{channel.name}` is a syntax error, not text. Pass",
        "the token in as a placeholder instead of writing it inside the",
        "message:",
        "",
        '  const CHANNEL_NAME_TOKEN = "{channel.name}";',
        "  <Trans>Use {CHANNEL_NAME_TOKEN} as a placeholder.</Trans>",
        "",
      ].join("\n"),
    );
  }

  for (const [locale, mixed] of registerByLocale) {
    const { name, forbid } = REGISTERS.get(locale);
    console.error(
      `\n${locale} is translated ${name}, but ${mixed.length} message(s) address the reader the other way:\n`,
    );
    for (const { id, found } of mixed.slice(0, 30)) {
      console.error(`  ${found.join(", ")}  —  ${id}`);
    }
    if (mixed.length > 30) {
      console.error(`  … and ${mixed.length - 30} more`);
    }
    console.error(
      [
        "",
        `Rewrite the translation in src/locales/${locale}/messages.po, including`,
        "the verb — switching the pronoun alone leaves the agreement wrong",
        '("damit du … vergleichen können").',
        "",
        `Forbidden here: ${forbid.join(", ")}. If a string genuinely quotes`,
        "the other register, add it to REGISTER_OVERRIDES with a reason. To move",
        "the whole app to the other register, swap the arrays in REGISTERS and",
        "set `matchCase` for the direction being forbidden — see the comment",
        "there, the two directions are not symmetric.",
        "",
      ].join("\n"),
    );
  }

  process.exitCode = 1;
}

await main();
