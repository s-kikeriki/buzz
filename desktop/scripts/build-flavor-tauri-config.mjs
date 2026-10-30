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

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { listFlavorIds, loadFlavor } from "./flavor-config.mjs";

const desktopDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/**
 * The `hicolor` sizes a flavored Linux bundle installs, as entries of
 * `src-tauri/icons/`.
 *
 * The trunk's own `bundle.icon` has three PNGs, and the largest of them is
 * named `128x128@2x.png`. Tauri's Linux bundler reads a PNG's real dimensions
 * and then appends `@2` when the *filename* says `@2x`, so that file lands in
 * `usr/share/icons/hicolor/256x256@2/apps/` — not a directory in the icon
 * theme specification, and therefore ignored by every lookup that reads it.
 * The practical effect on Ethos's Debian box was a launcher with nothing
 * above 128px to scale from.
 *
 * So the `@2x` entry is dropped here and the same artwork is declared as
 * `256x256.png`, which lands in a directory that is read. `64x64.png` was
 * already in the repo and never bundled.
 *
 * This list replaces the trunk's array wholesale (RFC 7396 does not merge
 * arrays), which is the point: the trunk's `.deb` is left exactly as it was,
 * so a stock Buzz built from this repo installs the same five paths it always
 * did and keeps its own `Package: buzz`.
 */
const FLAVOR_BUNDLE_ICONS = [
  "icons/32x32.png",
  "icons/64x64.png",
  "icons/128x128.png",
  "icons/256x256.png",
  "icons/512x512.png",
  "icons/icon.icns",
  "icons/icon.ico",
];

/**
 * The subdirectory of the bundle's resources that the sidecars move into.
 *
 * Mirrored by `build_identity::sidecar_dirs` in `src-tauri`, which is the only
 * other place this name appears.
 */
const SIDECAR_RESOURCE_DIR = "sidecars";

/** The host target triple, the way `scripts/bundle-sidecars.sh` reads it. */
function hostTargetTriple() {
  const output = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
  const host = output
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("host: "));
  if (host === undefined) {
    throw new Error("`rustc -vV` printed no `host:` line");
  }
  return host.slice("host: ".length);
}

/**
 * Where the sidecars go in a flavored bundle, and why they cannot stay put.
 *
 * `externalBin` is the normal way to ship them and it is what the trunk uses:
 * the bundler copies each one in next to the executable, which on Linux means
 * `/usr/bin`. A real Buzz's package already owns `/usr/bin/buzz`,
 * `/usr/bin/buzz-acp`, `/usr/bin/buzz-agent`, `/usr/bin/buzz-dev-mcp`,
 * `/usr/bin/buzz-backend-kubernetes` and `/usr/bin/git-credential-nostr`, so
 * dpkg refuses to unpack a second package that claims any of them — which is
 * what Ethos hit installing ki.keriki next to stock Buzz on Debian 13.
 *
 * So a flavored bundle declares no `externalBin` at all and ships the same
 * files as *resources* under `sidecars/`, which lands them in
 * `/usr/lib/<bundle name>/sidecars/` — where Debian policy puts a package's
 * private executables, and a path no other package can collide with because
 * the bundle name is the flavor's. `fs::copy` carries the mode across, so they
 * arrive executable.
 *
 * They keep their plain names on purpose. Renaming them was the other way to
 * resolve the collision and it breaks something a name mapping cannot reach:
 * `build_augmented_path` puts the sidecar directory on a managed agent's
 * `PATH` so the agent's own `buzz …` calls resolve, and that lookup happens in
 * a child process which knows nothing about a prefix. Moving the directory
 * keeps every one of those call sites correct.
 *
 * The list is read out of `tauri.conf.json` rather than written here, so a
 * sixth sidecar added to the bundle cannot quietly keep its colliding path in
 * every flavored build.
 */
