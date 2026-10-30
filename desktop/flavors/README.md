# App flavors

A **flavor** is the complete answer to "which app am I building": bundle
identifier, display name, icon, in-app logo, and default relay. One JSON file
per app, committed here, so a build needs nothing but a checkout and the
flavor's name.

The trunk stays neutral. With no flavor selected the build is plain Buzz — no
organisation's name, icon, identifier or relay is baked into any default. A
flavor is always an explicit choice at build time.

## The files

| File | App | Status |
|---|---|---|
| `zeniad.json` | Zeniad | active |
| `ki.keriki.json` | ki.keriki | active |
| `KI.keri.KI.json` | KI.keri.KI | **frozen** — kept for reproducibility, not developed further |
| `example-client.json` | — | **example** — the documented template; building it is refused |

## Fields

```jsonc
{
  "id": "acme",                    // must equal the filename without .json
  "displayName": "Acme",           // .app folder name, CFBundleName, DMG + volume name
  "productName": "Acme",           // in-app copy (shared/branding/brand.ts)
  "identifier": "xyz.block.buzz.app.demo.acme-00112233445566aa",
  "demo": {
    "name": "Acme",                // ASCII letters, digits, spaces, hyphens
    "buildId": "00112233445566aa"  // exactly 16 lowercase hex characters
  },
  "icon": "flavors/icons/acme.icns",      // repo-relative, no `..`
  "logo": "flavors/logos/acme.svg",       // optional in-app mark, see flavors/logos/
  "logoStyle": "mask",                    // optional, "mask" (default) or "color"
  "logoLight": "flavors/logos/acme-light.svg", // optional light-theme cut, "color" only
  "logoMark": "flavors/logos/acme-mark.svg",   // optional glyph-sized companion mark
  "logoMarkLight": "flavors/logos/acme-mark-light.svg", // optional light cut of it, "color" only
  "trayIcon": "flavors/icons/acme-tray.png",   // optional macOS menu-bar template PNG
  "dmgBackground": "flavors/icons/acme-dmg.png", // optional DMG window panel
  "relayUrl": "wss://relay.acme.test",    // default relay baked into the binary
  "autoConnectDefaultRelay": true,        // optional, default false
  "accentColor": "#3b82f6",               // optional, lowercase #rrggbb
  "themeLabel": "Acme",                   // optional — renames the Buzz theme pair
  "celebrationEmojis": ["🎉", "✨"],       // optional — the backup-test burst
  "collapseLongPosts": true,              // optional, default false
  "frozen": false,                        // optional — refuses to build
  "example": false,                       // optional — refuses to build
  "notes": "free text for reviewers"      // optional
}
```

### Why `identifier` is written out *and* derived

`identifier` is declared in the file **and** re-derived from `demo.name` +
`demo.buildId` by `scripts/flavor-config.mjs`, which refuses the file when the
two disagree.

That is deliberate. The display name and the identifier come from different
inputs, so a build can wear one app's name while carrying another app's
identifier — and the identifier is what selects the data directory, the keyring
service and the installed `.app`. Such a build silently installs over the wrong
app. Declaring the identifier makes the intended identity reviewable in the
diff; deriving it makes a mismatch a build failure instead of a delivery.

`scripts/flavor-config.test.mjs` applies the same check to every committed
flavor, so a bad edit fails the test suite rather than a release.

## Adding a client

1. Copy `example-client.json` to `<client>.json`.
2. Set `id` to the new filename, and give it **its own** `demo.buildId` —
   16 fresh lowercase hex characters (`openssl rand -hex 8`). Reusing another
   flavor's build id produces another app with the same identity.
3. Set `identifier` to `xyz.block.buzz.app.demo.<slug>-<buildId>`, where
   `<slug>` is `demo.name` lowercased with non-alphanumerics collapsed to `-`.
   If you get it wrong, the loader tells you the derived value.
