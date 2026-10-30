#!/usr/bin/env node
/**
 * Write the Tauri config delta that gives a bundle a flavor's identity.
 *
 * Usage: node scripts/build-flavor-tauri-config.mjs <flavor-id> [output-path]
 *        (default output: src-tauri/tauri.flavor.conf.json)
 *
 * `flavorBuildEnv` covers everything a *compiler* bakes in. It does not cover
 * the three fields the *bundler* reads out of `tauri.conf.json` — the product
 * name, the bundle identifier, and the deep-link scheme — because those are
 * config, not environment. On macOS an out-of-repo shell script has always
 * supplied them. A Linux or Windows job has no such script, and without this
 * it would build a correctly branded binary inside a bundle called `Buzz` with
 * identifier `xyz.block.buzz.app`: one that installs over a real Buzz on a
 * user's machine, which is the exact defect `flavor-config.mjs` exists to make
 * impossible.
 *
 * Like `build-release-config.mjs`, this is a *delta*. Tauri merges `--config`
 * over the base file with RFC 7396, so a key present here replaces the base
 * value entirely and a key absent here leaves the base alone.
 *
 * ## What it deliberately does not set
 *
 * `bundle.targets`. `demoBuildConfig`'s own overlay pins it to `["app"]`,
 * which is right for the macOS script that packages its own DMG afterwards and
 * would silently produce no `.deb`, no AppImage and no installer here. The
 * bundle list belongs on the `tauri build --bundles` command line, where the
 * job that wants a `.deb` says so.
 *
 * `version`. A dispatch build takes it from the repo or from
 * `set-version-from-tag.mjs`, so that one input has one owner.
 */

import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { listFlavorIds, loadFlavor } from "./flavor-config.mjs";

const desktopDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const [flavorId, outputArg] = process.argv.slice(2);
if (!flavorId) {
  console.error(
    `Usage: build-flavor-tauri-config.mjs <flavor-id> [output-path]\n` +
      `Available flavors: ${listFlavorIds().join(", ")}`,
  );
  process.exit(2);
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

const config = {
  // The `.app` folder, the `.deb` package name, the NSIS product name.
  productName: flavor.displayName,
  // What actually decides which app this is: data directory, keyring, and on
  // every platform the thing an installer upgrades in place.
  identifier: flavor.identifier,
  plugins: {
    // Derived with the identifier from `demo.name`/`demo.buildId`, so a second
    // installed flavor cannot capture the first one's `buzz://` links.
    "deep-link": { desktop: { schemes: [flavor.deepLinkScheme] } },
  },
};

const outputPath = path.resolve(
  desktopDir,
  outputArg ?? path.join("src-tauri", "tauri.flavor.conf.json"),
);
writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`);
// Relative only when it really is inside `desktop/`; a `../../..` chain is
// harder to read than the absolute path it was derived from.
const shown = path.relative(desktopDir, outputPath);
console.log(
  `${shown.startsWith("..") ? outputPath : shown}: ${config.productName} ` +
    `(${config.identifier}, ${flavor.deepLinkScheme}://)`,
);
