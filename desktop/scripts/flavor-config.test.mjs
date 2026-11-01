import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { demoBuildConfig } from "./demo-build-config.mjs";
import {
  FLAVOR_BUNDLE_ICONS,
  PLATFORM_ICON_TARGETS,
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

test("every committed mark's light cut is a real recolour", () => {
  // The same two failures the wordmark's cut has, on the asset that lands on
  // the one surface the ink shell does not reach: the content card, the
  // hosted-community dialog, and a light-mode community switch. A mark that
  // is the dark cut under another name is white on white there, and the
  // screenshot that would show it is the one nobody takes.
  for (const id of listFlavorIds()) {
    const flavor = loadFlavor(id);
    if (flavor.logoMark === undefined || flavor.logoMarkLight === undefined) {
      continue;
    }
    const dark = readFileSync(path.join(desktopDir, flavor.logoMark), "utf8");
    const light = readFileSync(
      path.join(desktopDir, flavor.logoMarkLight),
      "utf8",
    );
    assert.notEqual(
      light,
      dark,
      `${id}: the mark's light cut is byte-identical to the dark one`,
    );
    const body = light.split("<defs>")[0];
    assert.doesNotMatch(
      body,
      /fill="(?:white|#[fF]{3,6}\b|#[fF]5[fF]5[fF]5\b)"/,
      `${id}: the mark's light cut still paints near-white ink`,
    );
    // And the dark cut must still be the negative one, or the pair is two
    // copies of the same drawing in the other direction.
    assert.match(
      dark.split("<defs>")[0],
      /fill="(?:white|#[fF]{3,6}\b|#[fF]5[fF]5[fF]5\b)"/,
      `${id}: the mark's dark cut paints no near-white ink`,
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

test("only the flavors that drew a mark send one to the startup gates", () => {
  // The loading screen and the onboarding field fall back to the Buzz bee
  // when no mark reaches the build, so "Zeniad and the trunk keep the bee" is
  // a fact about which flavors emit this variable. Bound to the committed
  // files so giving another flavor a mark is a deliberate edit.
  const expected = new Set(["ki.keriki"]);
  for (const id of listFlavorIds()) {
    const flavor = loadFlavor(id);
    const emitted =
      flavorBuildEnv(flavor, () => "<svg/>").VITE_BUZZ_PRODUCT_LOGO_MARK !==
      undefined;
    assert.equal(
      emitted,
      expected.has(id),
      `${id}: whether a brand mark reaches the startup gates`,
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
      BUZZ_BUILD_BUNDLE_NAME: "ki.keriki",
      BUZZ_BUILD_DEMO_SLUG: "kikeriki-857f685ce21f5788",
      BUZZ_BUILD_PRODUCT_NAME: "ki.keriki",
      BUZZ_BUILD_TRAY_ICON: "flavors/icons/ki.keriki-tray.png",
      BUZZ_RELAY_URL: "wss://relay.ki.keriki.de",
      DEMO_BUILD_ID: "857f685ce21f5788",
      DEMO_NAME: "kikeriki",
      DMG_BACKGROUND: "flavors/icons/ki.keriki-dmg-background.png",
      VITE_BUZZ_CELEBRATION_EMOJIS: "🎉,✨,🔑,💛,✅,🔒",
      VITE_BUZZ_CHROME_SURFACE: "ink",
      VITE_BUZZ_COLLAPSE_LONG_POSTS: "1",
      VITE_BUZZ_DEFAULT_ACCENT_COLOR: "#d4f247",
      VITE_BUZZ_PRODUCT_LOGO: "data:image/svg+xml;base64,PHN2Zy8+",
      VITE_BUZZ_PRODUCT_LOGO_LIGHT: "data:image/svg+xml;base64,PHN2Zy8+",
      VITE_BUZZ_PRODUCT_LOGO_MARK: "data:image/svg+xml;base64,PHN2Zy8+",
      VITE_BUZZ_PRODUCT_LOGO_MARK_LIGHT: "data:image/svg+xml;base64,PHN2Zy8+",
      VITE_BUZZ_PRODUCT_LOGO_STYLE: "color",
      VITE_BUZZ_PRODUCT_NAME: "ki.keriki",
      VITE_BUZZ_THEME_LABEL: "kikeriki",
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

test("the mark's light cut needs a mark, a colour style, and its own ink", () => {
  const both = validateFlavor(
    goodFlavor({
      logo: "flavors/logos/acme.svg",
      logoStyle: "color",
      logoMark: "flavors/logos/acme-mark.svg",
      logoMarkLight: "flavors/logos/acme-mark-light.svg",
    }),
    "acme",
  );
  assert.equal(
    flavorBuildEnv(both, () => "<svg/>").VITE_BUZZ_PRODUCT_LOGO_MARK_LIGHT,
    "data:image/svg+xml;base64,PHN2Zy8+",
  );

  // Omitted, not emptied — the same contract the wordmark's cut has. A build
  // with one cut paints it on every surface, which is right for a mark drawn
  // to read on both.
  const oneCut = flavorBuildEnv(
    validateFlavor(
      goodFlavor({
        logo: "flavors/logos/acme.svg",
        logoStyle: "color",
        logoMark: "flavors/logos/acme-mark.svg",
      }),
      "acme",
    ),
    () => "<svg/>",
  );
  assert.ok(!("VITE_BUZZ_PRODUCT_LOGO_MARK_LIGHT" in oneCut));

  assert.throws(
    () =>
      validateFlavor(
        goodFlavor({
          logo: "flavors/logos/acme.svg",
          logoStyle: "color",
          logoMarkLight: "flavors/logos/acme-mark-light.svg",
        }),
        "acme",
      ),
    /logoMarkLight is set but no logoMark is declared/,
  );
  assert.throws(
    () =>
      validateFlavor(
        goodFlavor({
          logo: "flavors/logos/acme.svg",
          logoStyle: "mask",
          logoMark: "flavors/logos/acme-mark.svg",
          logoMarkLight: "flavors/logos/acme-mark-light.svg",
        }),
        "acme",
      ),
    /logoMarkLight only applies to logoStyle color/,
  );
  for (const value of ["", "   ", "../secrets/mark.svg", "mark.png", 7]) {
    assert.throws(
      () =>
        validateFlavor(
          goodFlavor({
            logo: "flavors/logos/acme.svg",
            logoStyle: "color",
            logoMark: "flavors/logos/acme-mark.svg",
            logoMarkLight: value,
          }),
          "acme",
        ),
      /logoMarkLight/,
      `logoMarkLight ${JSON.stringify(value)} must be refused`,
    );
  }
});

test("the native shell gets the product name and the tray glyph as paths", () => {
  // Three variables the frontend never sees. The name goes to `build.rs` for
  // the app menu, the About box and the tray items; the glyph and the DMG
  // panel travel as repo-relative paths because a Cargo build script and a
  // packaging shell script both resolve them from inside the checkout — and
  // an absolute path would make the emitted environment differ per machine.
  const branded = flavorBuildEnv(
    validateFlavor(
      goodFlavor({
        productName: "Acme",
        trayIcon: "flavors/icons/acme-tray.png",
        dmgBackground: "flavors/icons/acme-dmg.png",
      }),
      "acme",
    ),
  );
  assert.equal(branded.BUZZ_BUILD_PRODUCT_NAME, "Acme");
  assert.equal(branded.BUZZ_BUILD_TRAY_ICON, "flavors/icons/acme-tray.png");
  assert.equal(branded.DMG_BACKGROUND, "flavors/icons/acme-dmg.png");

  // The two assets are optional and absent means "keep the bee" / "keep the
  // stock panel"; the name is not, because every flavor declares one.
  const plain = flavorBuildEnv(validateFlavor(goodFlavor(), "acme"));
  assert.ok(!("BUZZ_BUILD_TRAY_ICON" in plain));
  assert.ok(!("DMG_BACKGROUND" in plain));
  assert.equal(plain.BUZZ_BUILD_PRODUCT_NAME, plain.VITE_BUZZ_PRODUCT_NAME);

  // A raster, deliberately: `brand.rs` decodes it with `png`, and an .svg
  // here would fail to decode and silently fall back to the Buzz bee.
  for (const trayIcon of ["", "   ", "../secrets/tray.png", "tray.svg", 7]) {
    assert.throws(
      () => validateFlavor(goodFlavor({ trayIcon }), "acme"),
      /trayIcon/,
      `trayIcon ${JSON.stringify(trayIcon)} must be refused`,
    );
  }
  for (const dmgBackground of ["", "   ", "../secrets/bg.png", "bg.svg", 7]) {
    assert.throws(
      () => validateFlavor(goodFlavor({ dmgBackground }), "acme"),
      /dmgBackground/,
      `dmgBackground ${JSON.stringify(dmgBackground)} must be refused`,
    );
  }
});

test("the accent variable is omitted when the flavor sets no colour", () => {
  const env = flavorBuildEnv(validateFlavor(goodFlavor(), "acme"));
  assert.equal(env.VITE_BUZZ_DEFAULT_ACCENT_COLOR, undefined);
});

test("a theme label renames the Buzz pair for that flavor only", () => {
  const labelled = flavorBuildEnv(
    validateFlavor(goodFlavor({ themeLabel: "  Acme  " }), "acme"),
  );
  assert.equal(labelled.VITE_BUZZ_THEME_LABEL, "Acme");

  // Omitted, not emptied. The frontend reads absence as "keep calling it
  // Buzz"; an empty string would be a flavor asking for a nameless theme.
  const plain = flavorBuildEnv(validateFlavor(goodFlavor(), "acme"));
  assert.equal(plain.VITE_BUZZ_THEME_LABEL, undefined);
  assert.ok(!("VITE_BUZZ_THEME_LABEL" in plain));
});

test("a theme label that would render nothing is refused", () => {
  for (const themeLabel of ["", "   ", 7, null, {}]) {
    assert.throws(
      () => validateFlavor(goodFlavor({ themeLabel }), "acme"),
      /themeLabel must be a non-empty string/,
      `themeLabel ${JSON.stringify(themeLabel)} must be refused`,
    );
  }
});

test("only ki.keriki renames the theme; the others keep Buzz", () => {
  // The scope of the rename, bound to the committed files rather than to a
  // sentence in a PR. Zeniad and the OSS trunk were explicitly to stay as
  // they are.
  const labels = Object.fromEntries(
    listFlavorIds().map((id) => [
      id,
      flavorBuildEnv(loadFlavor(id), () => "<svg/>").VITE_BUZZ_THEME_LABEL,
    ]),
  );
  assert.equal(labels["ki.keriki"], "kikeriki");
  assert.equal(labels.zeniad, undefined);
  assert.equal(labels["KI.keri.KI"], undefined);
});

test("both active flavors clamp long posts; the frozen one and the trunk do not", () => {
  // The scope of the clamp, bound to the committed files. Zeniad joined
  // ki.keriki here on Ian's go; `KI.keri.KI` is frozen, so it keeps the
  // reading density it shipped with, and a flavorless trunk build gets no
  // variable at all. Adding a flavor to this set is an edit to this line.
  const expected = new Set(["zeniad", "ki.keriki"]);
  for (const id of listFlavorIds()) {
    const flavor = loadFlavor(id);
    assert.equal(
      flavor.collapseLongPosts,
      expected.has(id),
      `${id}: declared collapseLongPosts`,
    );
    // Asserted through the build env too, not just the resolved flavor: the
    // frontend reads the variable, and "off" is its absence rather than a
    // second value.
    assert.equal(
      flavorBuildEnv(flavor, () => "<svg/>").VITE_BUZZ_COLLAPSE_LONG_POSTS,
      expected.has(id) ? "1" : undefined,
      `${id}: the clamp that reaches the build`,
    );
  }
});

test("shell output exports and quotes every value", () => {
  const flavor = validateFlavor(
    goodFlavor({ displayName: "Acme's App" }),
    "acme",
  );
  const lines = flavorBuildEnvShell(flavor).split("\n");
  assert.ok(lines.includes(`export BRAND_NAME='Acme'\\''s App'`));
  for (const line of lines) {
    assert.match(line, /^export [A-Z0-9_]+='.*'$/);
  }
  // Not one `export` keyword somewhere in the output — one per variable. A
  // single `export A=1 B=2 …` line would satisfy the regex above only by
  // accident, and a partially-exported block is the failure this guards.
  assert.deepEqual(
    lines.map((line) => line.slice("export ".length).split("=")[0]).sort(),
    Object.keys(flavorBuildEnv(flavor)).sort(),
  );
});

test("eval of the CLI output hands every variable to a child process", (t) => {
  // The test the `20261028.0248` ki.keriki DMG needed. Its wrapper did
  // `eval "$(flavor-config.mjs ki.keriki)"`, printed the flavor's values back
  // from its own shell, and shipped a build whose frontend and build.rs had
  // seen none of them: `eval` of a bare `KEY='value'` sets a shell variable,
  // and only an exported one crosses into `pnpm` or `cargo`. An unexported
  // variable and an unset one are indistinguishable to the build and to the
  // log, so this asserts the crossing itself rather than the text that
  // precedes it.
  if (process.platform === "win32") {
    t.skip("flavor builds are POSIX-only; no bash to eval with");
    return;
  }
  const flavorId = "ki.keriki";
  const expected = flavorBuildEnv(loadFlavor(flavorId));
  const script =
    `eval "$(node ${JSON.stringify(path.join(desktopDir, "scripts", "flavor-config.mjs"))} ${flavorId})"\n` +
    // `node -p` is the child. It can only read what crossed the boundary.
    `node -p 'JSON.stringify(process.env)'\n`;
  const childEnv = JSON.parse(
    execFileSync("bash", ["-c", script], {
      cwd: desktopDir,
      encoding: "utf8",
      // Strip the operator's own BUZZ_*/VITE_* so a variable already present
      // in this process cannot stand in for one the flavor failed to export.
      env: Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) => !/^(BUZZ_|VITE_|DEMO_|BRAND_)/.test(key),
        ),
      ),
    }),
  );
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(childEnv[key], value, `${key} did not reach the child`);
  }
});

test("the README documents every variable a flavor can emit", () => {
  // The export list this test used to bind lived in the README, and binding it
  // only ever protected the README: a wrapper written without reading it was
  // still free to drop a name, which is exactly how `20261028.0248` shipped.
  // `flavorBuildEnvShell` now exports on its own, so what is left to check is
  // that each variable is described somewhere a reader can find it.
  const readme = readFileSync(
    path.join(desktopDir, "flavors", "README.md"),
    "utf8",
  );
  const emitted = new Set();
  for (const id of listFlavorIds()) {
    for (const key of Object.keys(
      flavorBuildEnv(loadFlavor(id), () => "<svg/>"),
    )) {
      emitted.add(key);
    }
  }
  assert.ok(emitted.size > 0);
  for (const key of emitted) {
    assert.ok(
      readme.includes(`\`${key}\``),
      `${key} is emitted but the README does not say what it does`,
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
    for (const declared of [
      flavor.logo,
      flavor.logoLight,
      flavor.logoMark,
      flavor.logoMarkLight,
      flavor.trayIcon,
      flavor.dmgBackground,
    ]) {
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

test("a flavor's celebration set crosses as one comma-separated variable", () => {
  const set = flavorBuildEnv(
    validateFlavor(
      goodFlavor({ celebrationEmojis: [" 🎉 ", "✨", "🔑"] }),
      "acme",
    ),
  );
  assert.equal(set.VITE_BUZZ_CELEBRATION_EMOJIS, "🎉,✨,🔑");

  // Omitted, not emptied — same contract as the theme label. The frontend
  // reads absence as "keep the stock set", which includes the bee.
  const plain = flavorBuildEnv(validateFlavor(goodFlavor(), "acme"));
  assert.equal(plain.VITE_BUZZ_CELEBRATION_EMOJIS, undefined);
  assert.ok(!("VITE_BUZZ_CELEBRATION_EMOJIS" in plain));
});

test("an entry containing a comma is refused, not silently split", () => {
  // The transport is one comma-separated string, so a comma inside an entry
  // would arrive at `parseCelebrationEmojis` as two entries with nothing in
  // the build log to say so. Refuse where the diff is readable instead.
  assert.throws(
    () => validateFlavor(goodFlavor({ celebrationEmojis: ["🎉,✨"] }), "acme"),
    /must not contain a comma/,
  );
});

test("a celebration set that would render nothing is refused", () => {
  for (const celebrationEmojis of [
    [],
    "",
    "🎉",
    7,
    null,
    {},
    [""],
    ["  "],
    [7],
  ]) {
    assert.throws(
      () => validateFlavor(goodFlavor({ celebrationEmojis }), "acme"),
      /celebrationEmojis/,
      `celebrationEmojis ${JSON.stringify(celebrationEmojis)} must be refused`,
    );
  }
});

test("only ki.keriki replaces the burst; the others keep the bee", () => {
  // Bound to the committed files, like the theme-label scope test above.
  // Zeniad and the OSS trunk were explicitly to stay as they are.
  const sets = Object.fromEntries(
    listFlavorIds().map((id) => [
      id,
      flavorBuildEnv(loadFlavor(id), () => "<svg/>")
        .VITE_BUZZ_CELEBRATION_EMOJIS,
    ]),
  );
  assert.equal(sets["ki.keriki"], "🎉,✨,🔑,💛,✅,🔒");
  assert.ok(!sets["ki.keriki"].includes("🐝"), "the bee must be gone");
  assert.ok(!sets["ki.keriki"].includes("🍯"), "the honey must be gone");
  assert.equal(sets.zeniad, undefined);
  assert.equal(sets["KI.keri.KI"], undefined);
});

/** A PNG's IHDR dimensions, read from the file's own bytes. */
function pngSize(file) {
  const bytes = readFileSync(file);
  assert.ok(
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    `${file} is not a PNG`,
  );
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** The sizes inside an `.ico`, read from its directory. */
function icoSizes(file) {
  const bytes = readFileSync(file);
  assert.equal(bytes.readUInt16LE(0), 0, `${file} is not an .ico`);
  assert.equal(bytes.readUInt16LE(2), 1, `${file} is not an .ico`);
  const count = bytes.readUInt16LE(4);
  return Array.from({ length: count }, (_, index) => {
    const entry = 6 + index * 16;
    // 0 means 256 in an icon directory: the field is one byte.
    return bytes[entry] === 0 ? 256 : bytes[entry];
  }).sort((a, b) => a - b);
}

test("platformIcons covers exactly the icons some build reads", () => {
  // The drift gate. `PLATFORM_ICON_TARGETS` is a hand-written list and the two
  // `bundle.icon` lists are what actually decide which files get bundled, so a
  // sixth icon added to either would otherwise stay un-brandable with nothing
  // failing — the next Windows or Linux build would quietly ship one Buzz
  // asset. Asserting equality in both directions is the point: a missing key
  // and a key for a file no build reads are different bugs.
  //
  // Both lists, not just the trunk's: a flavored Linux build replaces the
  // array wholesale to get real `hicolor` sizes, and its extra entries are
  // exactly the ones with no other gate on them.
  const conf = JSON.parse(
    readFileSync(path.join(desktopDir, "src-tauri", "tauri.conf.json"), "utf8"),
  );
  const bundled = [
    ...new Set(
      [...conf.bundle.icon, ...FLAVOR_BUNDLE_ICONS].map((entry) =>
        path.basename(entry),
      ),
    ),
  ].sort();
  const declarable = [
    ...Object.keys(PLATFORM_ICON_TARGETS),
    "icon.icns",
  ].sort();
  assert.deepEqual(
    declarable,
    bundled,
    "every icon some build reads must be one a flavor can replace — " +
      "`icon.icns` through `icon`, the rest through `platformIcons`",
  );
});

test("every icon a flavored build reads is a file in the repo", () => {
  // The list names paths the *bundler* resolves against `src-tauri/`, and a
  // missing one fails twenty minutes into a Linux build with an error naming
  // `src-tauri/icons/...` rather than this list.
  for (const entry of FLAVOR_BUNDLE_ICONS) {
    const absolute = path.join(desktopDir, "src-tauri", entry);
    assert.ok(
      existsSync(absolute),
      `${entry} is declared for a flavored bundle but is not in the repo`,
    );
  }
});

test("a flavored build declares no @2x icon and does declare 256 and 512", () => {
  // The fix itself. Tauri derives a `hicolor` directory from a PNG's real
  // dimensions plus whether the *filename* says `@2x`, so `128x128@2x.png`
  // (a 256px image) lands in `hicolor/256x256@2/` — not a directory the icon
  // theme specification defines, and read by nothing. Dropping it and naming
  // the same artwork `256x256.png` is what gives the launcher something above
  // 128px to scale from.
  const names = FLAVOR_BUNDLE_ICONS.map((entry) => path.basename(entry));
  assert.deepEqual(
    names.filter((name) => name.includes("@")),
    [],
    "an `@2x` entry lands in a hicolor directory no icon lookup reads",
  );
  for (const required of ["256x256.png", "512x512.png"]) {
    assert.ok(
      names.includes(required),
      `a flavored build must ship ${required}`,
    );
  }
});

test("no two live flavors claim one executable name", () => {
  // The property Linux coexistence rests on, and the one `demoBuildConfig`
  // cannot check by itself: it sees one flavor at a time, and two flavors with
  // the same `demo.name` and different build IDs derive different identifiers
  // (so the existing cross-check passes) and the *same* binary name — which on
  // Linux is one `/usr/bin` entry claimed by two packages.
  const live = listFlavorIds()
    .map((id) => loadFlavor(id))
    .filter((flavor) => !flavor.example);
  const byBinaryName = new Map();
  for (const flavor of live) {
    const clash = byBinaryName.get(flavor.mainBinaryName);
    assert.equal(
      clash,
      undefined,
      `${flavor.id} and ${clash?.id} both install /usr/bin/${flavor.mainBinaryName}`,
    );
    byBinaryName.set(flavor.mainBinaryName, flavor);
  }
  assert.ok(byBinaryName.size >= 2, "expected more than one live flavor");
});

test("the bundle name a flavored build resolves its sidecars from is emitted", () => {
  // `build_identity::sidecar_dirs` reads this to find
  // `/usr/lib/<bundle name>/sidecars`, where a flavored `.deb` keeps the
  // sidecars it cannot put in `/usr/bin`. It is `displayName`, which is what
  // Tauri's `productName` becomes — deliberately not `productName` here, the
  // name the app calls itself in its own copy, which a flavor may set
  // differently.
  const flavor = loadFlavor("ki.keriki");
  const env = flavorBuildEnv(flavor);
  assert.equal(env.BUZZ_BUILD_BUNDLE_NAME, flavor.displayName);
  assert.equal(env.BUZZ_BUILD_BUNDLE_NAME, "ki.keriki");
});

test("a flavor's platform icons survive validation unchanged", () => {
  const icons = {
    "32x32.png": "flavors/icons/acme-32x32.png",
    "64x64.png": "flavors/icons/acme-64x64.png",
    "128x128.png": "flavors/icons/acme-128x128.png",
    "128x128@2x.png": "flavors/icons/acme-128x128@2x.png",
    "256x256.png": "flavors/icons/acme-256x256.png",
    "512x512.png": "flavors/icons/acme-512x512.png",
    "icon.ico": "flavors/icons/acme.ico",
  };
  const flavor = validateFlavor(goodFlavor({ platformIcons: icons }), "acme");
  assert.deepEqual(flavor.platformIcons, icons);

  // Absent stays absent rather than becoming an empty object: "this flavor is
  // macOS-only" and "this flavor replaces nothing" read the same downstream,
  // and `stagedIcons` would iterate an empty map either way, so the only
  // reader that can tell them apart is a human looking at the flavor file.
  assert.equal(validateFlavor(goodFlavor(), "acme").platformIcons, undefined);
});

test("a malformed platformIcons is refused", () => {
  const full = {
    "32x32.png": "flavors/icons/acme-32x32.png",
    "64x64.png": "flavors/icons/acme-64x64.png",
    "128x128.png": "flavors/icons/acme-128x128.png",
    "128x128@2x.png": "flavors/icons/acme-128x128@2x.png",
    "256x256.png": "flavors/icons/acme-256x256.png",
    "512x512.png": "flavors/icons/acme-512x512.png",
    "icon.ico": "flavors/icons/acme.ico",
  };
  for (const platformIcons of ["", [], null, 7, [full]]) {
    assert.throws(
      () => validateFlavor(goodFlavor({ platformIcons }), "acme"),
      /platformIcons must be an object/,
      `platformIcons ${JSON.stringify(platformIcons)} must be refused`,
    );
  }

  assert.throws(
    () =>
      validateFlavor(
        goodFlavor({ platformIcons: { ...full, "icon.icns": "x.icns" } }),
        "acme",
      ),
    /platformIcons key "icon.icns" is not an icon the bundle reads/,
    "the macOS icon has its own field and must not be declarable twice",
  );
  assert.throws(
    () =>
      validateFlavor(
        goodFlavor({ platformIcons: { ...full, "1024x1024.png": "x.png" } }),
        "acme",
      ),
    /platformIcons key "1024x1024.png" is not an icon the bundle reads/,
    "a plausible size that no `bundle.icon` list names is still refused",
  );

  for (const bad of ["", "   ", 7, null]) {
    assert.throws(
      () =>
        validateFlavor(
          goodFlavor({ platformIcons: { ...full, "icon.ico": bad } }),
          "acme",
        ),
      /platformIcons\["icon.ico"\] must be a non-empty string/,
      `icon.ico ${JSON.stringify(bad)} must be refused`,
    );
  }

  // Same traversal corpus the single-icon field is held to, including the
  // Windows forms `path.isAbsolute` does not recognise on this host.
  for (const suffix of [
    "../secrets/acme",
    "..\\secrets\\acme",
    "/etc/acme",
    "\\\\server\\share\\acme",
    "C:\\acme",
  ]) {
    assert.throws(
      () =>
        validateFlavor(
          goodFlavor({
            platformIcons: { ...full, "icon.ico": `${suffix}.ico` },
          }),
          "acme",
        ),
      /platformIcons\["icon.ico"\] must be a repo-relative path without/,
      `icon.ico ${suffix}.ico must be refused`,
    );
  }

  // The staging copy renames the file to the key, so the bundler reads it as
  // whatever the key claims. A PNG under `icon.ico` is undecodable, not ugly.
  assert.throws(
    () =>
      validateFlavor(
        goodFlavor({ platformIcons: { ...full, "icon.ico": "a/acme.png" } }),
        "acme",
      ),
    /platformIcons\["icon.ico"\] must be a \.ico/,
    "a .png declared under icon.ico must be refused",
  );
  assert.throws(
    () =>
      validateFlavor(
        goodFlavor({ platformIcons: { ...full, "32x32.png": "a/acme.ico" } }),
        "acme",
      ),
    /platformIcons\["32x32.png"\] must be a \.png/,
    "an .ico declared under 32x32.png must be refused",
  );
});

test("a partial platformIcons is refused, one key at a time", () => {
  const full = {
    "32x32.png": "flavors/icons/acme-32x32.png",
    "64x64.png": "flavors/icons/acme-64x64.png",
    "128x128.png": "flavors/icons/acme-128x128.png",
    "128x128@2x.png": "flavors/icons/acme-128x128@2x.png",
    "256x256.png": "flavors/icons/acme-256x256.png",
    "512x512.png": "flavors/icons/acme-512x512.png",
    "icon.ico": "flavors/icons/acme.ico",
  };
  // Every key dropped in turn, not just one: the `.ico` alone is the tempting
  // half (Windows is the platform anyone asks about) and the PNGs alone is the
  // one a Linux-only job would produce, and both ship a bundle that is branded
  // on one OS and wearing the bee on the other.
  for (const omitted of Object.keys(full)) {
    const partial = { ...full };
    delete partial[omitted];
    assert.throws(
      () => validateFlavor(goodFlavor({ platformIcons: partial }), "acme"),
      new RegExp(
        `platformIcons is missing ${omitted.replace(/[.@]/g, "\\$&")}`,
      ),
      `platformIcons without ${omitted} must be refused`,
    );
  }
  assert.throws(
    () => validateFlavor(goodFlavor({ platformIcons: {} }), "acme"),
    new RegExp(
      "platformIcons is missing 32x32\\.png, 64x64\\.png, 128x128\\.png, " +
        "128x128@2x\\.png, 256x256\\.png, 512x512\\.png, icon\\.ico",
    ),
    "an empty platformIcons must be refused, naming every one",
  );
});

test("every declared platform icon is committed, and is the size its key promises", () => {
  // The dimensions half matters as much as the existence half. Tauri's Linux
  // bundler installs `128x128.png` into `.../icons/128x128/apps/` by that
  // name, not by what is inside the file, so a 256px image copied over it is
  // installed into the 128px directory and rendered by the launcher at
  // whatever scale it assumes — a wrong icon size is invisible on the build
  // machine and only shows up in somebody's app menu.
  // `128x128@2x.png` and `256x256.png` are both 256px images of the same
  // artwork, and that is the point of having both: the `@2x` *filename* makes
  // Tauri write it to `hicolor/256x256@2/`, a directory the icon theme
  // specification does not define, so the second name is what gets a 256px
  // icon somewhere a launcher reads.
  const expectedPngSize = {
    "32x32.png": 32,
    "64x64.png": 64,
    "128x128.png": 128,
    "128x128@2x.png": 256,
    "256x256.png": 256,
    "512x512.png": 512,
  };
  const stockIco = icoSizes(
    path.join(desktopDir, "src-tauri", "icons", "icon.ico"),
  );
  let checked = 0;
  for (const id of listFlavorIds()) {
    const flavor = loadFlavor(id);
    if (flavor.frozen || flavor.example) continue;
    for (const [target, declared] of Object.entries(
      flavor.platformIcons ?? {},
    )) {
      const file = path.join(desktopDir, declared);
      assert.ok(
        existsSync(file),
        `${id}: declares ${declared}, which is not in the repo`,
      );
      if (target === "icon.ico") {
        assert.deepEqual(
          icoSizes(file),
          stockIco,
          `${id}: ${declared} must carry the same sizes the stock icon.ico ` +
            "does, or Windows picks a size we did not draw",
        );
      } else {
        const size = expectedPngSize[target];
        assert.deepEqual(
          pngSize(file),
          { width: size, height: size },
          `${id}: ${declared} stands in for ${target} and must be ${size}px`,
        );
      }
      checked += 1;
    }
  }
  // ki.keriki's seven. Without this the loop passes vacuously the day a
  // refactor stops returning `platformIcons`, which is the same unfalsifiable
  // shape as a guard whose skip is gated on the thing it asserts.
  assert.equal(checked, 7, "ki.keriki's seven platform icons must be checked");
});
