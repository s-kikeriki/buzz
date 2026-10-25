import type { QueryClient } from "@tanstack/react-query";

import {
  CHANNEL_LOGO_PAGE_LIMIT,
  selectChannelLogoUrl,
} from "@/features/channels/lib/channelLogo";
import type { RelaySubscriptionFilter } from "@/shared/api/relayClientShared";
import type { RelayEvent } from "@/shared/api/types";
import { KIND_NIP29_EDIT_METADATA } from "@/shared/constants/kinds";

/**
 * Per-channel cache for channel logos, layered on the app's QueryClient.
 *
 * Resolving a logo costs one bounded relay read per channel (see
 * `channelLogo.ts` for why there is no narrower filter), so the read must not
 * repeat per render or per call site — the sidebar row, the channel header and
 * the settings sheet all ask for the same channel's logo. Keying the query by
 * channel id gives that deduplication, bounded eviction (`gcTime`), and the
 * generation fencing a hand-rolled map would have to reimplement: a fetch that
 * resolves after its channel's entry was invalidated cannot publish a stale
 * logo over a newer one.
 *
 * `refetchOnWindowFocus` is off app-wide, so a logo set by *another* member is
 * picked up by `useChannelLogoLiveRefresh`, which invalidates the owning
 * channel's entry when a live kind:9002 arrives.
 */

/**
 * How long a resolved logo stays fresh.
 *
 * The live kind:9002 subscription is the real freshness mechanism; this is the
 * backstop for the window between losing that subscription and reconnecting,
 * so it is a few minutes rather than indefinite.
 */
export const CHANNEL_LOGO_STALE_TIME_MS = 5 * 60 * 1_000;

/** Query key for one channel's logo. Scoped under the channel's own prefix. */
export function channelLogoQueryKey(channelId: string) {
  return ["channels", channelId, "logo"] as const;
}

/** Bounded newest-first page of a channel's metadata edits. */
export function channelLogoFilter(channelId: string): RelaySubscriptionFilter {
  return {
    kinds: [KIND_NIP29_EDIT_METADATA],
    "#h": [channelId],
    limit: CHANNEL_LOGO_PAGE_LIMIT,
  };
}

/** Live filter for metadata edits across `channelIds`, from now on. */
export function channelLogoLiveFilter(
  channelIds: readonly string[],
  sinceSeconds: number,
): RelaySubscriptionFilter {
  return {
    kinds: [KIND_NIP29_EDIT_METADATA],
    "#h": [...channelIds],
    limit: CHANNEL_LOGO_PAGE_LIMIT,
    since: sinceSeconds,
  };
}

export type ChannelLogoEventFetcher = (
  filter: RelaySubscriptionFilter,
) => Promise<RelayEvent[]>;

/** Read a channel's logo from the relay. Returns `null` when it has none. */
export async function fetchChannelLogoUrl(
  channelId: string,
  fetchEvents: ChannelLogoEventFetcher,
): Promise<string | null> {
  const events = await fetchEvents(channelLogoFilter(channelId));
  return selectChannelLogoUrl(events);
}

/** Query options for one channel's logo, shared by every call site. */
export function channelLogoQueryOptions(
  channelId: string | null | undefined,
  fetchEvents: ChannelLogoEventFetcher,
) {
  return {
    queryKey: channelLogoQueryKey(channelId ?? "none"),
    queryFn: () => fetchChannelLogoUrl(channelId as string, fetchEvents),
    enabled: typeof channelId === "string" && channelId.length > 0,
    staleTime: CHANNEL_LOGO_STALE_TIME_MS,
  };
}

/**
 * Drop one channel's cached logo so the next read re-resolves it.
 *
 * Scoped to a single channel on purpose: a metadata edit in one channel says
 * nothing about any other, and invalidating the whole `["channels"]` prefix
 * would re-run every channel's bounded page.
 */
export function invalidateChannelLogo(
  queryClient: QueryClient,
  channelId: string,
) {
  return queryClient.invalidateQueries({
    queryKey: channelLogoQueryKey(channelId),
  });
}

/**
 * Publish a logo we just wrote ourselves, so the glyph updates without waiting
 * for a relay round trip, then invalidate so the relay's answer still wins.
 */
export async function applyLocalChannelLogo(
  queryClient: QueryClient,
  channelId: string,
  logoUrl: string | null,
) {
  queryClient.setQueryData(channelLogoQueryKey(channelId), logoUrl);
  await invalidateChannelLogo(queryClient, channelId);
}
