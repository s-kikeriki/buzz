import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { brotliCompressSync } from "node:zlib";

import {
  brandNeedles,
  codegenAssetDirs,
  scanAssets,
} from "./check-frontend-brand.mjs";
import { flavorBuildEnv, loadFlavor } from "./flavor-config.mjs";

/** A stand-in for what `tauri-codegen` writes: one brotli blob per asset. */
function assetsDir(blobs) {
  const dir = mkdtempSync(path.join(tmpdir(), "codegen-assets-"));
  blobs.forEach((contents, index) => {
    const file = path.join(dir, `${index}.js`);
    writeFileSync(
      file,
      typeof contents === "string"
        ? brotliCompressSync(Buffer.from(contents, "utf8"))
        : contents,
    );
  });
  return dir;
}

test("each logo needle identifies that logo and no other", () => {
  const needles = brandNeedles(loadFlavor("ki.keriki"));
  assert.equal(needles.VITE_BUZZ_PRODUCT_NAME, "ki.keriki");

  const logoKeys = Object.keys(needles).filter(
    (key) => key !== "VITE_BUZZ_PRODUCT_NAME",
  );
  assert.equal(logoKeys.length, 4, "ki.keriki declares four logos");

  // The property, asserted directly rather than through a proxy. A needle that
  // also occurs inside a *different* logo turns two checks into one: ki.keriki's
  // mark and its light cut are the same drawing with two colours swapped, so
  // they are byte-identical for long stretches, and a needle taken from one of
  // those stretches is satisfied by whichever of the two the build shipped.
  const allLogos = {};
  for (const flavorId of ["ki.keriki", "zeniad"]) {
    const env = flavorBuildEnv(loadFlavor(flavorId));
    for (const key of logoKeys) {
      if (typeof env[key] === "string")
        allLogos[`${flavorId}:${key}`] = env[key];
    }
  }
  for (const key of logoKeys) {
    assert.equal(needles[key].length, 256);
    for (const [owner, value] of Object.entries(allLogos)) {
      const isItsOwn = owner === `ki.keriki:${key}`;
      assert.equal(
        value.includes(needles[key]),
        isItsOwn,
        `${key}'s needle must appear in its own logo and in no other (${owner})`,
      );
    }
  }
});

test("a flavor with no logo is checked on the name alone", () => {
  // Not an oversight to be fixed by inventing a needle: zeniad declares no
  // logo, so demanding one would fail every correct zeniad build.
  assert.deepEqual(Object.keys(brandNeedles(loadFlavor("zeniad"))), [
    "VITE_BUZZ_PRODUCT_NAME",
  ]);
});

test("the scan finds the flavor that is there and misses the one that is not", () => {
  const kikeriki = brandNeedles(loadFlavor("ki.keriki"));
  const env = flavorBuildEnv(loadFlavor("ki.keriki"));
  const dir = assetsDir([
    `var M={productName:\`${env.VITE_BUZZ_PRODUCT_NAME}\`};`,
    `const logo="${env.VITE_BUZZ_PRODUCT_LOGO}";`,
    `const mark="${env.VITE_BUZZ_PRODUCT_LOGO_MARK}";`,
    `const markLight="${env.VITE_BUZZ_PRODUCT_LOGO_MARK_LIGHT}";`,
    `const light="${env.VITE_BUZZ_PRODUCT_LOGO_LIGHT}";`,
  ]);

  const found = scanAssets([dir], kikeriki);
  assert.equal(found.scanned, 5);
  assert.equal(found.unreadable, 0);
  for (const [key, count] of Object.entries(found.counts)) {
    assert.ok(count > 0, `${key} should have been found`);
  }

  // The direction that actually matters: the same assets must fail the check
  // for a different flavor. Without this, a scan that matched everything would
  // look identical to a scan that worked.
  const zeniad = brandNeedles(loadFlavor("zeniad"));
  const wrong = scanAssets([dir], zeniad);
  assert.deepEqual(wrong.counts, { VITE_BUZZ_PRODUCT_NAME: 0 });
});

test("a blob that is not brotli is counted, never silently skipped", () => {
  // `scanned` is what the script's "held no readable asset" branch reads. If a
  // layout change made every blob unreadable, counting them as scanned would
  // report a clean pass over nothing.
  const dir = assetsDir([Buffer.from("not brotli at all", "utf8")]);
  const result = scanAssets([dir], { VITE_BUZZ_PRODUCT_NAME: "ki.keriki" });
  assert.equal(result.scanned, 0);
  assert.equal(result.unreadable, 1);
  assert.equal(result.counts.VITE_BUZZ_PRODUCT_NAME, 0);
});

test("the asset directory is located under the build hash, or not at all", () => {
  const targetDir = mkdtempSync(path.join(tmpdir(), "target-"));
  assert.deepEqual(
    codegenAssetDirs(targetDir),
    [],
    "an un-built target directory yields nothing rather than throwing",
  );

  // Cargo keeps two `buzz-desktop-*` directories: the build script's own and
  // its output. Only the second has `out/`, and picking the wrong one would
  // make the check report a missing brand on a correct build.
  mkdirSync(path.join(targetDir, "release", "build", "buzz-desktop-aaaa"), {
    recursive: true,
  });
  const real = path.join(
    targetDir,
    "release",
    "build",
    "buzz-desktop-bbbb",
    "out",
    "tauri-codegen-assets",
  );
  mkdirSync(real, { recursive: true });
  mkdirSync(path.join(targetDir, "release", "build", "serde-cccc", "out"), {
    recursive: true,
  });
  assert.deepEqual(codegenAssetDirs(targetDir), [real]);
});