function sidecarResources(target) {
  const basePath = path.join(desktopDir, "src-tauri", "tauri.conf.json");
  const base = JSON.parse(readFileSync(basePath, "utf8"));
  const declared = base.bundle?.externalBin;
  if (!Array.isArray(declared) || declared.length === 0) {
    throw new Error(
      `${basePath} declares no bundle.externalBin — a flavored bundle would ` +
        `ship no sidecars at all, and the app spawns buzz-acp and buzz-agent ` +
        `from the directory this map builds`,
    );
  }
  const suffix = target.includes("windows") ? ".exe" : "";
  const resources = {};
  for (const entry of declared) {
    const name = path.posix.basename(entry);
    // The same filename `bundle-sidecars.sh` writes: Tauri's `externalBin`
    // contract is `<declared path>-<triple><exe suffix>`, and the triple is
    // part of the *source* name only — the destination is the plain one the
    // app looks for.
    resources[`${entry}-${target}${suffix}`] =
      `${SIDECAR_RESOURCE_DIR}/${name}${suffix}`;
  }
  return resources;
}

const argv = process.argv.slice(2);
let targetArg;
const positional = [];
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (arg === "--target") {
    targetArg = argv[index + 1];
    index += 1;
    if (targetArg === undefined) {
      console.error("--target needs a target triple");
      process.exit(2);
    }
  } else if (arg.startsWith("--target=")) {
    targetArg = arg.slice("--target=".length);
  } else if (arg.startsWith("-")) {
    console.error(`unknown option ${arg}`);
    process.exit(2);
  } else {
    positional.push(arg);
  }
}
const [flavorId, outputArg] = positional;
if (!flavorId) {
  console.error(
    `Usage: build-flavor-tauri-config.mjs <flavor-id> [output-path] ` +
      `[--target <triple>]\n` +
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
  // The executable's own filename, and with it every path a Linux bundler
  // derives from it: `/usr/bin/<name>`, the `Exec=` and `Icon=` lines, the
  // `StartupWMClass=` a window manager matches a window against, and each
  // `hicolor/<size>/apps/<name>.png`. Left alone, all of those say
  // `buzz-desktop` and dpkg refuses to install the package next to a real
  // Buzz that already owns them.
  mainBinaryName: flavor.mainBinaryName,
  // What actually decides which app this is: data directory, keyring, and on
  // every platform the thing an installer upgrades in place.
  identifier: flavor.identifier,
  plugins: {
    // Derived with the identifier from `demo.name`/`demo.buildId`, so a second
    // installed flavor cannot capture the first one's `buzz://` links.
    "deep-link": { desktop: { schemes: [flavor.deepLinkScheme] } },
  },
  bundle: {
    icon: FLAVOR_BUNDLE_ICONS,
    // Emptied, not omitted. RFC 7396 leaves a key this delta does not mention
    // at the base value, so an omitted `externalBin` would keep installing the
    // sidecars into `/usr/bin` under the names a real Buzz's package owns.
    externalBin: [],
    resources: sidecarResources(targetArg ?? hostTargetTriple()),
    // `Maintainer:` in the `.deb`. Tauri prefers the Cargo manifest's
    // `authors` over this, so the trunk's `authors` placeholder had to go for
    // this field to be reachable at all — see the commit that removed it.
    ...(flavor.publisher === undefined ? {} : { publisher: flavor.publisher }),
    // `Description:`'s synopsis line, and `Comment=` in the launcher entry.
    ...(flavor.shortDescription === undefined
      ? {}
      : { shortDescription: flavor.shortDescription }),
    ...(flavor.longDescription === undefined
      ? {}
      : { longDescription: flavor.longDescription }),
    // macOS `LSApplicationCategoryType`. Not where the launcher's
    // `Categories=` comes from: Tauri maps every category it knows to a single
    // freedesktop token, and for this one that token is `Network;` alone.
    // `Network;InstantMessaging;` is what a chat app belongs under, so the
    // desktop entry is templated below instead.
    category: "SocialNetworking",
    linux: {
      deb: {
        section: "net",
        desktopTemplate: "linux/app.desktop",
      },
    },
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
