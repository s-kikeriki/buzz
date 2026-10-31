#!/usr/bin/env node
/**
 * Hand a flavor's build environment to the next GitHub Actions step.
 *
 * Usage: node scripts/flavor-github-env.mjs <flavor-id>
 *
 * `flavor-config.mjs` already emits `export KEY='value'` lines for a shell, and
 * on a developer's machine `eval "$(...)"` is the whole story. In Actions it is
 * not: every `run:` step is its own shell, so an `eval` in one step reaches
 * nothing in the next, and the build step would run with none of the flavor set
 * while the step that printed them looked perfect.
 *
 * That is the same failure that shipped the `20261028.0248` ki.keriki DMG —
 * variables that were set in the calling shell and never crossed into the
 * child — in the shape Actions makes available. `$GITHUB_ENV` is the crossing
 * that works here, so this writes that file rather than restating the export
 * list in YAML, where the next variable added to `flavorBuildEnv` would have to
 * be remembered by hand.
 *
 * Every `$GITHUB_ENV` value is written in heredoc form. The single-line form
 * `KEY=value` silently truncates at the first newline, and no value emitted
 * today contains one — which is exactly the kind of thing that stops being true
 * quietly.
 *
 * ## Why the logo bytes take the other door
 *
 * ki.keriki's four `VITE_BUZZ_PRODUCT_LOGO*` data URLs are 33.8 KB of the
 * flavor's 34.4 KB total. Everything `$GITHUB_ENV` receives is re-exported into
 * *every* later step of the job, which on a Windows runner means every `rustc`,
 * `link.exe` and `makensis` invocation carries 34 KB of base64 it has no reader
 * for.
 *
 * What is actually documented about Windows is a 32,767-character limit on a
 * single environment variable; the largest value here is 11,051, so that one is
 * not in play. The 32,767-character limit on the whole *block* is documented for
 * `CreateProcessA`, and the Actions runner is .NET and spawns through the
 * Unicode entry point, which has no such documented cap. So this is an
 * unmeasured risk rather than a known failure — and it stays unmeasured until a
 * real Windows runner says otherwise, because nothing on the build Mac can
 * answer it.
 *
 * The split is worth making regardless of how that lands, because for a
 * `VITE_`-prefixed value a dotenv file is not a workaround, it is the channel
 * Vite is built around: `vite build` runs in `desktop/` in `production` mode, so
 * it loads `desktop/.env.production.local` and exposes every `VITE_` key it
 * finds. `*.local` is already gitignored. Vite's own `loadEnv` gives a real
 * process variable precedence over the file, so the two doors cannot disagree.
 *
 * ## Why only `VITE_` values take it
 *
 * `build.rs`, `package-macos-dmg.sh` and the "did the flavor cross" check read
 * the *process* environment; none of them reads a dotenv. Routing an oversized
 * value to the file purely because it is large would therefore make the next
 * big `BUZZ_BUILD_*` variable vanish from the half of the build that is Rust,
 * with a passing check step either side of it. Oversized *and* `VITE_`-prefixed
 * is the whole rule, and a large non-`VITE_` value deliberately stays in
 * `$GITHUB_ENV` where its reader can see it.
 */

import { appendFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { flavorBuildEnv, listFlavorIds, loadFlavor } from "./flavor-config.mjs";

/**
 * Size at which a `VITE_` value stops travelling through `$GITHUB_ENV`.
 *
 * Far below any limit anyone has documented. The point is not to sit just under
 * a ceiling but to keep the block that every later step inherits down to the
 * handful of short identity strings that actually have readers there.
 */
export const GITHUB_ENV_VALUE_LIMIT = 1024;

/** Vite's production dotenv, relative to `desktop/`. */
export const FLAVOR_DOTENV_RELATIVE = ".env.production.local";

const desktopDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/**
 * Absolute path of the dotenv file this script owns.
 *
 * Resolved under `$GITHUB_WORKSPACE` when the runner has set one — which is the
 * same `desktop/` this file lives in, for every checkout Actions makes. Saying
 * so explicitly is what lets the tests point the write somewhere disposable:
 * the destination is a real file in a developer's working copy, and
 * `.env.production.local` is a name they may legitimately own, so a test that
 * wrote the repo's own copy would be overwriting their file to check ours.
 */
export function flavorDotenvPath(env = process.env) {
  const root = env.GITHUB_WORKSPACE
    ? path.join(env.GITHUB_WORKSPACE, "desktop")
    : desktopDir;
  return path.join(root, FLAVOR_DOTENV_RELATIVE);
}

/**
 * Split a flavor env into the half `$GITHUB_ENV` carries and the half Vite
 * loads from a file. Exported so the workflow's check step and the tests apply
 * the same rule as the writer rather than restating it.
 */
export function partitionFlavorEnv(env) {
  const github = {};
  const dotenv = {};
  for (const key of Object.keys(env).sort()) {
    const value = String(env[key]);
    const oversized =
      Buffer.byteLength(value, "utf8") >= GITHUB_ENV_VALUE_LIMIT;
    if (oversized && key.startsWith("VITE_")) {
      dotenv[key] = value;
    } else {
      github[key] = value;
    }
  }
  return { github, dotenv };
}

/**
 * Serialize a dotenv file Vite can parse.
 *
 * Double-quoted and escaped so a future value containing `#`, a space or an `=`
 * cannot change which keys Vite sees.
 */
export function formatDotenv(env) {
  const keys = Object.keys(env).sort();
  if (keys.length === 0) return "";
  return `${keys
    .map((key) => {
      const escaped = String(env[key])
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n");
      return `${key}="${escaped}"`;
    })
    .join("\n")}\n`;
}

/** The exact line {@link formatDotenv} writes for one key. */
export function dotenvLine(key, value) {
  return formatDotenv({ [key]: value }).trimEnd();
}

function main() {
  const flavorId = process.argv[2];
  if (!flavorId) {
    console.error(
      `Usage: flavor-github-env.mjs <flavor-id>\n` +
        `Available flavors: ${listFlavorIds().join(", ")}`,
    );
    process.exit(2);
  }

  const githubEnv = process.env.GITHUB_ENV;
  if (!githubEnv) {
    console.error(
      "GITHUB_ENV is not set — this script only does anything inside a GitHub " +
        'Actions step. Outside one, use `eval "$(flavor-config.mjs <id>)"`.',
    );
    process.exit(1);
  }

  const flavor = loadFlavor(flavorId);
  if (flavor.frozen) {
    console.error(`flavor ${flavorId}: frozen flavors are not built`);
    process.exit(1);
  }
  if (flavor.example) {
    console.error(`flavor ${flavorId}: the example flavor is not a real app`);
    process.exit(1);
  }

  const env = flavorBuildEnv(flavor, readFileSync);
  const { github, dotenv } = partitionFlavorEnv(env);

  // A random delimiter per run, not a fixed `EOF`. A value containing the
  // delimiter on a line of its own would otherwise end the block early and let
  // the rest of it be parsed as further variables — the documented injection
  // against `$GITHUB_ENV`, and these values come from a file in the repo.
  const lines = Object.keys(github)
    .sort()
    .map((key) => {
      const delimiter = `__buzz_flavor_${randomUUID()}`;
      return `${key}<<${delimiter}\n${github[key]}\n${delimiter}\n`;
    })
    .join("");
  appendFileSync(githubEnv, lines);

  // Written *or removed*, never left alone. A flavor with no logo emits no
  // oversized value, and a file left behind by an earlier run in the same
  // checkout would then hand Vite another organisation's mark with nothing in
  // the build log to say where it came from. Reconciling both ways is what
  // makes the file a function of the flavor rather than of the machine.
  const dotenvPath = flavorDotenvPath();
  if (Object.keys(dotenv).length > 0) {
    writeFileSync(dotenvPath, formatDotenv(dotenv));
  } else {
    rmSync(dotenvPath, { force: true });
  }

  // Names only. The values include the baked relay URL and the brand assets,
  // which are not secret, but a build log that lists them invites the habit of
  // printing whatever a later variable happens to hold.
  const dotenvNote =
    Object.keys(dotenv).length > 0
      ? `; ${Object.keys(dotenv).length} oversized -> ${FLAVOR_DOTENV_RELATIVE} ` +
        `(${Object.keys(dotenv).sort().join(", ")})`
      : `; none oversized, ${FLAVOR_DOTENV_RELATIVE} removed if present`;
  console.log(
    `flavor ${flavorId}: ${Object.keys(github).length} build variables -> ` +
      `GITHUB_ENV (${Object.keys(github).sort().join(", ")})${dotenvNote}`,
  );
}

// Only when executed as a script. The partition helpers are imported by the
// workflow's check step and by the tests, and those imports must not append to
// whatever `$GITHUB_ENV` happens to point at.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
