import * as React from "react";

/**
 * Interface language. `pseudo` is a generated locale used to prove a screen is
 * fully extracted and survives German-length copy; it is never offered in a
 * shipped build (see `isPseudoLocaleSelectable`).
 */
export type AppLocale = "en" | "de" | "pseudo";

export const APP_LOCALES: readonly AppLocale[] = ["en", "de", "pseudo"];

export const LOCALE_STORAGE_KEY = "buzz.appearance.locale";
export const DEFAULT_LOCALE: AppLocale = "en";

const listeners = new Set<() => void>();
let locale: AppLocale = DEFAULT_LOCALE;
let listeningForStorageChanges = false;

export function parseLocale(value: string | null | undefined): AppLocale {
  return value === "en" || value === "de" || value === "pseudo"
    ? value
    : DEFAULT_LOCALE;
}

/**
 * The pseudo-locale is a development affordance. Gating it keeps it out of the
 * language list customers see while leaving it one click away for anyone
 * proving a screen's extraction.
 *
 * The `e2e` mode is included deliberately — the pseudo-locale overflow guard
 * (`tests/e2e/i18n-appearance.spec.ts`) runs against an E2E build, and a
 * pseudo-locale that only exists in `pnpm dev` could not be tested in CI.
 * Same gate shape as the mock Tauri bridge in `main.tsx`.
 */
export function isPseudoLocaleSelectable(): boolean {
  return import.meta.env?.DEV === true || import.meta.env?.MODE === "e2e";
}

/** Locales offered in the UI for this build. */
export function selectableLocales(): readonly AppLocale[] {
  return isPseudoLocaleSelectable()
    ? APP_LOCALES
    : APP_LOCALES.filter((candidate) => candidate !== "pseudo");
}

function readStoredLocale(): AppLocale {
  let stored: AppLocale;
  try {
    stored = parseLocale(globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY));
  } catch {
    return DEFAULT_LOCALE;
  }
  // A build that drops the pseudo-locale must not stay stuck in it because an
  // earlier dev build persisted the choice — that would strand the user in
  // unreadable accented copy with the control to escape it no longer rendered.
  return stored === "pseudo" && !isPseudoLocaleSelectable()
    ? DEFAULT_LOCALE
    : stored;
}

function notifyListeners(): void {
  for (const listener of listeners) listener();
}

function applyStoredLocale(): void {
  const nextLocale = readStoredLocale();
  const changed = nextLocale !== locale;
  locale = nextLocale;
  if (changed) notifyListeners();
}

function listenForStorageChanges(): void {
  if (listeningForStorageChanges || !globalThis.window?.addEventListener)
    return;
  globalThis.window.addEventListener("storage", (event) => {
    if (event.key === LOCALE_STORAGE_KEY || event.key === null) {
      applyStoredLocale();
    }
  });
  listeningForStorageChanges = true;
}

/** Read the persisted preference before React renders. */
export function initializeLocalePreference(): void {
  applyStoredLocale();
  listenForStorageChanges();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLocale(): AppLocale {
  return locale;
}

export function setLocale(next: AppLocale): void {
  locale = next;
  try {
    globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, next);
  } catch {
    // Persistence is best-effort; the live preference still applies.
  }
  notifyListeners();
}

export function useLocale(): AppLocale {
  return React.useSyncExternalStore(subscribe, getLocale, () => DEFAULT_LOCALE);
}
