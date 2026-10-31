#!/usr/bin/env node
/**
 * Read a flavor's brand back out of the frontend the Rust build actually
 * embedded.
 *
 * Usage: node scripts/check-frontend-brand.mjs <flavor-id> [--target <triple>]
 *
 * ## Why this exists, and why it reads these files
 *
 * The `.deb` can be unpacked, so the Linux job reads its icons and its launcher
 * entry back out of the package. An NSIS installer is a self-extracting
 * executable, so Windows had no artifact read-back at all: the strongest thing
 * the job could say was "the bundler read the right icon file", which is a
 * claim about an input. A build whose log printed every right value and whose
 * `.app` still wore the Buzz bee is the reason that distinction is written down
 * here rather than assumed.
 *
 * There is a read-back available on every platform, and it is the frontend.
 * `tauri-codegen` brotli-compresses each asset into
 * `target/[<triple>/]release/build/buzz-desktop-*​/out/tauri-codegen-assets/`
 * and `include_bytes!`s it into the binary, and unlike `dist/` — which
 * `tauri-command.mjs` builds into a temp directory and deletes — those files
 * survive the build. Decompressing them and looking for the flavor's own
 * strings proves the brand reached the bundle that shipped, not the config that
 * was meant to produce it.
 *
 * ## Which strings, and which are useless
 *
 * The product name and the logo data URLs. Both are long enough and specific
 * enough that finding them means something: `ki.keriki` is absent from a stock
 * build, and a logo is 11 KB of base64 that exists nowhere else.
 *
 * The accent colour is deliberately *not* a needle. Measured on a real build
 * tree: `#3b82f6` — Zeniad's accent — appears eight times in a ki.keriki
 * frontend, because it is also Tailwind's `blue-500`. A needle that a wrong
 * build also matches is worse than no needle, so the set here is the one that
 * was checked in both directions.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { brotliDecompressSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { flavorBuildEnv, listFlavorIds, loadFlavor } from "./flavor-config.mjs";

const desktopDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** Enough base64 that no other asset could hold the same run by accident. */
const LOGO_NEEDLE_LENGTH = 256;

const LOGO_KEYS = [
  "VITE_BUZZ_PRODUCT_LOGO",
  "VITE_BUZZ_PRODUCT_LOGO_LIGHT",
  "VITE_BUZZ_PRODUCT_LOGO_MARK",
  "VITE_BUZZ_PRODUCT_LOGO_MARK_LIGHT",
];

/**
 * The first index at which `value` differs from every one of `others`.
 *
 * Anchoring the needle here, rather than at the middle of the value, is what
 * makes four logos four separate claims. ki.keriki's mark and its light cut are
 * the same drawing with two colours swapped: same length, so base64 realigns
 * after each substitution and the two data URLs are byte-identical everywhere
 * except a few short runs. A needle cut from the middle landed in one of the
 * identical stretches, so the dark mark satisfied the light mark's check and a
 * build that shipped one of them would have passed for both.
 *
 * `-1` when no such index exists, which means the two values are the same asset
 * and no needle can tell them apart.
 */
function firstDistinguishingIndex(value, others) {
  for (let index = 0; index < value.length; index += 1) {
    if (others.every((other) => other[index] !== value[index])) return index;
  }
  return -1;
}

/**
 * The strings a correctly flavored frontend must contain, keyed by the variable
 * each one comes from.
 *
 * A logo contributes a slice rather than the whole value so the comparison stays
 * cheap, and the slice is positioned so that it cannot be satisfied by another
 * of this flavor's logos.
 */
export function brandNeedles(flavor) {
  const env = flavorBuildEnv(flavor);
  const needles = {};
  if (env.VITE_BUZZ_PRODUCT_NAME) {
    needles.VITE_BUZZ_PRODUCT_NAME = env.VITE_BUZZ_PRODUCT_NAME;
  }
  const logos = LOGO_KEYS.filter(
    (key) =>
      typeof env[key] === "string" && env[key].length >= LOGO_NEEDLE_LENGTH * 2,
  );
  for (const key of logos) {
    const value = env[key];
    const others = logos.filter((other) => other !== key).map((k) => env[k]);
    const anchor =
      others.length === 0 ? -1 : firstDistinguishingIndex(value, others);
    const centre = anchor === -1 ? Math.floor(value.length / 2) : anchor;
    const start = Math.min(
      Math.max(centre - Math.floor(LOGO_NEEDLE_LENGTH / 2), 0),
      value.length - LOGO_NEEDLE_LENGTH,
    );
    needles[key] = value.slice(start, start + LOGO_NEEDLE_LENGTH);
  }
  return needles;
}

