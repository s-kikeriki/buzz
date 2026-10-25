import type { RelayEvent } from "@/shared/api/types";

/**
 * Channel logos ride on the NIP-29 metadata-edit command (kind:9002) as a
 * `picture` tag.
 *
 * The relay stores a signed 9002 verbatim and ignores tag names it does not
 * recognise, but it does not fold `picture` into the relay-signed kind:39000
 * metadata event — `group_metadata_tags` in `buzz-db` has no picture branch and
 * the `channels` table has no picture column. So the authoritative value for a
 * channel logo is the newest 9002 that carries a `picture` tag, read back from
 * the relay by the client. See the upstream feature request in this PR's body
 * for the relay-side version of this.
 *
 * Two consequences shape the code here:
 *
 * 1. kind:9002 is a regular (appended) kind, not replaceable, so a channel
 *    accumulates one event per metadata edit. Nostr cannot filter on a
 *    multi-character tag name, so a reader must page `{kinds:[9002], "#h":[id]}`
 *    newest-first and look for a `picture`. {@link CHANNEL_LOGO_PAGE_LIMIT}
 *    bounds that page.
 * 2. A logo write must piggyback a tag the relay recognises, because
 *    `validate_admin_event` rejects a 9002 whose tags are all unknown. The
 *    write path re-sends the channel's current `name`, which is both a
 *    privileged tag (so the relay itself enforces owner/admin) and the only
 *    privileged tag that emits no system message.
 */

/** Tag name carrying the logo URL. Matches NIP-29 `kind:39000` `picture`. */
export const CHANNEL_LOGO_TAG = "picture";

/**
 * How many kind:9002 events to read per channel when resolving its logo.
 *
 * Bounded on purpose: without a tag filter the only way to find the newest
 * `picture` is to page metadata edits, and an unbounded page would grow with a
 * channel's edit history. A channel that somehow accumulates more than this
 * many metadata edits after its logo was set reads as having no logo and falls
 * back to the glyph, which is the safe direction to fail.
 */
export const CHANNEL_LOGO_PAGE_LIMIT = 200;

/**
 * Parse one `picture` tag value into a usable logo URL.
 *
 * Accepts absolute `http:`/`https:` URLs only. An empty value is how a logo is
 * removed, and anything else (a relative path, `data:`, `javascript:`, a bare
 * hostname) is not a URL this app will put in an `<img src>`.
 *
 * Returns `null` for every non-URL, so callers cannot tell "removed" from
 * "malformed" — see {@link selectChannelLogoUrl} for why that is the right
 * collapse.
 */
export function parseChannelLogoUrl(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  return trimmed;
}

/** The `picture` tag value on `event`, or `null` if it carries none. */
function channelLogoTagValue(event: RelayEvent) {
  // A 9002 is a partial update where a repeated tag's last value wins, which is
  // the relay's own rule for the tags it recognises (`side_effects.rs`). Mirror
  // it rather than taking the first match.
  let value: string | null = null;
  for (const tag of event.tags) {
    if (tag[0] === CHANNEL_LOGO_TAG) {
      value = tag[1] ?? "";
    }
  }
  return value;
}

/**
 * Resolve a channel's logo from a page of its kind:9002 events.
 *
 * The newest event that *carries* a `picture` tag is authoritative — not the
 * newest event that carries a *valid* one. That distinction is what makes
 * removal work: a logo is removed by publishing `["picture", ""]`, and if this
 * function skipped past unusable values looking for an older valid one, the
 * removal would resurrect the previous logo. So one rule: the latest write
 * wins, and a write whose value this client cannot use means no logo.
 *
 * Ties on `created_at` (a second's resolution is coarse enough to hit) break on
 * the event id, so every client resolves the same logo from the same page
 * instead of depending on relay row order.
 */
export function selectChannelLogoUrl(events: readonly RelayEvent[]) {
  let newest: RelayEvent | null = null;
  let newestValue: string | null = null;

  for (const event of events) {
    const value = channelLogoTagValue(event);
    if (value === null) {
      continue;
    }
    if (
      newest === null ||
      event.created_at > newest.created_at ||
      (event.created_at === newest.created_at && event.id > newest.id)
    ) {
      newest = event;
      newestValue = value;
    }
  }

  return parseChannelLogoUrl(newestValue);
}

/**
 * The logo `<img src>` to render, or `null` to fall back to the glyph icon.
 *
 * `failedLogoUrl` is the last URL whose load failed. Comparing against the
 * current URL rather than holding a boolean is what lets a *replacement* logo
 * get its own chance to load: a channel whose first logo 404s must not be
 * permanently fenced out of showing the next one.
 */
export function resolveChannelLogoSrc(
  logoUrl: string | null | undefined,
  failedLogoUrl: string | null,
) {
  if (typeof logoUrl !== "string" || logoUrl.length === 0) {
    return null;
  }
  return logoUrl === failedLogoUrl ? null : logoUrl;
}