4. Drop the `example` flag and the example `notes`.
5. Put the icon at the path `icon` names. If the app should carry an in-app
   mark too, add `logo` and read `flavors/logos/README.md` first — the file
   has to be an SVG, and which of the two `logoStyle` values it needs follows
   from the artwork rather than from taste.
6. Run `node scripts/flavor-config.test.mjs` and confirm it passes.

## Building

`flavor-config.mjs` prints the build environment for a flavor:

```sh
cd desktop
node scripts/flavor-config.mjs zeniad          # export KEY='value' lines
node scripts/flavor-config.mjs zeniad --json   # the resolved flavor
eval "$(node scripts/flavor-config.mjs zeniad)"
```

That one `eval` is the whole step: every line carries its own `export`, so the
variables cross into the Vite and Cargo child processes that are the only
things which read them, and a variable added to `flavorBuildEnv` later reaches
this caller with no edit here.

It used to be `eval` plus a hand-written `export` list, and the list is how the
`20261028.0248` ki.keriki DMG went wrong: a build wrapper written without
reading this file `eval`ed the output, named four variables on its build
command line, and shipped an app with no brand mark, the stock accent, `auto`
chrome and `ws://localhost:3000` as its baked relay. Nothing failed. An
unexported variable and an unset one are indistinguishable to the build, and
the wrapper's own `echo` printed the flavor's real values on the way past,
because a shell variable is exactly what `echo` can see and `pnpm` cannot.
`flavor-config.test.mjs` now `eval`s this command in a real shell and asserts
every variable arrives in a child process.

A frozen or example flavor exits non-zero with the reason instead of printing
an environment. `--allow-frozen` overrides that for a deliberate rebuild of a
frozen app.

### What each variable does

