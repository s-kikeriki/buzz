import assert from "node:assert/strict";
import test from "node:test";

import {
  demoBuildConfig,
  productionBuildIdentity,
} from "./demo-build-config.mjs";

const expected = (name, slug) => ({
  name,
  slug,
  productName: `Buzz ${name}`,
  dmgVolumeName: `Buzz ${name}`,
  dmgFileStem: `Buzz_${name.replace(/ /g, "_")}`,
  identifier: `xyz.block.buzz.app.demo.${slug}`,
  appDataIdentity: `xyz.block.buzz.app.demo.${slug}`,
  deepLinkScheme: `buzz-demo-${slug}`,
  keyringService: `buzz-desktop-demo.${slug}`,
  nestName: `.buzz-demo-${slug}`,
  cliName: `buzz-demo-${slug}`,
  // Without the build ID, unlike every other derived name: it is the `Exec=`
  // line, the WM_CLASS and what `ps` shows.
  mainBinaryName: `${slug.replace(/-[0-9a-f]{16}$/, "")}-desktop`,
  tauriConfig: {
    productName: `Buzz ${name}`,
    identifier: `xyz.block.buzz.app.demo.${slug}`,
    plugins: { "deep-link": { desktop: { schemes: [`buzz-demo-${slug}`] } } },
    bundle: { targets: ["app"] },
  },
});

test("production identity remains unchanged", () => {
  assert.deepEqual(productionBuildIdentity, {
    productName: "Buzz",
    identifier: "xyz.block.buzz.app",
    deepLinkScheme: "buzz",
    keyringService: "buzz-desktop",
    nestName: ".buzz",
    cliName: "buzz",
    mainBinaryName: "buzz-desktop",
  });
});

test("two demo names produce complete, distinct identities", () => {
  const board = demoBuildConfig("Workstream Board", "27a4294c27a4294c");
  const interests = demoBuildConfig("Interests Demo", "deb5339adeb5339a");
  assert.deepEqual(
    board,
    expected("Workstream Board", "workstream-board-27a4294c27a4294c"),
  );
  assert.deepEqual(
    interests,
    expected("Interests Demo", "interests-demo-deb5339adeb5339a"),
  );
  for (const key of [
    "productName",
    "dmgVolumeName",
    "dmgFileStem",
    "identifier",
    "appDataIdentity",
    "deepLinkScheme",
    "keyringService",
    "nestName",
    "cliName",
    // On Linux this one is a `/usr/bin` entry, and two packages cannot own it.
    "mainBinaryName",
  ]) {
    assert.notEqual(board[key], interests[key], key);
    assert.notEqual(board[key], productionBuildIdentity[key], key);
  }
});

test("a demo named Buzz is refused rather than shadowing the real binary", () => {
  // Reachable, and the one input whose derived binary name collides with the
  // trunk's: the resulting `.deb` would claim `/usr/bin/buzz-desktop` and the
  // `buzz-desktop` launcher icons, which is installing over a real Buzz. Every
  // other derived name in that config looks correctly scoped.
  assert.throws(
    () => demoBuildConfig("Buzz", "1111111111111111"),
    /derives the production binary name "buzz-desktop"/,
  );
  // The guard is on the derived name, not the spelling, so the normalised
  // forms are refused too.
  assert.throws(
    () => demoBuildConfig("buzz", "1111111111111111"),
    /buzz-desktop/,
  );
  assert.throws(
    () => demoBuildConfig("BUZZ", "1111111111111111"),
    /buzz-desktop/,
  );
  // And a name that merely starts with it is still fine.
  assert.equal(
    demoBuildConfig("Buzz Demo", "1111111111111111").mainBinaryName,
    "buzz-demo-desktop",
  );
});

test("normalized spelling aliases retain distinct runtime identities", () => {
  for (const [leftName, rightName] of [
    ["A B", "A-B"],
    ["Demo", "demo"],
    ["Workstream Board", "WORKSTREAM BOARD"],
  ]) {
    const left = demoBuildConfig(leftName, "1111111111111111");
    const right = demoBuildConfig(rightName, "2222222222222222");
    assert.notEqual(left.slug, right.slug);
    for (const key of [
      "identifier",
      "appDataIdentity",
      "deepLinkScheme",
      "keyringService",
      "nestName",
      "cliName",
    ]) {
      assert.notEqual(
        left[key],
        right[key],
        `${leftName}/${rightName}: ${key}`,
      );
    }
  }
});

test("the same display name gets a distinct identity for each build", () => {
  const first = demoBuildConfig("Demo", "1111111111111111");
  const second = demoBuildConfig("Demo", "2222222222222222");
  assert.equal(first.productName, second.productName);
  assert.equal(first.dmgFileStem, second.dmgFileStem);
  for (const key of [
    "slug",
    "identifier",
    "appDataIdentity",
    "deepLinkScheme",
    "keyringService",
    "nestName",
    "cliName",
  ]) {
    assert.notEqual(first[key], second[key], key);
  }
});

test("whitespace normalization preserves deterministic identity", () => {
  assert.deepEqual(
    demoBuildConfig("  Workstream   Board  ", "27a4294c27a4294c"),
    demoBuildConfig("Workstream Board", "27a4294c27a4294c"),
  );
});

test("maximum-length name produces a Rust-valid 48-byte slug", () => {
  const config = demoBuildConfig("x".repeat(31), "1234567812345678");
  assert.equal(config.slug.length, 48);
  assert.match(config.slug, /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);
});

for (const name of [
  "",
  "   ",
  "Workstream/Board",
  "Workstream_Board",
  "équipe",
  "x".repeat(32),
]) {
  test(`rejects unusable name ${JSON.stringify(name)}`, () =>
    assert.throws(() => demoBuildConfig(name, "1234567812345678")));
}
