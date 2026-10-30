import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

import { demoBuildConfig } from "./demo-build-config.mjs";

/**
 * Per-organisation build flavors, loaded from `desktop/flavors/*.json`.
 *
 * A flavor is the complete answer to "which app am I building" — bundle
 * identifier, display name, icon, in-app logo, default relay — committed to
 * the repo so a build needs nothing but a checkout and the flavor's name. The
 * trunk stays neutral: with no flavor selected the build is plain Buzz, and no
 * organisation's name, icon, logo or identifier is baked into any default.
 *
 * ## Why the identifier is both declared and derived
 *
 * `identifier` is written out in each flavor file *and* re-derived here from
 * `demo.name` + `demo.buildId`, and {@link loadFlavor} refuses the file when
 * the two disagree. That is not redundancy for its own sake: the display name
 * and the identifier come from different inputs, so a build can wear one app's
 * name while carrying another app's identifier — and since the identifier is
 * what selects the data directory, keyring and installed `.app`, that build
 * silently overwrites the wrong app on install. It has happened. Declaring the
 * identifier makes the intended identity reviewable in the diff; deriving it
 * makes a mismatch a build failure instead of a delivery.
 */

const desktopDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const flavorsDir = path.join(desktopDir, "flavors");

/** Fields every flavor must declare, with the type each must have. */
const REQUIRED_STRING_FIELDS = [
  "id",
  "displayName",
  "productName",
  "identifier",
  "icon",
  "relayUrl",
];

/**
 * How the in-app mark is painted.
 *
 * `mask` paints the file as a CSS mask over the sidebar's own foreground
 * colour: one asset then reads in both themes, at the price of discarding
 * every colour in it. `color` paints the file as an image, colours intact —
 * which is the only way to ship a mark whose colours *are* the brand, and
 * leaves the asset responsible for reading on whatever surface it lands on.
 */
const LOGO_STYLES = ["mask", "color"];
const DEFAULT_LOGO_STYLE = "mask";
/**
 * Which surface the navigation chrome is painted on. `auto` follows the
 * document's light/dark mode, as Buzz always has; `ink` keeps the rail on the
 * dark surface in both modes, for a brand whose own house style is a black
 * header over a white body.
 */
const CHROME_SURFACES = ["auto", "ink"];
const DEFAULT_CHROME_SURFACE = "auto";

/**
 * The icons a flavor can replace besides the macOS `.icns`, keyed by the file
 * in `src-tauri/icons/` each one stands in for.
 *
 * `tauri.conf.json` names five icons and `icon` only covers one of them, so a
 * Windows or Linux bundle of a fully branded flavor wore the Buzz bee: the
 * `.ico` on the taskbar and in Add/Remove Programs, the PNGs in the Linux
 * launcher. Keying by the stock filename rather than inventing names of our own
 * is what makes the staging rule a copy — `cp <value> src-tauri/icons/<key>` —
 * and what makes a flavor file say out loud which shipped asset it replaces.
 *
 * `icon.icns` is deliberately not a key here. It already has its own required
 * `icon` field, and a second way to declare the same file is a second thing to
 * disagree with the first.
 *
 * {@link flavorBuildEnv} does not carry these: they are files a bundler reads
 * from a fixed path, not values a compiler bakes in, so they are staged into
 * `src-tauri/icons/` by `stage-flavor-icons.mjs` before the bundle is built.
 * `flavor-config.test.mjs` holds this list against `tauri.conf.json`, so a
 * sixth icon added to the bundle cannot quietly stay un-brandable.
 */
export const PLATFORM_ICON_TARGETS = {
  "32x32.png": ".png",
  "128x128.png": ".png",
  "128x128@2x.png": ".png",
  "icon.ico": ".ico",
};

function fail(flavorId, message) {
  throw new Error(`flavor ${flavorId}: ${message}`);
}

