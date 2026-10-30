#!/usr/bin/env node
/**
 * Copy a flavor's icons over the stock ones in `src-tauri/icons/`.
 *
 * Usage: node scripts/stage-flavor-icons.mjs <flavor-id> [--check]
 *
 * `tauri.conf.json` names its icons by a fixed path, so branding a bundle means
 * putting the flavor's bytes at that path before `tauri build` runs. The macOS
 * builds have always done this from a brand directory living outside the
 * checkout, which works and is invisible: the icon is absent from the diff, and
 * the same command on another machine ships the Buzz bee. This does it from the
 * flavor file instead, so what gets staged is reviewable and reproducible.
 *
 * `--check` reports what would be copied and changes nothing — for a CI job
 * that wants to fail before a twenty-minute build rather than after it.
 *
 * ## This script does not restore anything
 *
 * It overwrites files that are tracked by git, which is fine in CI (the
 * checkout is thrown away) and is not fine on a developer's machine, where a
 * later `git status` shows four modified icons and a `git add -A` commits one
 * organisation's artwork over the trunk's. It therefore refuses to run when the
 * targets it is about to overwrite already differ from HEAD, and prints the
 * `git checkout` that undoes a previous run.
 */

import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PLATFORM_ICON_TARGETS, loadFlavor } from "./flavor-config.mjs";

const desktopDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const iconsDir = path.join(desktopDir, "src-tauri", "icons");

/**
 * Every (source, stock filename) pair a flavor replaces, macOS included.
 *
 * `icon` is folded in here rather than left to the macOS wrapper: a Linux or
 * Windows job has no reason to know that one of the five icons is declared by a
 * different field, and a macOS job that uses this gets the committed icon
 * instead of one staged from a directory outside the repo.
 */
function stagedIcons(flavor) {
  const pairs = [[flavor.icon, "icon.icns"]];
  for (const target of Object.keys(PLATFORM_ICON_TARGETS)) {
    const declared = flavor.platformIcons?.[target];
    if (declared !== undefined) pairs.push([declared, target]);
  }
  return pairs;
}

/** Whether a tracked file still matches HEAD. */
function matchesHead(relativeToDesktop) {
  const repoRelative = path.join("desktop", relativeToDesktop);
  const committed = execFileSync("git", ["show", `HEAD:${repoRelative}`], {
    cwd: desktopDir,
    maxBuffer: 64 * 1024 * 1024,
  });
  const onDisk = readFileSync(path.join(desktopDir, relativeToDesktop));
  return committed.equals(onDisk);
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const flavorId = args.find((arg) => !arg.startsWith("--"));
  if (!flavorId) {
    console.error("Usage: stage-flavor-icons.mjs <flavor-id> [--check]");
    process.exit(1);
  }

  const flavor = loadFlavor(flavorId);
  if (flavor.frozen) {
    // Same refusal `flavor-config.mjs` makes: a frozen flavor does not build,
    // so staging its icons is either a typo for a live flavor's id or the
    // first half of a build that is about to be refused anyway.
    console.error(`flavor ${flavorId}: frozen flavors are not built`);
    process.exit(1);
  }
  const pairs = stagedIcons(flavor);

  for (const [source] of pairs) {
    const absolute = path.join(desktopDir, source);
    try {
      statSync(absolute);
    } catch {
      console.error(
        `flavor ${flavorId}: declares ${source}, which is not in the repo`,
      );
      process.exit(1);
    }
  }

  const dirty = [];
  for (const [, target] of pairs) {
    const stockPath = path.join("src-tauri", "icons", target);
    if (!matchesHead(stockPath)) dirty.push(stockPath);
  }
  if (dirty.length > 0 && !check) {
    // `-C desktopDir` with `desktop/`-prefixed pathspecs is a command that
    // looks right and resolves to `desktop/desktop/...`. Both halves are
    // repo-root-relative here so the line can be pasted.
    const repoRoot = path.dirname(desktopDir);
    console.error(
      `${dirty.join(", ")} already differ from HEAD — a previous staging run ` +
        `was not undone. Restore them first:\n` +
        `  git -C ${repoRoot} checkout -- ` +
        dirty.map((entry) => path.join("desktop", entry)).join(" "),
    );
    process.exit(1);
  }

  for (const [source, target] of pairs) {
    if (!check)
      copyFileSync(path.join(desktopDir, source), path.join(iconsDir, target));
    console.log(
      `${check ? "would stage" : "staged"} ${source} -> src-tauri/icons/${target}`,
    );
  }
}

main();
