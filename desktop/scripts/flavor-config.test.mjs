import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { demoBuildConfig } from "./demo-build-config.mjs";
import {
  flavorBuildEnv,
  flavorBuildEnvShell,
  listFlavorIds,
  loadFlavor,
  validateFlavor,
} from "./flavor-config.mjs";

function goodFlavor(overrides = {}) {
  return {
    id: "acme",
    displayName: "Acme",
    productName: "Acme",
    identifier: "xyz.block.buzz.app.demo.acme-00112233445566aa",
    demo: { name: "Acme", buildId: "00112233445566aa" },
    icon: "flavors/icons/acme.icns",
    relayUrl: "wss://relay.acme.test",
    ...overrides,
  };
}

test("every committed flavor loads and validates", () => {
  const ids = listFlavorIds();
  // The two apps Ian builds, the frozen one, and the example.
  assert.ok(ids.includes("zeniad"));
  assert.ok(ids.includes("ki.keriki"));
  assert.ok(ids.includes("KI.keri.KI"));
  assert.ok(ids.includes("example-client"));

  for (const id of ids) {
    const flavor = loadFlavor(id);
    assert.equal(flavor.id, id);
  }
});

test("every committed flavor's identifier matches its derived identity", () => {
  // The defect this guards shipped once: a DMG branded as one app carrying
  // another app's identifier, which installs over the wrong `.app`.
  for (const id of listFlavorIds()) {
    const flavor = loadFlavor(id);
    const derived = demoBuildConfig(flavor.demo.name, flavor.demo.buildId);
    assert.equal(
      flavor.identifier,
      derived.identifier,
      `${id}: declared identifier must equal the derived one`,
    );
  }
});

test("no two flavors share an identifier", () => {
  const seen = new Map();
  for (const id of listFlavorIds()) {
    const { identifier } = loadFlavor(id);
    const previous = seen.get(identifier);
    assert.equal(
      previous,
      undefined,
      `${id} and ${previous} both claim ${identifier} — one would overwrite the other on install`,
    );
    seen.set(identifier, id);
  }
});

test("the real flavors carry the relay each app is meant to talk to", () => {
  assert.equal(
    loadFlavor("zeniad").relayUrl,
    "wss://zeniad.communities.buzz.xyz",
  );
  assert.equal(loadFlavor("ki.keriki").relayUrl, "wss://relay.ki.keriki.de");
});

test("KI.keri.KI stays frozen and the example stays an example", () => {
  assert.equal(loadFlavor("KI.keri.KI").frozen, true);
  assert.equal(loadFlavor("example-client").example, true);
  // Neither of the live apps may be marked frozen or example by accident.
  for (const id of ["zeniad", "ki.keriki"]) {
    assert.equal(loadFlavor(id).frozen, false, `${id} must not be frozen`);
    assert.equal(loadFlavor(id).example, false, `${id} must not be an example`);
  }
});

test("a mismatched identifier is refused", () => {
  assert.throws(
    () =>
      validateFlavor(
        goodFlavor({
          identifier: "xyz.block.buzz.app.demo.other-00112233445566aa",
        }),
        "acme",
      ),
    /does not match the identity derived/,
  );
});

test("a mismatched build id is refused even when the name matches", () => {
  assert.throws(
    () =>
      validateFlavor(
        goodFlavor({ demo: { name: "Acme", buildId: "ffffffffffffffff" } }),
        "acme",
      ),
    /does not match the identity derived/,
  );
});

test("a build id that is not sixteen hex characters is refused", () => {
  for (const buildId of ["", "abc", "00112233445566AA", "00112233445566aaa"]) {
    assert.throws(
      () =>
        validateFlavor(goodFlavor({ demo: { name: "Acme", buildId } }), "acme"),
      /demo.buildId must be sixteen lowercase hexadecimal characters/,
    );
  }
});

test("a file whose id disagrees with its filename is refused", () => {
  assert.throws(
    () => validateFlavor(goodFlavor({ id: "other" }), "acme"),
    /id is "other" but the file is acme.json/,
  );
});

test("required fields are required", () => {
  for (const field of [
    "displayName",
    "productName",
    "identifier",
    "icon",
    "relayUrl",
  ]) {
    const flavor = goodFlavor();
    delete flavor[field];
    assert.throws(
      () => validateFlavor(flavor, "acme"),
      new RegExp(`${field} must be a non-empty string`),
    );
    assert.throws(
      () => validateFlavor(goodFlavor({ [field]: "   " }), "acme"),
      new RegExp(`${field} must be a non-empty string`),
    );
  }
});

