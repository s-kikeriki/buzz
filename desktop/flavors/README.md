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
| `brawado.json` | Brawado | active — **client**, artwork not committed |
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
  "fontFamily": "Poppins",                // optional — `Inter` or `Poppins`, see below
  "clientArtwork": true,                  // optional — artwork lives outside the repo
  "defaultAgents": [ /* see below */ ],   // optional — agents a fresh install starts with
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
| `VITE_BUZZ_PRODUCT_FONT` | `shared/branding/brandFont.ts` | The flavor's `fontFamily`. Resolved to a CSS stack and put on the root element as `--font-sans`, which the `body` rule and Tailwind's `font-sans` both read. Omitted when the flavor declares none, which keeps the Inter stack |
| `BUZZ_BUILD_DEFAULT_AGENTS` | `src-tauri/build.rs` → `managed_agents/default_agents.rs` | The flavor's `defaultAgents`, as JSON, with each declared `avatar` replaced by the file's bytes as a data URL. Base64 into the binary; seeded as built-in definitions on first launch. Omitted when the flavor declares none |
| `BUZZ_RELAY_URL` | `src-tauri/build.rs` → `relay::relay_ws_url` | Default relay |
| `BUZZ_BUILD_AUTO_CONNECT_DEFAULT_RELAY` | `commands::identity` | Connect to that relay without asking |

`BRAND_NAME` brands the shell only. It does **not** choose the app — that is
`BUZZ_BUILD_DEMO_SLUG`. Read `CFBundleIdentifier` off the built `.app` and match
it against the flavor before delivering anything.

## The interface font

`fontFamily` is the one brand value that cannot be carried by naming it. A
colour is a string the renderer understands; a font is bytes the webview has
to have been given, and a family it cannot resolve falls through to the next
entry in the stack with nothing in the build log to say so — on the machine
the design was made on, where the font is installed, it looks correct.

So the field is a closed set, `Inter` and `Poppins` today, and each entry is
a family `src/main.tsx` imports a `@fontsource` stylesheet for.
`flavor-config.mjs` refuses anything else at load, and
`flavor-config.test.mjs` holds the list against the imports in `main.tsx`, so
the two cannot drift into "accepted but never bundled".

Adding a family is therefore two edits in one change: the `@fontsource`
import in `main.tsx`, and the entry in `BUNDLED_FONT_FAMILIES` *and*
`FONT_STACKS` (`shared/branding/brandFont.ts`). Every stack ends in the
trunk's own, so a glyph the brand font has no cut for — and the first paint
before the woff2 is decoded — lands on the fallbacks Buzz has always used.

## Default agents

`defaultAgents` is the list of agents a fresh install of a flavor starts
with. Each entry becomes a **definition** — the key-less card the Agents list
shows — flagged built-in, carrying its runtime, model, provider, access gate,
parallelism and environment.

```jsonc
{
  "id": "builtin:router",            // `builtin:<slug>`; becomes the card's slug
  "displayName": "Router",
  "runtime": "buzz-agent",           // harness id, not a command
  "acpCommand": "buzz-acp",          // optional
  "provider": "openrouter",          // optional
  "model": "anthropic/claude-haiku-5.5",
  "respondTo": "owner-only",         // owner-only | allowlist | anyone
  "respondToAllowlist": [],          // only under `allowlist`
  "parallelism": 10,
  "envVars": { "OPENROUTER_API_KEY": "" },
  "avatar": "flavors/avatars/acme-router.jpg"
}
```

**Definitions, not running agents.** Starting an agent mints a Nostr key and
publishes an identity to the organisation's relay. A build that did that
unattended on first launch would put an agent on a relay on the strength of
someone opening the app once to look at it, so it stays a decision. Nothing
is lost by waiting: `buildInstanceInputForDefinition` copies the definition's
configuration onto the instance it creates and turns auto-start on, so the
agent after one press of start is the agent the flavor described.

**No `agentCommand` or `mcpCommand` field, deliberately.** Both are resolved
from the runtime catalog when the instance is created — for `buzz-agent`,
that is the `buzz-agent` and `buzz-dev-mcp` the bundle shipped. A bare
command name pinned here would resolve against `PATH` instead, which on a
developer's machine is usually the same binary and on a user's is usually
nothing.

**A credential ships as an empty string, never as a value.** `""` is how a
flavor declares the *shape* of a secret: the field is in the agent's
environment for its owner to fill in, and no key is in the repo, in the diff,
or in a build. `flavor-config.test.mjs` fails any flavor that gives a
key-shaped name a non-empty value, and `build.rs` rejects an env key Buzz
reserves for its own identity and access gates.

The seed is add-only, by id. An edited card keeps its edits; a *deleted* one
comes back on the next launch, which is what "the flavor ships with this
agent" means.

## Client artwork

`clientArtwork: true` says the flavor's assets belong to a client and are not
in this repository.

This fork is public, so committing a client's icon, logo or agent portrait
publishes it. A client flavor therefore declares its paths like any other and
the files are placed there before the build — which is the arrangement
`icons/README.md` and `logos/README.md` have described all along; the flag is
what makes it enforceable rather than a convention.

What the flag changes:

- `flavor-config.test.mjs` skips the two committed-asset checks for it, and
  adds one of its own: every asset a `clientArtwork` flavor declares must be
  **untracked**. Setting the flag and committing the files anyway is the one
  mistake the flag exists to prevent, so it fails the suite.
- `node scripts/flavor-config.mjs <id>` refuses to print a build environment
  while any declared asset is missing, naming each one. That moves the
  failure from `codesign`, twenty minutes into a release build and in a shell
  script outside this repo, to the first command the build runs.
- `.gitignore` denies the paths outright, so the mistake needs a `-f` rather
  than a lapse.

`brawado.json` is the first of these. Its assets are generated outside the
checkout by `~/.kikeriki/brand/brawado/make-brawado-assets.py`, from
`www.brawado.com` and the Router portrait, and placed at the paths the flavor
names.

## Icons

`icon` is a repo-relative path, so a flavor's icon can live in this repo and the
build needs no machine-local file. The icons for the client apps are **not**
committed here yet: this repository is a public fork, so committing a client's
artwork publishes it. Place the `.icns` at the path the flavor names, or commit
it once that is a decision someone has made deliberately.
