import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

const desktopDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

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

// A traversal written with the separator this host does not use is still a
// traversal: the flavor file is data, and the build that reads it may run on
// Windows. Splitting on `path.sep` saw `..\..\x` as one innocent segment.
const ESCAPING_PATHS = [
  "/etc/passwd",
  "../../secrets",
  "flavors/../../secrets",
  "..\\..\\secrets",
  "flavors\\..\\..\\secrets",
  "C:\\Windows\\System32",
  "\\\\server\\share\\secrets",
  "\\etc\\passwd",
];

test("an icon path that escapes the repo is refused", () => {
  for (const suffix of ESCAPING_PATHS) {
    assert.throws(
      () => validateFlavor(goodFlavor({ icon: `${suffix}.icns` }), "acme"),
      /icon must be a repo-relative path without/,
      `icon ${suffix}.icns must be refused`,
    );
  }
});

test("a logo path that escapes the repo is refused", () => {
  for (const suffix of ESCAPING_PATHS) {
    assert.throws(
      () => validateFlavor(goodFlavor({ logo: `${suffix}.svg` }), "acme"),
      /logo must be a repo-relative path without/,
      `logo ${suffix}.svg must be refused`,
    );
  }
});

test("a path that merely contains two dots is still allowed", () => {
  // The check rejects a `..` *segment*, not the characters: a filename is
  // free to carry dots, and over-rejecting here would refuse real artwork.
  const flavor = validateFlavor(
    goodFlavor({
      icon: "flavors/icons/acme..v2.icns",
      logo: "flavors/logos/..acme.svg",
    }),
    "acme",
  );
  assert.equal(flavor.icon, "flavors/icons/acme..v2.icns");
  assert.equal(flavor.logo, "flavors/logos/..acme.svg");
});

test("a logo that is not an SVG is refused", () => {
  // `brandLogo.ts` accepts only an inline SVG data URL, so a raster is not a
  // logo that renders badly — it is dropped at paint time, leaving a build
  // that declared a mark and ships none, with nothing in the log to say so.
  for (const logo of [
    "flavors/logos/acme.png",
    "flavors/logos/acme.icns",
    "flavors/logos/acme",
  ]) {
    assert.throws(
      () => validateFlavor(goodFlavor({ logo }), "acme"),
      /logo must be an \.svg/,
    );
  }
  for (const logo of ["", "   ", 7]) {
    assert.throws(
      () => validateFlavor(goodFlavor({ logo }), "acme"),
      /logo must be a non-empty string/,
    );
  }
});

test("the logo style is one of the two the renderer implements", () => {
  for (const logoStyle of ["colour", "COLOR", "image", "", true, 1]) {
    assert.throws(
      () =>
        validateFlavor(
          goodFlavor({ logo: "flavors/logos/acme.svg", logoStyle }),
          "acme",
        ),
      /logoStyle must be one of mask, color/,
      `logoStyle ${logoStyle} must be refused`,
    );
  }
});

test("a light cut is refused unless it can actually be reached", () => {
  const colour = { logo: "flavors/logos/acme.svg", logoStyle: "color" };
  for (const suffix of ESCAPING_PATHS) {
    assert.throws(
      () =>
        validateFlavor(
          goodFlavor({ ...colour, logoLight: `${suffix}.svg` }),
          "acme",
        ),
      /logoLight must be a repo-relative path without/,
      `logoLight ${suffix}.svg must be refused`,
    );
  }
  assert.throws(
    () =>
      validateFlavor(
        goodFlavor({ ...colour, logoLight: "flavors/logos/acme-light.png" }),
        "acme",
      ),
    /logoLight must be an \.svg/,
  );
  assert.throws(
    () =>
      validateFlavor(
        goodFlavor({ logoLight: "flavors/logos/acme-light.svg" }),
        "acme",
      ),
    /logoLight is set but no logo is declared/,
  );
  // The one that is a contradiction rather than a typo: a mask already
  // follows the theme, so a second file under it is a variant nothing can
  // ever display — and in review it looks like theme support that works.
  assert.throws(
    () =>
      validateFlavor(
        goodFlavor({
          logo: "flavors/logos/acme.svg",
          logoLight: "flavors/logos/acme-light.svg",
        }),
        "acme",
      ),
    /logoLight only applies to logoStyle color/,
  );
});