test("a relay URL that is not a websocket URL is refused", () => {
  for (const relayUrl of [
    "https://relay.acme.test",
    "relay.acme.test",
    "wss://",
  ]) {
    assert.throws(
      () => validateFlavor(goodFlavor({ relayUrl }), "acme"),
      /relayUrl must be a ws:\/\/ or wss:\/\/ URL/,
    );
  }
});

test("an icon path that escapes the repo is refused", () => {
  for (const icon of ["/etc/passwd", "../../secrets/icon.icns"]) {
    assert.throws(
      () => validateFlavor(goodFlavor({ icon }), "acme"),
      /icon must be a repo-relative path without/,
    );
  }
});

test("an accent colour that is not lowercase #rrggbb is refused", () => {
  for (const accentColor of ["#FFF", "#3B82F6", "blue", "#3b82f"]) {
    assert.throws(
      () => validateFlavor(goodFlavor({ accentColor }), "acme"),
      /accentColor must be a lowercase #rrggbb hex colour/,
    );
  }
  assert.equal(
    validateFlavor(goodFlavor({ accentColor: "#3b82f6" }), "acme").accentColor,
    "#3b82f6",
  );
});

test("an unknown flavor names the ones that exist", () => {
  assert.throws(() => loadFlavor("nope"), /no such flavor. Available: /);
});

test("the build env carries every value a build needs to pick an identity", () => {
  const flavor = loadFlavor("ki.keriki");
  assert.deepEqual(flavorBuildEnv(flavor), {
    BRAND_NAME: "ki.keriki",
    BUZZ_BUILD_AUTO_CONNECT_DEFAULT_RELAY: "1",
    BUZZ_BUILD_DEMO_SLUG: "kikeriki-857f685ce21f5788",
    BUZZ_RELAY_URL: "wss://relay.ki.keriki.de",
    DEMO_BUILD_ID: "857f685ce21f5788",
    DEMO_NAME: "kikeriki",
    VITE_BUZZ_DEFAULT_ACCENT_COLOR: "#3b82f6",
    VITE_BUZZ_PRODUCT_NAME: "ki.keriki",
  });
});

test("the slug in the build env is the one the identifier is built from", () => {
  for (const id of listFlavorIds()) {
    const flavor = loadFlavor(id);
    const env = flavorBuildEnv(flavor);
    assert.equal(
      flavor.identifier,
      `xyz.block.buzz.app.demo.${env.BUZZ_BUILD_DEMO_SLUG}`,
      `${id}: BUZZ_BUILD_DEMO_SLUG must select the declared identifier`,
    );
  }
});

test("auto-connect is only emitted when the flavor asks for it", () => {
  const env = flavorBuildEnv(
    validateFlavor(goodFlavor({ autoConnectDefaultRelay: false }), "acme"),
  );
  assert.equal(env.BUZZ_BUILD_AUTO_CONNECT_DEFAULT_RELAY, undefined);
});

test("the accent variable is omitted when the flavor sets no colour", () => {
  const env = flavorBuildEnv(validateFlavor(goodFlavor(), "acme"));
  assert.equal(env.VITE_BUZZ_DEFAULT_ACCENT_COLOR, undefined);
});

test("shell output quotes every value", () => {
  const lines = flavorBuildEnvShell(
    validateFlavor(goodFlavor({ displayName: "Acme's App" }), "acme"),
  ).split("\n");
  assert.ok(lines.includes(`BRAND_NAME='Acme'\\''s App'`));
  for (const line of lines) {
    assert.match(line, /^[A-Z0-9_]+='.*'$/);
  }
});

test("every buildable flavor's icon is committed at the path it names", () => {
  // The promise a flavor file makes is "a build needs nothing but a checkout
  // and the flavor's name". A declared icon that is not in the repo breaks
  // exactly that, and breaks it late — at `codesign`, in a shell script
  // outside this repo. Frozen and example flavors are exempt: both refuse to
  // build, so neither needs its artwork here.
  const desktopDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  for (const id of listFlavorIds()) {
    const flavor = loadFlavor(id);
    if (flavor.frozen || flavor.example) continue;
    const iconPath = path.join(desktopDir, flavor.icon);
    assert.ok(
      existsSync(iconPath),
      `${id}: declares ${flavor.icon}, which is not in the repo`,
    );
  }
});