| Variable | Read by | Effect |
|---|---|---|
| `BUZZ_BUILD_DEMO_SLUG` | `src-tauri/build.rs` | Bakes the slug in; the bundle identifier, keyring service, nest dir, deep-link scheme and CLI name all derive from it |
| `DEMO_NAME` / `DEMO_BUILD_ID` | `scripts/demo-build-config.mjs` | Generate the Tauri config overlay |
| `BRAND_NAME` | packaging | `.app` folder name, `CFBundleName`, DMG and volume name |
| `VITE_BUZZ_PRODUCT_NAME` | `shared/branding/brand.ts` | Product name in user-facing copy |
| `VITE_BUZZ_DEFAULT_ACCENT_COLOR` | `shared/branding/brandAccent.ts` | Accent a fresh install starts on |
| `VITE_BUZZ_PRODUCT_LOGO` | `shared/branding/brandLogo.ts` | The flavor's `logo` file, base64 into a `data:image/svg+xml` URL. Omitted when the flavor declares none |
| `VITE_BUZZ_PRODUCT_LOGO_LIGHT` | `shared/branding/brandLogo.ts` | The flavor's `logoLight` file, same encoding. The light theme shows this cut and the dark theme shows the one above |
| `VITE_BUZZ_PRODUCT_LOGO_MARK` | `shared/branding/brandLogo.ts` | The flavor's `logoMark` file, same encoding. Glyph-sized companion to the wordmark; the onboarding landing field drifts this instead of the Buzz bees. A build that declares none keeps the bees |
| `VITE_BUZZ_PRODUCT_LOGO_MARK_LIGHT` | `shared/branding/brandLogo.ts` | The flavor's `logoMarkLight` file, same encoding. The cut for a light surface — the onboarding content card, the hosted-community dialog, a light-mode community switch. Omitted when the flavor declares none, which paints the cut above everywhere |
| `VITE_BUZZ_PRODUCT_LOGO_STYLE` | `shared/branding/brandLogo.ts` | `mask` or `color` — recolour that file to the theme, or paint it as it is. Emitted with the logo, never without it |
| `VITE_BUZZ_CHROME_SURFACE` | `shared/branding/brandChrome.ts` | `auto` or `ink` — whether the navigation rail follows the document's light/dark mode, or stays on the dark surface in both. Always emitted, including at the default |
| `VITE_BUZZ_THEME_LABEL` | `shared/branding/brandThemeLabel.ts` | What the appearance picker calls the first-party theme pair, in place of "Buzz" / "Buzz Dark". The `buzz` / `buzz-dark` identifiers are untouched — they are what storage and `theme.css` match on. Omitted when the flavor declares none, which keeps the Buzz labels |
| `VITE_BUZZ_CELEBRATION_EMOJIS` | `shared/branding/brandCelebration.ts` | The emoji the backup-test burst throws, as one comma-separated list. Two of the stock six are the Buzz bee and its honey jar, so a de-branded build declares its own. Entries must not contain a comma — the flavor refuses one rather than letting the parser guess the boundary. Omitted when the flavor declares none, which keeps the stock set |
| `VITE_BUZZ_COLLAPSE_LONG_POSTS` | `shared/branding/brandPostDensity.ts` | `1` when a long top-level post is clamped to a few lines in the channel pane, with a fade and its thread opening on click. A reading-density choice about how an organisation's channels are used, not a defect being fixed, so it is off by default and the OSS build is unchanged. Omitted when off — the parser treats anything but `1` as off, so an unset variable and a mis-set one agree |
| `BUZZ_BUILD_PRODUCT_NAME` | `src-tauri/build.rs` → `src-tauri/src/brand.rs` | The same name again, for the half of the app that is **not** the frontend: the macOS app menu and its About box, the tray's Open/Quit items, the window title. Rust cannot read `import.meta.env`, and without this it falls back to Tauri's `productName`, which `demo-build-config.mjs` derives as `Buzz <demo name>` |
| `BUZZ_BUILD_BUNDLE_NAME` | `src-tauri/build.rs` → `src-tauri/src/build_identity.rs` | The flavor's `displayName`, which is what Tauri's bundler puts in filesystem paths — the `.app` folder, and on Linux the `/usr/lib/<name>/` a package's resources go into. `build_identity::sidecar_dirs` resolves `/usr/lib/<name>/sidecars` from it, where a flavored `.deb` keeps `buzz`, `buzz-acp` and the rest: `externalBin` would put them in `/usr/bin`, which a real Buzz's package already owns, and dpkg refuses two owners of one path. A **different field** from `BUZZ_BUILD_PRODUCT_NAME` above on purpose — that one is the name the app calls itself in its own copy, and a flavor may set the two differently |
| `BUZZ_BUILD_TRAY_ICON` | `src-tauri/build.rs` → `src-tauri/src/brand.rs` | Repo-relative path to the flavor's `trayIcon`, embedded at compile time. A **raster**, unlike every other mark here: the menu-bar glyph is handed to AppKit as pixels and nothing in the Rust build can rasterise an SVG. Omitted when the flavor declares none, which keeps the Buzz bee |
| `DMG_BACKGROUND` | `scripts/package-macos-dmg.sh` | Repo-relative path to the flavor's `dmgBackground`. Omitted when the flavor declares none, which keeps the stock panel |
| `BUZZ_RELAY_URL` | `src-tauri/build.rs` → `relay::relay_ws_url` | Default relay |
| `BUZZ_BUILD_AUTO_CONNECT_DEFAULT_RELAY` | `commands::identity` | Connect to that relay without asking |

`BRAND_NAME` brands the shell only. It does **not** choose the app — that is
`BUZZ_BUILD_DEMO_SLUG`. Read `CFBundleIdentifier` off the built `.app` and match
it against the flavor before delivering anything.

## Icons

`icon` is a repo-relative path, so a flavor's icon can live in this repo and the
build needs no machine-local file. The icons for the client apps are **not**
committed here yet: this repository is a public fork, so committing a client's
artwork publishes it. Place the `.icns` at the path the flavor names, or commit
it once that is a decision someone has made deliberately.
