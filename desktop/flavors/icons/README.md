# Flavor icons

Each flavor's `icon` field names a path in here, e.g.
`flavors/icons/zeniad.icns`. Keeping the icon in the repo is what makes a
flavor buildable from a checkout alone.

The client icons are **not committed yet.** This repository is a public fork,
so committing a client's artwork publishes it — that is a decision for the
repository owner, not a side effect of wiring up flavors. Until it is made,
place the `.icns` at the path its flavor names before building.

`.icns` on macOS. A flavor that is never built for macOS may point at the
format its own platform needs; nothing here validates the extension, only that
the path is repo-relative.
