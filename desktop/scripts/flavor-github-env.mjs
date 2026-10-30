#!/usr/bin/env node
/**
 * Append a flavor's build environment to GitHub Actions' `$GITHUB_ENV`.
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
 * Every value is written in heredoc form. The single-line form `KEY=value`
 * silently truncates at the first newline, and the logo variables carry
 * base64 data URLs that are a few kilobytes long — today they contain no
 * newline, which is exactly the kind of thing that stops being true quietly.
 */

import { appendFileSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { flavorBuildEnv, listFlavorIds, loadFlavor } from "./flavor-config.mjs";

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
// A random delimiter per run, not a fixed `EOF`. A value containing the
// delimiter on a line of its own would otherwise end the block early and let
// the rest of it be parsed as further variables — the documented injection
// against `$GITHUB_ENV`, and these values come from a file in the repo.
const lines = Object.keys(env)
  .sort()
  .map((key) => {
    const delimiter = `__buzz_flavor_${randomUUID()}`;
    return `${key}<<${delimiter}\n${env[key]}\n${delimiter}\n`;
  })
  .join("");
appendFileSync(githubEnv, lines);

// Names only. The values include the baked relay URL and the brand assets,
// which are not secret, but a build log that lists them invites the habit of
// printing whatever a later variable happens to hold.
console.log(
  `flavor ${flavorId}: ${Object.keys(env).length} build variables -> ` +
    `GITHUB_ENV (${Object.keys(env).sort().join(", ")})`,
);