test("the light cut travels as its own variable, or not at all", () => {
  const withLight = validateFlavor(
    goodFlavor({
      logo: "flavors/logos/acme.svg",
      logoLight: "flavors/logos/acme-light.svg",
      logoStyle: "color",
    }),
    "acme",
  );
  assert.equal(
    flavorBuildEnv(withLight, () => "<svg/>").VITE_BUZZ_PRODUCT_LOGO_LIGHT,
    "data:image/svg+xml;base64,PHN2Zy8+",
  );
  const withoutLight = validateFlavor(
    goodFlavor({ logo: "flavors/logos/acme.svg" }),
    "acme",
  );
  assert.equal(
    flavorBuildEnv(withoutLight, () => "<svg/>").VITE_BUZZ_PRODUCT_LOGO_LIGHT,
    undefined,
  );
});

test("a logo style without a logo is refused", () => {
  assert.throws(
    () => validateFlavor(goodFlavor({ logoStyle: "color" }), "acme"),
    /logoStyle is set but no logo is declared/,
  );
});

test("a flavor that declares a logo and no style gets the mask", () => {
  // The default has to stay `mask`: it is what every flavor written before
  // `logoStyle` existed means, and the one that degrades legibly when the
  // asset and the style disagree.
  const flavor = validateFlavor(
    goodFlavor({ logo: "flavors/logos/acme.svg" }),
    "acme",
  );
  assert.equal(flavor.logoStyle, "mask");
  assert.equal(
    flavorBuildEnv(flavor, () => "<svg/>").VITE_BUZZ_PRODUCT_LOGO_STYLE,
    "mask",
  );
});

test("the style variable is omitted along with the logo", () => {
  // The pair travels together or not at all: a style variable surviving from
  // a previous flavor's build would paint the next one's mark in the wrong
  // form.
  const flavor = validateFlavor(goodFlavor(), "acme");
  assert.equal(flavor.logoStyle, undefined);
  assert.equal(
    flavorBuildEnv(flavor, () => "<svg/>").VITE_BUZZ_PRODUCT_LOGO_STYLE,
    undefined,
  );
});

test("the logo is optional and its variable is omitted without one", () => {
  const flavor = validateFlavor(goodFlavor(), "acme");
  assert.equal(flavor.logo, undefined);
  assert.equal(
    flavorBuildEnv(flavor, () => {
      throw new Error("must not read a logo this flavor does not declare");
    }).VITE_BUZZ_PRODUCT_LOGO,
    undefined,
  );
});

test("the logo variable carries the asset's own bytes", () => {
  // The bytes must come from the file the flavor names, not from anywhere
  // else: this is the whole reason the variable is a data URL and not a path.
  const flavor = loadFlavor("ki.keriki");
  const env = flavorBuildEnv(flavor);
  const [, base64] = env.VITE_BUZZ_PRODUCT_LOGO.split("base64,");
  const decoded = Buffer.from(base64, "base64").toString("utf8");
  const onDisk = readFileSync(path.join(desktopDir, flavor.logo), "utf8");
  assert.equal(decoded, onDisk);
  assert.match(decoded, /^<svg /);
});

test("every committed logo is the kind of file its style can paint", () => {
  // Both halves of this matter, and they fail the same way — a mark that is
  // there and unreadable. A `mask` asset that pins its own colours loses all
  // of them to the foreground and comes out as a solid slab; a `color` asset
  // drawn in `currentColor` resolves against whatever colour it inherits,
  // which in the sidebar is near-black on near-black. Neither shows up in a
  // diff, so assert the match in both directions rather than one.
  for (const id of listFlavorIds()) {
    const flavor = loadFlavor(id);
    if (flavor.logo === undefined) continue;
    const svg = readFileSync(path.join(desktopDir, flavor.logo), "utf8");
    if (flavor.logoStyle === "color") {
      assert.doesNotMatch(
        svg,
        /currentColor/,
        `${id}: a colour mark must not defer to the theme's foreground`,
      );
      assert.match(
        svg,
        /(?:fill|stroke)="(?:#[0-9a-fA-F]{3,8}|(?!none\b)[a-z]+)"/,
        `${id}: a colour mark must pin at least one colour of its own`,
      );
    } else {
      assert.doesNotMatch(
        svg,
        /#[0-9a-fA-F]{3,8}\b/,
        `${id}: a masked mark must not pin a colour the mask discards`,
      );
    }
    if (flavor.logoLight === undefined) continue;
    // The light cut is only worth a second file and a second request if it
    // is a different drawing. Two paths lead to it being neither: the wrong
    // file copied in, or a regeneration that recoloured nothing. Both ship a
    // mark that disappears in one theme, which is the defect the cut exists
    // to fix.
    const light = readFileSync(path.join(desktopDir, flavor.logoLight), "utf8");
    assert.notEqual(
      light,
      svg,
      `${id}: the light cut is byte-identical to the dark one`,
    );
    const body = light.split("<defs>")[0];
    assert.doesNotMatch(
      body,
      /fill="(?:white|#[fF]{3,6}\b|#[fF]5[fF]5[fF]5\b)"/,
      `${id}: the light cut still paints near-white ink on a light surface`,
    );
  }
});

