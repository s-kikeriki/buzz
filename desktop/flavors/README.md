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
  "relayUrl": "wss://relay.acme.test",    // default relay baked into the binary
  "autoConnectDefaultRelay": true,        // optional, default false
  "accentColor": "#3b82f6",               // optional, lowercase #rrggbb
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
   has to be a single-colour SVG, and the reason is not obvious.
6. Run `node scripts/flavor-config.test.mjs` and confirm it passes.

## Building

`flavor-config.mjs` prints the build environment for a flavor:

```sh
cd desktop
node scripts/flavor-config.mjs zeniad          # KEY='value' lines
node scripts/flavor-config.mjs zeniad --json   # the resolved flavor
eval "$(node scripts/flavor-config.mjs zeniad)" && export \
  BRAND_NAME BUZZ_BUILD_DEMO_SLUG BUZZ_RELAY_URL DEMO_BUILD_ID DEMO_NAME \
  VITE_BUZZ_PRODUCT_NAME VITE_BUZZ_DEFAULT_ACCENT_COLOR \
  VITE_BUZZ_PRODUCT_LOGO BUZZ_BUILD_AUTO_CONNECT_DEFAULT_RELAY
```

`eval` sets the variables; only `export` hands them to the Vite and Cargo
child processes. A name left out of that list is read as unset by the build,
and the result is a DMG missing whatever it configured — no accent, no mark —
with nothing in the log to say so. `flavor-config.test.mjs` binds this list to
the variables `flavorBuildEnv` can emit, so the next one cannot be forgotten.

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
