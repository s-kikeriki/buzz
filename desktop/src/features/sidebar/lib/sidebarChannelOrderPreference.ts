import * as React from "react";

import {
  DEFAULT_SORT_MODE,
  type ChannelSortMode,
} from "./channelSortPreference";

/**
 * Device-level fallback order for every sidebar grouping. A group that carries
 * its own synced Recent/A–Z register (see `useChannelSortPreference`) keeps it;
 * the rest follow this preference, so one switch orders the whole sidebar.
 */
export const SIDEBAR_CHANNEL_ORDER_STORAGE_KEY =
  "buzz.appearance.sidebarChannelOrder";

const listeners = new Set<() => void>();
let channelOrder: ChannelSortMode = DEFAULT_SORT_MODE;
let listeningForStorageChanges = false;

export function parseSidebarChannelOrder(
  value: string | null | undefined,
): ChannelSortMode {
  return value === "alpha" || value === "recent" ? value : DEFAULT_SORT_MODE;
}

function readStoredChannelOrder(): ChannelSortMode {
  try {
    return parseSidebarChannelOrder(
      globalThis.localStorage?.getItem(SIDEBAR_CHANNEL_ORDER_STORAGE_KEY),
    );
  } catch {
    return DEFAULT_SORT_MODE;
  }
}

function notifyListeners(): void {
  for (const listener of listeners) listener();
}

function applyStoredChannelOrder(): void {
  const nextOrder = readStoredChannelOrder();
  const changed = nextOrder !== channelOrder;
  channelOrder = nextOrder;
  if (changed) notifyListeners();
}

function listenForStorageChanges(): void {
  if (listeningForStorageChanges || !globalThis.window?.addEventListener)
    return;
  globalThis.window.addEventListener("storage", (event) => {
    if (event.key === SIDEBAR_CHANNEL_ORDER_STORAGE_KEY || event.key === null) {
      applyStoredChannelOrder();
    }
  });
  listeningForStorageChanges = true;
}

/** Read the persisted preference before React renders the sidebar. */
export function initializeSidebarChannelOrderPreference(): void {
  applyStoredChannelOrder();
  listenForStorageChanges();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSidebarChannelOrder(): ChannelSortMode {
  return channelOrder;
}

export function setSidebarChannelOrder(order: ChannelSortMode): void {
  channelOrder = order;
  try {
    globalThis.localStorage?.setItem(SIDEBAR_CHANNEL_ORDER_STORAGE_KEY, order);
  } catch {
    // Persistence is best-effort; the live preference still applies.
  }
  notifyListeners();
}

export function useSidebarChannelOrder(): ChannelSortMode {
  return React.useSyncExternalStore(
    subscribe,
    getSidebarChannelOrder,
    () => DEFAULT_SORT_MODE,
  );
}
