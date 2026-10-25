/**
 * Relay migrations: which predecessor hosts a community's media may still
 * point at, and whether a given URL is media this workspace owns.
 *
 * DOM-free and dependency-free on purpose. Two very different consumers need
 * this answer — the inline-media rewrite (`shared/lib/mediaUrl.ts`, which owns
 * the Tauri proxy cache) and the markdown classifier
 * (`shared/ui/markdown/mediaEntry.ts`, which is deliberately pure) — and
 * neither should have to import the other to get it.
 */

import legacyRelayOrigins from "../../../legacy-relay-origins.json" with {
  type: "json",
};

/**
 * Relay migrations this app knows about, keyed by the origin of the relay the
 * workspace is on **now**. A media URL on one of the mapped predecessors is
 * treated as our own: the blob is content-addressed by sha256, so the same
 * path resolves against the current relay once the file has been copied there.
 * Without this, history written before a relay migration keeps pointing at the
 * old host, which stops answering as soon as the move is finished.
 *
 * Keying on the current relay is what keeps the rewrite scoped to the
 * community that actually did the move. A flat list of predecessor origins
 * would make *every* build claim them, so an unrelated community would resolve
 * a `kikeriki` URL against its own relay, which has no such blob — an image
 * that renders today would go blank.
 *
 * The table itself is `desktop/legacy-relay-origins.json`, shared verbatim
 * with the Rust download gate (`legacy_media_origins.rs`). Both halves have to
 * agree on which predecessors are ours: when they drifted, images rendered
 * (the frontend knew) while documents refused to download (the backend did
 * not). One file is what makes that class of bug unrepresentable, so add
 * migrations there, never here.
 *
 * Only exact origins belong in it, never a blanket "any host" rule — a real
 * third-party Blossom host must still pass through untouched.
 */
const LEGACY_RELAY_ORIGINS_BY_CURRENT: ReadonlyMap<
  string,
  ReadonlySet<string>
> = new Map(
  legacyRelayOrigins.migrations.map((migration) => [
    migration.currentRelayOrigin,
    new Set(migration.legacyOrigins) as ReadonlySet<string>,
  ]),
);

/**
 * Canonicalize a URL to its origin with a lowercased scheme/host.
 *
 * The relay always emits media URLs with a lowercased tenant host
 * (`normalize_host` in buzz-core), but the saved community relay URL keeps
 * whatever casing the user typed (DNS is case-insensitive, so an uppercase
 * host connects fine). A raw string comparison between the two misclassifies
 * the relay's own media URLs as external and skips the authenticated proxy.
 * `new URL().origin` lowercases scheme + host and drops default ports.
 *
 * Returns null for unparseable input.
 */
export function canonicalOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Whether `urlOrigin` is a relay the community on `currentRelayOrigin` moved
 * off. Both arguments must already be canonicalized by {@link canonicalOrigin}.
 */
export function isLegacyOriginForCurrentRelay(
  urlOrigin: string | null,
  currentRelayOrigin: string,
): boolean {
  if (urlOrigin === null) return false;
  return (
    LEGACY_RELAY_ORIGINS_BY_CURRENT.get(currentRelayOrigin)?.has(urlOrigin) ??
    false
  );
}

/**
 * Whether `url` is media this workspace owns: hosted on the current relay, or
 * on a relay this community moved off.
 *
 * This is the ownership question, deliberately separate from the rendering
 * one. Call sites that decide whether to *offer* a relay action (Download,
 * Copy image) on a URL whose extension the inline-media rewrite does not cover
 * — documents, archives, audio — ask this rather than inferring an answer from
 * whether `rewriteRelayUrl` changed the URL.
 *
 * `currentRelayOrigin` is passed in rather than read from a module cache so
 * callers can drive it from a reactive source and have eligibility recompute
 * when the origin resolves. Returns `false` when it is absent — an unresolved
 * origin cannot distinguish our media from anyone else's, and offering an
 * action the Rust gate will refuse is worse than offering it a moment late.
 */
export function isOwnedMediaOrigin(
  url: string,
  currentRelayOrigin: string | null | undefined,
): boolean {
  if (!currentRelayOrigin) return false;
  const current = canonicalOrigin(currentRelayOrigin);
  if (current === null) return false;
  const urlOrigin = canonicalOrigin(url);
  if (urlOrigin === null) return false;
  return (
    urlOrigin === current || isLegacyOriginForCurrentRelay(urlOrigin, current)
  );
}
