import * as React from "react";

/** Device-level spacing for the channel sidebar's rows and section headers. */
export type SidebarDensity = "compact" | "comfortable";

export const SIDEBAR_DENSITY_STORAGE_KEY = "buzz.appearance.sidebarDensity";
export const DEFAULT_SIDEBAR_DENSITY: SidebarDensity = "comfortable";

const listeners = new Set<() => void>();
let sidebarDensity: SidebarDensity = DEFAULT_SIDEBAR_DENSITY;
let listeningForStorageChanges = false;

export function parseSidebarDensity(
  value: string | null | undefined,
): SidebarDensity {
  return value === "compact" || value === "comfortable"
    ? value
    : DEFAULT_SIDEBAR_DENSITY;
}

function readStoredSidebarDensity(): SidebarDensity {
  try {
    return parseSidebarDensity(
      globalThis.localStorage?.getItem(SIDEBAR_DENSITY_STORAGE_KEY),
    );
  } catch {
    return DEFAULT_SIDEBAR_DENSITY;
  }
}

function applySidebarDensity(density: SidebarDensity): void {
  globalThis.document?.documentElement?.setAttribute(
    "data-sidebar-density",
    density,
  );
}

function notifyListeners(): void {
  for (const listener of listeners) listener();
}

function applyStoredSidebarDensity(): void {
  const nextDensity = readStoredSidebarDensity();
  const changed = nextDensity !== sidebarDensity;
  sidebarDensity = nextDensity;
  applySidebarDensity(nextDensity);
  if (changed) notifyListeners();
}

function listenForStorageChanges(): void {
  if (listeningForStorageChanges || !globalThis.window?.addEventListener)
    return;
  globalThis.window.addEventListener("storage", (event) => {
    if (event.key === SIDEBAR_DENSITY_STORAGE_KEY || event.key === null) {
      applyStoredSidebarDensity();
    }
  });
  listeningForStorageChanges = true;
}

/** Apply the persisted preference before React renders to avoid a layout jump. */
export function initializeSidebarDensityPreference(): void {
  applyStoredSidebarDensity();
  listenForStorageChanges();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSidebarDensity(): SidebarDensity {
  return sidebarDensity;
}

export function setSidebarDensity(density: SidebarDensity): void {
  sidebarDensity = density;
  applySidebarDensity(density);
  try {
    globalThis.localStorage?.setItem(SIDEBAR_DENSITY_STORAGE_KEY, density);
  } catch {
    // Persistence is best-effort; the live preference still applies.
  }
  notifyListeners();
}

/** Temporarily apply a density without changing the saved preference. */
export function previewSidebarDensity(density: SidebarDensity | null): void {
  applySidebarDensity(density ?? sidebarDensity);
}

export function useSidebarDensity(): SidebarDensity {
  return React.useSyncExternalStore(
    subscribe,
    getSidebarDensity,
    () => DEFAULT_SIDEBAR_DENSITY,
  );
}
