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

/**
 * Language tags the operating system says this person prefers, best first.
 *
 * Three sources, because on Linux they do not come from the same place and
 * the one that matters there is the least certain. `navigator.languages` is
 * the webview's own list — WKWebView takes it from the app's preferred
 * languages and WebView2 from the user's Windows language list, both reliable;
 * under WebKitGTK it comes from `g_get_language_names()`, which reads
 * `LANGUAGE`/`LC_ALL`/`LC_MESSAGES`/`LANG`. `Intl` reaches the same
 * environment by a completely different road — ICU's own default locale, which
 * the JS engine initialises from the C locale directly — so a `LANG=de_DE.UTF-8`
 * session that the webview list somehow missed is still seen here.
 *
 * Nothing is persisted from this. An explicit choice in Settings is the only
 * thing that writes the preference, so a person who moves between a German and
 * an English login keeps following the OS until they say otherwise.
 */
export function osPreferredLocales(): string[] {
  const tags: string[] = [];
  const navigator = globalThis.navigator;
  if (Array.isArray(navigator?.languages)) tags.push(...navigator.languages);
  if (typeof navigator?.language === "string") tags.push(navigator.language);
  try {
    tags.push(new Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    // A webview with no usable ICU data still has the two lists above.
  }
  return tags;
}

/**
 * The first supported locale in a list of OS language tags, or `null`.
 *
 * Matches on the language subtag, so `de-AT`, `de_DE.UTF-8` and `de` all
 * select German — a region we do not ship a catalogue for is still German.
 * `null` rather than {@link DEFAULT_LOCALE} so the caller can tell "the OS
 * asked for something we have" from "the OS asked for Finnish"; and
 * `pseudo` is unreachable by construction, since no OS reports it.
 */
export function localeFromOsPreference(
  tags: Iterable<string>,
): AppLocale | null {
  for (const tag of tags) {
    if (typeof tag !== "string") continue;
    const language = tag.toLowerCase().split(/[-_.@]/)[0];
    if (language === "de") return "de";
    if (language === "en") return "en";
  }
  return null;
}

function readStoredLocale(): AppLocale {
  let raw: string | null;
  try {
    raw = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY) ?? null;
  } catch {
    return DEFAULT_LOCALE;
  }
  if (raw === null) {
    // Nothing saved: follow the OS. Only the absent key takes this path — a
    // stored value this build does not recognise is still a choice someone
    // made, and `parseLocale` has always resolved it to the default.
    return localeFromOsPreference(osPreferredLocales()) ?? DEFAULT_LOCALE;
  }
  const stored = parseLocale(raw);
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