/**
 * Whether a declared asset path can reach outside the repo.
 *
 * Split on both separators rather than `path.sep`. A flavor file is data read
 * on whichever host runs the build, so the separator the traversal uses is not
 * the separator this process happens to have: on macOS `path.sep` is `/`, which
 * leaves `..\..\secrets\logo.svg` as a single harmless-looking segment with no
 * `..` in it. The leading-character test covers everything that is rooted
 * somewhere — a POSIX `/`, a Windows drive letter, and the `\` of a
 * root-relative or UNC path — which `path.isAbsolute` only recognises on the
 * platform that owns each form.
 */
function escapesRepo(value) {
  return (
    /^([a-zA-Z]:|[/\\])/.test(value) || value.split(/[/\\]/).includes("..")
  );
}

/** Absolute path of a flavor's JSON file. */
export function flavorPath(flavorId) {
  return path.join(flavorsDir, `${flavorId}.json`);
}

/** Every flavor id present in the repo, sorted. */
export function listFlavorIds() {
  return readdirSync(flavorsDir)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => entry.slice(0, -".json".length))
    .sort();
}

/**
 * Validate a parsed flavor object. Exported so the test suite can exercise
 * malformed shapes without writing files.
 */
export function validateFlavor(flavor, flavorId) {
  if (flavor === null || typeof flavor !== "object" || Array.isArray(flavor)) {
    fail(flavorId, "must be a JSON object");
  }

  for (const field of REQUIRED_STRING_FIELDS) {
    const value = flavor[field];
    if (typeof value !== "string" || value.trim().length === 0) {
      fail(flavorId, `${field} must be a non-empty string`);
    }
  }

  if (flavor.id !== flavorId) {
    fail(flavorId, `id is "${flavor.id}" but the file is ${flavorId}.json`);
  }

  const demo = flavor.demo;
  if (demo === null || typeof demo !== "object" || Array.isArray(demo)) {
    fail(flavorId, "demo must be an object with name and buildId");
  }
  if (typeof demo.name !== "string" || demo.name.trim().length === 0) {
    fail(flavorId, "demo.name must be a non-empty string");
  }
  if (
    typeof demo.buildId !== "string" ||
    !/^[a-f0-9]{16}$/.test(demo.buildId)
  ) {
    fail(
      flavorId,
      "demo.buildId must be sixteen lowercase hexadecimal characters",
    );
  }

  // The cross-check this whole module exists for.
  let derived;
  try {
    derived = demoBuildConfig(demo.name, demo.buildId);
  } catch (error) {
    fail(flavorId, `demo name/buildId rejected: ${error.message}`);
  }
  if (derived.identifier !== flavor.identifier) {
    fail(
      flavorId,
      `identifier "${flavor.identifier}" does not match the identity derived ` +
        `from demo.name/demo.buildId ("${derived.identifier}"). One of the two ` +
        "is wrong — a build with a mismatched identifier installs over a " +
        "different app.",
    );
  }

  if (!/^wss?:\/\/[^\s/]+/.test(flavor.relayUrl)) {
    fail(flavorId, `relayUrl must be a ws:// or wss:// URL`);
  }

  if (escapesRepo(flavor.icon)) {
    fail(flavorId, "icon must be a repo-relative path without `..`");
  }

  if (flavor.platformIcons !== undefined) {
    const icons = flavor.platformIcons;
    if (icons === null || typeof icons !== "object" || Array.isArray(icons)) {
      fail(
        flavorId,
        "platformIcons must be an object keyed by the icon it replaces",
      );
    }
    const targets = Object.keys(PLATFORM_ICON_TARGETS);
    for (const [target, declared] of Object.entries(icons)) {
      if (!(target in PLATFORM_ICON_TARGETS)) {
        fail(
          flavorId,
          `platformIcons key "${target}" is not an icon the bundle reads ` +
            `(expected one of ${targets.join(", ")})`,
        );
      }
      if (typeof declared !== "string" || declared.trim().length === 0) {
        fail(flavorId, `platformIcons["${target}"] must be a non-empty string`);
      }
      if (escapesRepo(declared)) {
        fail(
          flavorId,
          `platformIcons["${target}"] must be a repo-relative path without \`..\``,
        );
      }
      const extension = PLATFORM_ICON_TARGETS[target];
      if (!declared.endsWith(extension)) {
        // The staging copy keeps the key's name, so the bundler reads the file
        // as whatever the key says it is. A `.png` under `icon.ico` is not a
        // wrong-looking icon, it is an undecodable one, and the Windows
        // bundler's own error points at `src-tauri/icons/icon.ico` — a path
        // that has nothing to do with the flavor file that caused it.
        fail(flavorId, `platformIcons["${target}"] must be a ${extension}`);
      }
    }
    const missing = targets.filter((target) => !(target in icons));
    if (missing.length > 0) {
      // All four or none. A flavor that declares the `.ico` alone builds a
      // branded Windows installer and a Linux launcher still showing the bee,
      // and the two platforms are bundled by the same command from the same
      // config — so a partial set is not a smaller scope, it is a build that
      // is half-branded in a way only a Linux user would ever see.
      fail(
        flavorId,
        `platformIcons is missing ${missing.join(", ")} — declare every ` +
          "non-macOS icon or none of them",
      );
    }
  }

  if (flavor.logo !== undefined) {
    if (typeof flavor.logo !== "string" || flavor.logo.trim().length === 0) {
      fail(flavorId, "logo must be a non-empty string");
    }
    if (escapesRepo(flavor.logo)) {
      fail(flavorId, "logo must be a repo-relative path without `..`");
    }
    if (!flavor.logo.endsWith(".svg")) {
      // Both styles below need a vector: the mask style discards every colour
      // in the file, and `brandLogo.ts` accepts only an inline SVG data URL in
      // either case, so a raster would be dropped at runtime with nothing in
      // the build log to say so.
      fail(flavorId, "logo must be an .svg");
    }
  }

  if (flavor.logoLight !== undefined) {
    if (
      typeof flavor.logoLight !== "string" ||
      flavor.logoLight.trim().length === 0
    ) {
      fail(flavorId, "logoLight must be a non-empty string");
    }
    if (escapesRepo(flavor.logoLight)) {
      fail(flavorId, "logoLight must be a repo-relative path without `..`");
    }
    if (!flavor.logoLight.endsWith(".svg")) {
      fail(flavorId, "logoLight must be an .svg");
    }
    if (flavor.logo === undefined) {
      fail(flavorId, "logoLight is set but no logo is declared");
    }
    if (flavor.logoStyle !== "color") {
      // A mask already follows the theme — it is painted in whatever
      // foreground the sidebar has. A second file under `mask` would be a
      // variant that can never be reached, which reads in review as theme
      // support that exists.
      fail(flavorId, "logoLight only applies to logoStyle color");
    }
  }

  if (flavor.logoMark !== undefined) {
    if (
      typeof flavor.logoMark !== "string" ||
      flavor.logoMark.trim().length === 0
    ) {
      fail(flavorId, "logoMark must be a non-empty string");
    }
    if (escapesRepo(flavor.logoMark)) {
      fail(flavorId, "logoMark must be a repo-relative path without `..`");
    }
    if (!flavor.logoMark.endsWith(".svg")) {
      fail(flavorId, "logoMark must be an .svg");
    }
    if (flavor.logo === undefined) {
      // The mark is the wordmark's companion, not a substitute for it. A
      // flavor with a mark and no logo would brand the scattered field and
      // leave the Buzz wordmark in the middle of it.
      fail(flavorId, "logoMark is set but no logo is declared");
    }
  }

  if (flavor.logoMarkLight !== undefined) {
    if (
      typeof flavor.logoMarkLight !== "string" ||
      flavor.logoMarkLight.trim().length === 0
    ) {
      fail(flavorId, "logoMarkLight must be a non-empty string");
    }
    if (escapesRepo(flavor.logoMarkLight)) {
      fail(flavorId, "logoMarkLight must be a repo-relative path without `..`");
    }
    if (!flavor.logoMarkLight.endsWith(".svg")) {
      fail(flavorId, "logoMarkLight must be an .svg");
    }
    if (flavor.logoMark === undefined) {
      fail(flavorId, "logoMarkLight is set but no logoMark is declared");
    }
    if (flavor.logoStyle !== "color") {
      // Same reason `logoLight` is refused under `mask`: a mask is painted in
      // the surrounding foreground, so a second cut could never be displayed.
      fail(flavorId, "logoMarkLight only applies to logoStyle color");
    }
  }

  if (flavor.trayIcon !== undefined) {
    if (
      typeof flavor.trayIcon !== "string" ||
      flavor.trayIcon.trim().length === 0
    ) {
      fail(flavorId, "trayIcon must be a non-empty string");
    }
    if (escapesRepo(flavor.trayIcon)) {
      fail(flavorId, "trayIcon must be a repo-relative path without `..`");
    }
    if (!flavor.trayIcon.endsWith(".png")) {
      // A raster, unlike every other mark in a flavor: this one is decoded by
      // `png` in `src-tauri` and handed to AppKit as pixels. Nothing in the
      // Rust build can rasterise an SVG, so an .svg here would be read as a
      // PNG, fail to decode, and silently fall back to the bee.
      fail(flavorId, "trayIcon must be a .png (a macOS template image)");
    }
  }

  if (flavor.dmgBackground !== undefined) {
    if (
      typeof flavor.dmgBackground !== "string" ||
      flavor.dmgBackground.trim().length === 0
    ) {
      fail(flavorId, "dmgBackground must be a non-empty string");
    }
    if (escapesRepo(flavor.dmgBackground)) {
      fail(flavorId, "dmgBackground must be a repo-relative path without `..`");
    }
    if (!flavor.dmgBackground.endsWith(".png")) {
      fail(flavorId, "dmgBackground must be a .png");
    }
  }

  if (flavor.logoStyle !== undefined) {
    if (!LOGO_STYLES.includes(flavor.logoStyle)) {
      fail(
        flavorId,
        `logoStyle must be one of ${LOGO_STYLES.join(", ")} (default ${DEFAULT_LOGO_STYLE})`,
      );
    }
    if (flavor.logo === undefined) {
      // A style with nothing to style is a half-made edit, and the half that
      // is missing is the visible one.
      fail(flavorId, "logoStyle is set but no logo is declared");
    }
  }

  if (flavor.chromeSurface !== undefined) {
    if (!CHROME_SURFACES.includes(flavor.chromeSurface)) {
      fail(
        flavorId,
        `chromeSurface must be one of ${CHROME_SURFACES.join(", ")} (default ${DEFAULT_CHROME_SURFACE})`,
      );
    }
  }

  if (flavor.accentColor !== undefined) {
    if (
      typeof flavor.accentColor !== "string" ||
      !/^#[0-9a-f]{6}$/.test(flavor.accentColor)
    ) {
      fail(flavorId, "accentColor must be a lowercase #rrggbb hex colour");
    }
  }

  if (flavor.themeLabel !== undefined) {
    if (
      typeof flavor.themeLabel !== "string" ||
      flavor.themeLabel.trim().length === 0
    ) {
      // Refused rather than ignored: an empty label renders a nameless tile in
      // the appearance picker, which reads as a broken theme.
      fail(flavorId, "themeLabel must be a non-empty string");
    }
  }

  if (flavor.celebrationEmojis !== undefined) {
    if (
      !Array.isArray(flavor.celebrationEmojis) ||
      flavor.celebrationEmojis.length === 0
    ) {
      // Refused rather than ignored: an empty list renders a burst of nothing,
      // which reads as a broken animation rather than as an unset field.
      fail(flavorId, "celebrationEmojis must be a non-empty array of strings");
    }
    for (const entry of flavor.celebrationEmojis) {
      if (typeof entry !== "string" || entry.trim().length === 0) {
        fail(flavorId, "celebrationEmojis entries must be non-empty strings");
      }
      if (entry.includes(",")) {
        // The set crosses into the build as one comma-separated variable, so a
        // comma inside an entry would arrive as two entries with nothing in
        // the build log to say so. Refuse here, where the diff is readable,
        // rather than letting `parseCelebrationEmojis` guess the boundary.
        fail(
          flavorId,
          "celebrationEmojis entries must not contain a comma — the set is " +
            "carried as one comma-separated environment variable",
        );
      }
    }
  }

  for (const flag of [
    "frozen",
    "example",
    "autoConnectDefaultRelay",
    "collapseLongPosts",
  ]) {
    if (flavor[flag] !== undefined && typeof flavor[flag] !== "boolean") {
      fail(flavorId, `${flag} must be a boolean`);
    }
  }

  return {
    id: flavor.id,
    displayName: flavor.displayName,
    productName: flavor.productName,
    identifier: flavor.identifier,
    demo: { name: demo.name, buildId: demo.buildId },
    slug: derived.slug,
    keyringService: derived.keyringService,
    nestName: derived.nestName,
    deepLinkScheme: derived.deepLinkScheme,
    cliName: derived.cliName,
    icon: flavor.icon,
    platformIcons:
      flavor.platformIcons === undefined
        ? undefined
        : { ...flavor.platformIcons },
    logo: typeof flavor.logo === "string" ? flavor.logo : undefined,
    logoLight:
      typeof flavor.logoLight === "string" ? flavor.logoLight : undefined,
    logoMark: typeof flavor.logoMark === "string" ? flavor.logoMark : undefined,
    logoMarkLight:
      typeof flavor.logoMarkLight === "string"
        ? flavor.logoMarkLight
        : undefined,
    trayIcon: typeof flavor.trayIcon === "string" ? flavor.trayIcon : undefined,
    dmgBackground:
      typeof flavor.dmgBackground === "string"
        ? flavor.dmgBackground
        : undefined,
    logoStyle:
      flavor.logo === undefined
        ? undefined
        : (flavor.logoStyle ?? DEFAULT_LOGO_STYLE),
    relayUrl: flavor.relayUrl,
    autoConnectDefaultRelay: flavor.autoConnectDefaultRelay === true,
    collapseLongPosts: flavor.collapseLongPosts === true,
    accentColor: flavor.accentColor,
    themeLabel:
      typeof flavor.themeLabel === "string"
        ? flavor.themeLabel.trim()
        : undefined,
    chromeSurface: flavor.chromeSurface ?? DEFAULT_CHROME_SURFACE,
    celebrationEmojis: Array.isArray(flavor.celebrationEmojis)
      ? flavor.celebrationEmojis.map((entry) => entry.trim())
      : undefined,
    frozen: flavor.frozen === true,
    example: flavor.example === true,
    notes: typeof flavor.notes === "string" ? flavor.notes : undefined,
  };
}