/** Every `tauri-codegen-assets` directory under a Cargo target directory. */
export function codegenAssetDirs(targetDir) {
  const buildDir = path.join(targetDir, "release", "build");
  let entries;
  try {
    entries = readdirSync(buildDir);
  } catch {
    return [];
  }
  const found = [];
  for (const entry of entries) {
    if (!entry.startsWith("buzz-desktop-")) continue;
    const candidate = path.join(buildDir, entry, "out", "tauri-codegen-assets");
    try {
      if (statSync(candidate).isDirectory()) found.push(candidate);
    } catch {
      // Cargo keeps a second `buzz-desktop-*` directory for the build script
      // itself, which has no `out/`. Not having one is the normal case.
    }
  }
  return found.sort();
}

/**
 * Count, per needle, how many embedded assets contain it.
 *
 * Decoded as latin1 rather than utf8 so a blob that is not text cannot throw or
 * silently lose bytes; every needle here is ASCII, so the comparison is exact.
 */
export function scanAssets(dirs, needles) {
  const counts = Object.fromEntries(Object.keys(needles).map((k) => [k, 0]));
  let scanned = 0;
  let unreadable = 0;
  for (const dir of dirs) {
    for (const entry of readdirSync(dir)) {
      let text;
      try {
        text = brotliDecompressSync(readFileSync(path.join(dir, entry)));
      } catch {
        unreadable += 1;
        continue;
      }
      scanned += 1;
      const haystack = text.toString("latin1");
      for (const [key, needle] of Object.entries(needles)) {
        if (haystack.includes(needle)) counts[key] += 1;
      }
    }
  }
  return { counts, scanned, unreadable };
}

function main() {
  const argv = process.argv.slice(2);
  let target;
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--target") {
      target = argv[index + 1];
      index += 1;
      if (target === undefined) {
        console.error("--target needs a target triple");
        process.exit(2);
      }
    } else if (arg.startsWith("--target=")) {
      target = arg.slice("--target=".length);
    } else if (arg.startsWith("-")) {
      console.error(`unknown option ${arg}`);
      process.exit(2);
    } else {
      positional.push(arg);
    }
  }
  const flavorId = positional[0];
  if (!flavorId) {
    console.error(
      `Usage: check-frontend-brand.mjs <flavor-id> [--target <triple>]\n` +
        `Available flavors: ${listFlavorIds().join(", ")}`,
    );
    process.exit(2);
  }

  const targetDir = path.join(
    desktopDir,
    "src-tauri",
    "target",
    ...(target ? [target] : []),
  );
  const dirs = codegenAssetDirs(targetDir);
  if (dirs.length === 0) {
    // Said as a layout failure, not as a branding failure. The two have
    // opposite fixes and only one of them is "the build shipped the Buzz bee".
    console.error(
      `::error::no tauri-codegen-assets under ${path.relative(desktopDir, targetDir)}/release/build/buzz-desktop-*/out/ — ` +
        `either the build did not run or tauri-codegen changed where it writes`,
    );
    process.exit(1);
  }

  const needles = brandNeedles(loadFlavor(flavorId));
  const { counts, scanned, unreadable } = scanAssets(dirs, needles);
  if (scanned === 0) {
    console.error(
      `::error::${dirs.length} tauri-codegen-assets director${dirs.length === 1 ? "y" : "ies"} held no readable asset`,
    );
    process.exit(1);
  }

  let missing = 0;
  for (const [key, count] of Object.entries(counts)) {
    if (count === 0) {
      console.error(
        `::error::${key} is in no embedded asset — the frontend Tauri bundled ` +
          `is not ${flavorId}'s`,
      );
      missing += 1;
    } else {
      console.log(`ok: ${key} found in ${count} embedded asset(s)`);
    }
  }
  console.log(
    `${scanned} embedded assets scanned` +
      `${unreadable > 0 ? ` (${unreadable} not brotli)` : ""}, ` +
      `${Object.keys(needles).length} brand strings checked, ${missing} missing`,
  );
  process.exit(missing === 0 ? 0 : 1);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
