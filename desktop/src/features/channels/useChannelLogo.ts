import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import {
  applyLocalChannelLogo,
  channelLogoLiveFilter,
  channelLogoQueryOptions,
  invalidateChannelLogo,
} from "@/features/channels/channelLogoQuery";
import { relayClient } from "@/shared/api/relayClient";
import { setChannelLogo } from "@/shared/api/tauriChannels";
import type { RelayEvent } from "@/shared/api/types";
import { getChannelIdFromTags } from "@/features/messages/lib/threading";

function fetchLogoEvents(
  filter: Parameters<typeof relayClient.fetchEvents>[0],
) {
  return relayClient.fetchEvents(filter);
}

/**
 * One channel's logo URL, or `null` when it has none.
 *
 * Cached per channel (see `channelLogoQuery.ts`), so the sidebar row, the
 * channel header and the settings sheet share a single bounded relay read.
 */
export function useChannelLogo(channelId: string | null | undefined) {
  return useQuery(channelLogoQueryOptions(channelId, fetchLogoEvents));
}

/**
 * Keep cached logos fresh for the channels the app is rendering.
 *
 * One live subscription covers every channel rather than one per channel: a
 * metadata edit is rare, and the per-channel live message subscription does not
 * carry kind:9002. Each arriving edit invalidates only its own channel.
 *
 * The subscription starts at `since = now`, and the cached logo it is refreshing
 * came from a bounded page of history, so the two overlap rather than leaving a
 * gap: an edit published while this effect is wiring up is still picked up by
 * the next read, because `staleTime` expires it.
 */
export function useChannelLogoLiveRefresh(channelIds: readonly string[]) {
  const queryClient = useQueryClient();
  // Primitive key so a refetch that produces a new array with identical
  // contents doesn't churn the subscription.
  const channelIdsKey = React.useMemo(
    () => [...new Set(channelIds)].sort().join(","),
    [channelIds],
  );

  const handleMetadataEdit = React.useEffectEvent((event: RelayEvent) => {
    const channelId = getChannelIdFromTags(event.tags);
    if (!channelId) {
      return;
    }
    void invalidateChannelLogo(queryClient, channelId);
  });

  React.useEffect(() => {
    const ids = channelIdsKey ? channelIdsKey.split(",") : [];
    if (ids.length === 0) {
      return;
    }

    const controller = new AbortController();
    let disposed = false;
    let dispose: (() => Promise<void>) | undefined;

    const pending = relayClient
      .subscribeLive(
        channelLogoLiveFilter(ids, Math.floor(Date.now() / 1_000)),
        handleMetadataEdit,
        undefined,
        undefined,
        controller.signal,
      )
      .then((disposeFn) => {
        if (disposed) {
          void disposeFn().catch(() => {});
          return;
        }
        dispose = disposeFn;
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        // Non-fatal: logos still refresh when `staleTime` expires. Surfacing a
        // retry loop here would spin against a relay that is already failing
        // the far more important message subscriptions.
        console.error("Failed to subscribe to channel logo updates", error);
      });

    return () => {
      disposed = true;
      controller.abort();
      void pending.then(() => dispose?.().catch(() => {}));
    };
  }, [channelIdsKey]);
}

/**
 * Set or remove `channelId`'s logo.
 *
 * The no-op `name` tag the write needs is resolved in the Rust command from
 * the relay's own metadata, not from this layer — the settings sheet holds an
 * unsaved name draft while the logo control is on screen.
 */
export function useSetChannelLogoMutation(channelId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pictureUrl: string | null) => {
      if (!channelId) {
        throw new Error("No channel selected.");
      }
      await setChannelLogo({ channelId, pictureUrl });
      return pictureUrl;
    },
    onSuccess: async (pictureUrl) => {
      if (!channelId) {
        return;
      }
      await applyLocalChannelLogo(queryClient, channelId, pictureUrl);
    },
  });
}