/** Load and validate one flavor by id. */
export function loadFlavor(flavorId, readFile = readFileSync) {
  let raw;
  try {
    raw = readFile(flavorPath(flavorId), "utf8");
  } catch {
    const available = listFlavorIds().join(", ");
    throw new Error(
      `flavor ${flavorId}: no such flavor. Available: ${available}`,
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    fail(flavorId, `is not valid JSON: ${error.message}`);
  }

  return validateFlavor(parsed, flavorId);
}

/**
 * Build-time environment for one flavor.
 *
 * These are the variables the Tauri/Vite build actually reads. Keeping the
 * mapping here — rather than in a shell script outside the repo — is what makes
 * "the same flavor always produces the same identity" checkable.
 */
export function flavorBuildEnv(flavor, readFile = readFileSync) {
  const env = {
    // Identity. `BUZZ_BUILD_DEMO_SLUG` is what `build.rs` bakes in, and every
    // runtime identity (keyring, nest, deep link, CLI name) derives from it.
    BUZZ_BUILD_DEMO_SLUG: flavor.slug,
    DEMO_NAME: flavor.demo.name,
    DEMO_BUILD_ID: flavor.demo.buildId,
    // Shell branding: the `.app` folder, CFBundleName, DMG and volume name.
    BRAND_NAME: flavor.displayName,
    // In-app copy (`shared/branding/brand.ts`).
    VITE_BUZZ_PRODUCT_NAME: flavor.productName,
    // The same name again, for the half of the app that is not the frontend:
    // the macOS app menu, the About box and the tray's Open/Quit items are
    // built in Rust and cannot read `import.meta.env`. Without it they fall
    // back to Tauri's `productName`, which `demo-build-config.mjs` derives as
    // `Buzz <demo name>` — which is why a fully branded ki.keriki build still
    // had "Buzz kikeriki" in its About box and "Quit Buzz" in its menu bar.
    BUZZ_BUILD_PRODUCT_NAME: flavor.productName,
    // Default relay baked into the binary (`relay::relay_ws_url`).
    BUZZ_RELAY_URL: flavor.relayUrl,
  };
  if (flavor.autoConnectDefaultRelay) {
    env.BUZZ_BUILD_AUTO_CONNECT_DEFAULT_RELAY = "1";
  }
  if (flavor.collapseLongPosts) {
    // Emitted only when on, like the relay flag above rather than like the
    // chrome surface: the frontend parser treats anything but "1" as off, so
    // there is no second value an unset variable could be confused with.
    env.VITE_BUZZ_COLLAPSE_LONG_POSTS = "1";
  }
  if (flavor.accentColor !== undefined) {
    env.VITE_BUZZ_DEFAULT_ACCENT_COLOR = flavor.accentColor;
  }
  if (flavor.themeLabel !== undefined) {
    // Omitted when unset, unlike the chrome surface: "no label" is not a value
    // the frontend parses but the absence of a rename, and emitting an empty
    // string would make an unconfigured flavor indistinguishable from one that
    // asked for a nameless theme.
    env.VITE_BUZZ_THEME_LABEL = flavor.themeLabel;
  }
  if (flavor.celebrationEmojis !== undefined) {
    // Omitted when unset, like the theme label: "no set" is not a value the
    // frontend parses but the absence of a change, and the stock set is the
    // one the parser already defaults to.
    env.VITE_BUZZ_CELEBRATION_EMOJIS = flavor.celebrationEmojis.join(",");
  }
  // Emitted unconditionally, unlike the logo and the accent: `auto` is a
  // value the frontend parses, and a build that silently inherited whatever
  // the parser defaults to would make a flavor's choice unreadable from the
  // env it produced.
  env.VITE_BUZZ_CHROME_SURFACE = flavor.chromeSurface ?? DEFAULT_CHROME_SURFACE;
  if (flavor.logo !== undefined) {
    // The bytes travel in the variable, not the path: the frontend build runs
    // in a temp directory that `tauri-command.mjs` deletes afterwards, so a
    // path would have to survive a move the build controls and we do not.
    const svg = readFile(path.join(desktopDir, flavor.logo), "utf8");
    env.VITE_BUZZ_PRODUCT_LOGO = `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
    // Emitted with the logo rather than only for the non-default style: the
    // two variables are one setting, and a build that picks up the asset but
    // not the style paints a brand mark in the wrong form silently.
    env.VITE_BUZZ_PRODUCT_LOGO_STYLE = flavor.logoStyle ?? DEFAULT_LOGO_STYLE;
  }
  if (flavor.logoLight !== undefined) {
    const svg = readFile(path.join(desktopDir, flavor.logoLight), "utf8");
    env.VITE_BUZZ_PRODUCT_LOGO_LIGHT = `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
  }
  if (flavor.logoMark !== undefined) {
    const svg = readFile(path.join(desktopDir, flavor.logoMark), "utf8");
    env.VITE_BUZZ_PRODUCT_LOGO_MARK = `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
  }
  if (flavor.logoMarkLight !== undefined) {
    const svg = readFile(path.join(desktopDir, flavor.logoMarkLight), "utf8");
    env.VITE_BUZZ_PRODUCT_LOGO_MARK_LIGHT = `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
  }
  // Paths, not bytes, unlike the logos above: these two are read by a Cargo
  // build script and a packaging shell script, both of which run from a known
  // directory inside the checkout. Repo-relative rather than absolute so the
  // emitted environment is the same on every machine — `build.rs` resolves
  // against `CARGO_MANIFEST_DIR/..` and `package-macos-dmg.sh` against its own
  // `$script_dir/..`, which are both this `desktop/` directory.
  if (flavor.trayIcon !== undefined) {
    env.BUZZ_BUILD_TRAY_ICON = flavor.trayIcon;
  }
  if (flavor.dmgBackground !== undefined) {
    env.DMG_BACKGROUND = flavor.dmgBackground;
  }
  return env;
}

/** Shell-quote a value for `KEY='value'` output. */
function shellQuote(value) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * `export KEY='value'` lines, one per variable, ready to `eval` or `source`.
 *
 * The `export` is the point. These values only do anything in the Vite and
 * Cargo child processes, and a plain `KEY='value'` that is `eval`ed sets a
 * shell variable that no child ever sees — while still reading back correctly
 * from the calling script's own `echo`. That is not a hypothetical: the
 * `20261028.0248` ki.keriki DMG was built by a wrapper that `eval`ed this
 * output and named only four variables on the build command line. It shipped
 * with no brand mark, the stock accent, `auto` chrome and
 * `ws://localhost:3000` as its baked relay, and its build log printed the
 * flavor's real values on the way past.
 *
 * Exporting here rather than documenting an export list makes the one correct
 * usage — `eval "$(flavor-config.mjs <id>)"` — complete on its own. A caller
 * cannot forget a name it never has to type, and the next variable added to
 * {@link flavorBuildEnv} reaches every existing caller with no edit.
 */
export function flavorBuildEnvShell(flavor, readFile = readFileSync) {
  const env = flavorBuildEnv(flavor, readFile);
  return Object.keys(env)
    .sort()
    .map((key) => `export ${key}=${shellQuote(env[key])}`)
    .join("\n");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = process.argv.slice(2);
  const allowFrozen = args.includes("--allow-frozen");
  const asJson = args.includes("--json");
  const flavorId = args.find((arg) => !arg.startsWith("--"));

  if (!flavorId) {
    console.error(
      `Usage: flavor-config.mjs <flavor-id> [--json] [--allow-frozen]\n` +
        `Available flavors: ${listFlavorIds().join(", ")}`,
    );
    process.exit(2);
  }

  try {
    const flavor = loadFlavor(flavorId);
    if (flavor.frozen && !allowFrozen) {
      console.error(
        `flavor ${flavorId} is frozen and is not developed further. ` +
          `Its config is kept so the existing app stays reproducible. ` +
          `Pass --allow-frozen only if you deliberately need to rebuild it.`,
      );
      process.exit(1);
    }
    if (flavor.example) {
      console.error(
        `flavor ${flavorId} is the documented example, not a real app. ` +
          `Copy it to a new file and give it its own demo.buildId.`,
      );
      process.exit(1);
    }
    console.log(
      asJson ? JSON.stringify(flavor, null, 2) : flavorBuildEnvShell(flavor),
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