test("the real flavors start on the accent each app is meant to have", () => {
  // The companion to the relay test above: the accent is the other value a
  // fresh install takes from the build rather than from the user, so assert
  // the colour each app actually ships, not merely that it declared one.
  // `ki.keriki` is on citron `#d4f247`, the one signal colour the kikeriki
  // brand book ratifies; Zeniad is still on Buzz's blue. Changing either is a
  // deliberate edit to this line, not a side effect of touching a flavor file.
  const expected = { zeniad: "#3b82f6", "ki.keriki": "#d4f247" };
  for (const [id, accentColor] of Object.entries(expected)) {
    const flavor = loadFlavor(id);
    assert.equal(flavor.accentColor, accentColor, `${id}: declared accent`);
    assert.equal(
      flavorBuildEnv(flavor, () => "<svg/>").VITE_BUZZ_DEFAULT_ACCENT_COLOR,
      accentColor,
      `${id}: the accent that reaches the build`,
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

test("a chrome surface outside the known set is refused", () => {
  for (const chromeSurface of ["Ink", "black", "dark", "", true]) {
    assert.throws(
      () => validateFlavor(goodFlavor({ chromeSurface }), "acme"),
      /chromeSurface must be one of auto, ink/,
      `for ${String(chromeSurface)}`,
    );
  }
  assert.equal(
    validateFlavor(goodFlavor({ chromeSurface: "ink" }), "acme").chromeSurface,
    "ink",
  );
});

test("a flavor that declares no chrome surface builds as auto", () => {
  // Normalised rather than left undefined, and emitted into the env even at
  // the default: the frontend parses this value, so a build that silently
  // inherited the parser's fallback would make a flavor's choice unreadable
  // from the env it produced.
  const flavor = validateFlavor(goodFlavor(), "acme");
  assert.equal(flavor.chromeSurface, "auto");
  assert.equal(
    flavorBuildEnv(flavor, () => "<svg/>").VITE_BUZZ_CHROME_SURFACE,
    "auto",
  );
});

test("the chrome surface each flavor declares is the one that is built", () => {
  // Bound to the committed flavor files, so moving kikeriki off the ink rail
  // has to be a deliberate edit rather than something a refactor can drop.
  const expected = { "ki.keriki": "ink" };
  for (const id of listFlavorIds()) {
    const flavor = loadFlavor(id);
    assert.equal(
      flavorBuildEnv(flavor, () => "<svg/>").VITE_BUZZ_CHROME_SURFACE,
      expected[id] ?? "auto",
      `${id}: the chrome surface that reaches the build`,
    );
  }
});

test("an unknown flavor names the ones that exist", () => {
  assert.throws(() => loadFlavor("nope"), /no such flavor. Available: /);
});

test("the build env carries every value a build needs to pick an identity", () => {
  const flavor = loadFlavor("ki.keriki");
  assert.deepEqual(
    flavorBuildEnv(flavor, () => "<svg/>"),
    {
      BRAND_NAME: "ki.keriki",
      BUZZ_BUILD_AUTO_CONNECT_DEFAULT_RELAY: "1",
      BUZZ_BUILD_DEMO_SLUG: "kikeriki-857f685ce21f5788",
      BUZZ_RELAY_URL: "wss://relay.ki.keriki.de",
      DEMO_BUILD_ID: "857f685ce21f5788",
      DEMO_NAME: "kikeriki",
      VITE_BUZZ_CHROME_SURFACE: "ink",
      VITE_BUZZ_DEFAULT_ACCENT_COLOR: "#d4f247",
      VITE_BUZZ_PRODUCT_LOGO: "data:image/svg+xml;base64,PHN2Zy8+",
      VITE_BUZZ_PRODUCT_LOGO_LIGHT: "data:image/svg+xml;base64,PHN2Zy8+",
      VITE_BUZZ_PRODUCT_LOGO_MARK: "data:image/svg+xml;base64,PHN2Zy8+",
      VITE_BUZZ_PRODUCT_LOGO_STYLE: "color",
      VITE_BUZZ_PRODUCT_NAME: "ki.keriki",
    },
  );
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

test("the companion mark is optional and needs a wordmark to accompany", () => {
  const withMark = validateFlavor(
    goodFlavor({
      logo: "flavors/logos/acme.svg",
      logoMark: "flavors/logos/acme-mark.svg",
    }),
    "acme",
  );
  assert.equal(
    flavorBuildEnv(withMark, () => "<svg/>").VITE_BUZZ_PRODUCT_LOGO_MARK,
    "data:image/svg+xml;base64,PHN2Zy8+",
  );

  // Omitted, not emptied: absence is what keeps the bees on a build that has
  // not drawn a mark yet.
  const plain = flavorBuildEnv(validateFlavor(goodFlavor(), "acme"));
  assert.ok(!("VITE_BUZZ_PRODUCT_LOGO_MARK" in plain));

  // A mark with no wordmark would brand the drifting field and leave the Buzz
  // wordmark in the middle of it.
  assert.throws(
    () =>
      validateFlavor(
        goodFlavor({ logoMark: "flavors/logos/acme-mark.svg" }),
        "acme",
      ),
    /logoMark is set but no logo is declared/,
  );
  for (const logoMark of ["", "   ", "../secrets/mark.svg", "mark.png", 7]) {
    assert.throws(
      () =>
        validateFlavor(
          goodFlavor({ logo: "flavors/logos/acme.svg", logoMark }),
          "acme",
        ),
      /logoMark/,
      `logoMark ${JSON.stringify(logoMark)} must be refused`,
    );
  }
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

test("the README exports every variable a flavor can emit", () => {
  // This list drifted the moment `VITE_BUZZ_PRODUCT_LOGO` was added: `eval`
  // set it, nothing exported it, so a build that followed the README shipped a
  // DMG with no mark and no complaint. The failure is silent in both
  // directions — an unexported variable reads exactly like an unset one — so
  // the list has to be checked against the code rather than re-read by a human.
  const readme = readFileSync(
    path.join(desktopDir, "flavors", "README.md"),
    "utf8",
  );
  const fenced = readme
    .split("```")
    .find((section) => section.includes("export "));
  assert.ok(fenced, "the README must show how to export a flavor's env");
  const tokens = fenced.replaceAll("\\\n", " ").split(/\s+/);
  const exported = new Set(
    tokens
      .slice(tokens.indexOf("export") + 1)
      .filter((token) => /^[A-Z][A-Z0-9_]*$/.test(token)),
  );

  const emitted = new Set();
  for (const id of listFlavorIds()) {
    for (const key of Object.keys(
      flavorBuildEnv(loadFlavor(id), () => "<svg/>"),
    )) {
      emitted.add(key);
    }
  }

  assert.deepEqual([...exported].sort(), [...emitted].sort());
  // The table below the snippet is the other copy of the same list.
  for (const key of emitted) {
    assert.ok(
      readme.includes(`\`${key}\``),
      `${key} is exported but the README does not say what it does`,
    );
  }
});

test("every buildable flavor's logo is committed at the path it names", () => {
  // Weaker promise than the icon's — a logo is optional — but the same
  // failure mode: a declared asset that is not in the repo fails the build
  // late, after `pnpm tauri build` has already run for minutes.
  for (const id of listFlavorIds()) {
    const flavor = loadFlavor(id);
    if (flavor.frozen || flavor.example) continue;
    for (const declared of [flavor.logo, flavor.logoLight]) {
      if (declared === undefined) continue;
      assert.ok(
        existsSync(path.join(desktopDir, declared)),
        `${id}: declares ${declared}, which is not in the repo`,
      );
    }
  }
});

test("every buildable flavor's icon is committed at the path it names", () => {
  // The promise a flavor file makes is "a build needs nothing but a checkout
  // and the flavor's name". A declared icon that is not in the repo breaks
  // exactly that, and breaks it late — at `codesign`, in a shell script
  // outside this repo. Frozen and example flavors are exempt: both refuse to
  // build, so neither needs its artwork here.
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
