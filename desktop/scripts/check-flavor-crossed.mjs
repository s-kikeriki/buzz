#!/usr/bin/env node
/**
 * Prove a flavor reached the build environment, from inside a child process.
 *
 * Usage: node scripts/check-flavor-crossed.mjs <flavor-id>
 *
 * Read in a *child* process, never by echoing the variables the setting step
 * just wrote. A value that was only ever set in the setting shell reads back
 * perfectly from that shell and is invisible to `pnpm` and `cargo` — which is
 * how a ki.keriki DMG once shipped with no brand mark, the stock accent and
 * `ws://localhost:3000` baked in, with its build log printing the right values
 * on the way past. Running as a separate `node` under the step's shell is that
 * child, and it inherits exactly what the runner assembled from `$GITHUB_ENV`.
 *
 * Both halves, because there are two now. {@link partitionFlavorEnv} sends the
 * short identity strings through `$GITHUB_ENV` and the oversized `VITE_` brand
 * assets through the dotenv Vite loads, so a check that only read `printenv`
 * would report a clean crossing for a build whose logo bytes went nowhere. The
 * split rule is imported from the writer rather than restated here: one of the
 * two drifting from the other is the failure this step exists to catch.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { flavorBuildEnv, listFlavorIds, loadFlavor } from "./flavor-config.mjs";
import {
  FLAVOR_DOTENV_RELATIVE,
  dotenvLine,
  flavorDotenvPath,
  partitionFlavorEnv,
} from "./flavor-github-env.mjs";

function main() {
  const flavorId = process.argv[2];
  if (!flavorId) {
    console.error(
      `Usage: check-flavor-crossed.mjs <flavor-id>\n` +
        `Available flavors: ${listFlavorIds().join(", ")}`,
    );
    process.exit(2);
  }

  const { github, dotenv } = partitionFlavorEnv(
    flavorBuildEnv(loadFlavor(flavorId)),
  );
  let wrong = 0;

  for (const [key, want] of Object.entries(github)) {
    if ((process.env[key] ?? "") !== want) {
      console.error(`::error::${key} did not cross into the build environment`);
      wrong += 1;
    }
  }

  const dotenvKeys = Object.keys(dotenv);
  if (dotenvKeys.length > 0) {
    let lines;
    try {
      lines = readFileSync(flavorDotenvPath(), "utf8").split("\n");
    } catch {
      console.error(
        `::error::${FLAVOR_DOTENV_RELATIVE} was not written — Vite would ` +
          `build the frontend with none of ${flavorId}'s brand assets`,
      );
      process.exit(1);
    }
    for (const [key, want] of Object.entries(dotenv)) {
      // The whole line, not `file.includes(value)`. A value present but spliced
      // into another key's line is not a value Vite will read, and the
      // substring test passes for it.
      if (!lines.includes(dotenvLine(key, want))) {
        console.error(
          `::error::${key} did not cross into ${FLAVOR_DOTENV_RELATIVE}`,
        );
        wrong += 1;
      }
    }
  }

  const total = Object.keys(github).length + dotenvKeys.length;
  console.log(
    `${total} flavor variables checked ` +
      `(${Object.keys(github).length} via the environment, ` +
      `${dotenvKeys.length} via ${FLAVOR_DOTENV_RELATIVE}), ${wrong} wrong`,
  );
  process.exit(wrong === 0 ? 0 : 1);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
