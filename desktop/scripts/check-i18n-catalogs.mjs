import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
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
 * `pseudo` is exempt. Its `msgstr` entries are committed **empty** on purpose:
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

  if (
    drifted.length === 0 &&
    emptyByLocale.size === 0 &&
    registerByLocale.size === 0
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
        '("damit Sie … vergleichen kannst").',
        "",
        `Forbidden here: ${forbid.join(", ")}. If a string genuinely quotes`,
        "informal speech, add it to REGISTER_OVERRIDES with a reason. To move",
        "the whole app to the other register, swap the arrays in REGISTERS.",
        "",
      ].join("\n"),
    );
  }

  process.exitCode = 1;
}

await main();
