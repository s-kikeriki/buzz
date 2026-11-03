# Flavor agent avatars

The picture a flavor's default agent wears, named by `defaultAgents[].avatar`
in `flavors/<id>.json`.

Unlike `icon` and `logo`, this one never reaches a bundler or a build script
as a path: `flavor-config.mjs` reads the bytes and inlines them as a data URL
inside `BUZZ_BUILD_DEFAULT_AGENTS`, which `src-tauri/build.rs` bakes into the
binary. The seed runs in the packaged app on a machine that never had this
checkout, so a path would point at nothing.

## Keep them small

The whole list travels as one base64 build-script value and then lives in the
binary. 256x256 is the size the Agents list and the members rail actually
render, and a 256px JPEG is some 20 KB — a full-resolution portrait is ten
times that for no visible difference.

## What belongs here

Nothing, in this repository. Every avatar so far belongs to a client, and
`.gitignore` denies the whole directory but this file: a public fork that
committed one would publish it. The flavor names the path and whoever builds
the app places the file there first; `node scripts/flavor-config.mjs <id>`
refuses to print an environment while any declared asset is missing, so the
build stops before it starts rather than twenty minutes in at `codesign`.

| File | Flavor | Field | Source |
|---|---|---|---|
| `brawado-router.jpg` | `brawado.json` | `defaultAgents[0].avatar` | `~/.kikeriki/brand/brawado/make-brawado-assets.py` |
