# Flavor icons

Each flavor's `icon` field names a path in here, e.g.
`flavors/icons/zeniad.icns`. Keeping the icon in the repo is what makes a
flavor buildable from a checkout alone, and
`scripts/flavor-config.test.mjs` fails if a buildable flavor names an icon
that is not here.

`.icns` on macOS. A flavor that is never built for macOS may point at the
format its own platform needs; nothing here validates the extension, only that
the path is repo-relative.

## What belongs here

Our own brand marks, and nothing else.

| File | Flavor |
|---|---|
| `ki.keriki.icns` | `ki.keriki.json` |
| `zeniad.icns` | `zeniad.json` |

**A client's artwork never goes in this repository.** It is a public fork, so
committing a client icon publishes it. A per-client flavor keeps its `.icns`
outside the checkout and places it at the path its flavor names before
building — which is also why the presence check above skips `frozen` and
`example` flavors rather than demanding every declared icon exist.

`KI.keri.KI.json` is frozen and refuses to build without `--allow-frozen`, so
its icon is deliberately absent; it is the same mark as `ki.keriki.icns` if it
is ever needed again.
