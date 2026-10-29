import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkFileForHardcodedLocales } from "./check-intl-locale-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const sourceRoot = path.join(projectRoot, "src");

/**
 * Unlike the i18n coverage gate, this one scans **everything** rather than a
 * ratchet of converted files.
 *
 * It can, because the fix is mechanical and the whole tree is already clean:
 * there is exactly one correct way to build a formatter here, so a new
 * hardcoded tag is always a mistake rather than a screen that has not had its
 * turn yet. A ratchet would let the next `new Intl.DateTimeFormat("en-US")`
 * land in any unlisted file.
 */
const SOURCE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const SKIP_FILE = /\.d\.m?ts$/;

/**
 * Test files may pin a locale tag.
 *
 * A test that asserts German output has to name German, and
 * `intlLocale.test.mjs` compares the drop-ins against the very methods they
 * replace. The *missing*-locale rule still applies to tests, and deliberately:
 * `toLocaleDateString(undefined, …)` on both sides of an assertion passes on
 * every machine and proves nothing, which is how three assertions in this
 * codebase were green while asserting only what this Mac does.
 */
const TEST_FILE = /\.(?:test|jsdom-test|spec)\.[cm]?[jt]sx?$/;

/**
 * `path:line` exceptions. Every entry needs a reason.
 */
const OVERRIDES = new Map([
  [
    "src/shared/ui/calendar.tsx:206",
    "Not copy — a `data-day` identifier that other code and tests select on. " +
      "Localising it would make the selector depend on the interface language.",
  ],
]);

async function* walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "locales") continue;
      yield* walk(absolute);
      continue;
    }
    if (SOURCE_FILE.test(entry.name) && !SKIP_FILE.test(entry.name)) {
      yield absolute;
    }
  }
}

async function main() {
  const violations = [];
  const matchedOverrides = new Set();
  let scanned = 0;

  for await (const absolutePath of walk(sourceRoot)) {
    scanned += 1;
    const relativePath = path.relative(projectRoot, absolutePath);
    const source = await readFile(absolutePath, "utf8");
    // Cheap reject before parsing: most files mention neither.
    if (!source.includes("Intl.") && !source.includes(".toLocale")) continue;

    const isTest = TEST_FILE.test(path.basename(absolutePath));
    const findings = await checkFileForHardcodedLocales(absolutePath, source);
    for (const finding of findings) {
      if (
        isTest &&
        finding.text !== "(no locale)" &&
        finding.text !== "undefined"
      ) {
        continue;
      }
      const key = `${relativePath}:${finding.line}`;
      if (OVERRIDES.has(key)) {
        matchedOverrides.add(key);
        continue;
      }
      violations.push({ file: relativePath, ...finding });
    }
  }

  // A stale override is a hole: it silences a line that has moved on, and the
  // next hardcoded locale on that line inherits the exemption.
  const stale = [...OVERRIDES.keys()].filter(
    (key) => !matchedOverrides.has(key),
  );

  if (violations.length === 0 && stale.length === 0) {
    console.log(
      `intl locale: ${scanned} file(s) scanned, ${OVERRIDES.size} documented exception(s).`,
    );
    return;
  }

  if (violations.length > 0) {
    console.error("Formatting that does not follow the app locale:\n");
    for (const violation of violations) {
      console.error(
        `  ${violation.file}:${violation.line}  [${violation.kind}]  ${JSON.stringify(violation.text)}`,
      );
    }
    console.error(
      [
        "",
        "A hardcoded tag cannot follow a preference the user changes, and an",
        "omitted locale means the operating system's language, not the app's.",
        "",
        "Use @/shared/lib/intlLocale, passing the locale from useLocale():",
        "",
        '  new Intl.DateTimeFormat("en-US", options)',
        "    ->  localeDateTimeFormat(locale, options)",
        "",
        "  date.toLocaleDateString()      ->  localeDate(date, locale)",
        "  date.toLocaleString()          ->  localeDateTime(date, locale)",
        "  date.toLocaleTimeString()      ->  localeTime(date, locale)",
        "",
        "For a relative label, use formatRelativeTime from",
        "@/shared/lib/relativeTime rather than building one.",
        "",
        "If a call genuinely must pin a locale, add a `path:line` entry to",
        "OVERRIDES in desktop/scripts/check-intl-locale.mjs with a reason.",
      ].join("\n"),
    );
  }

  if (stale.length > 0) {
    console.error(`\n${stale.length} stale override(s) — remove or update:\n`);
    for (const key of stale) console.error(`  ${key}`);
  }

  process.exitCode = 1;
}

await main();
