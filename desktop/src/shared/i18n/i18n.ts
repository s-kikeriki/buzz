import { i18n } from "@lingui/core";

import type { AppLocale } from "@/shared/lib/localePreference";

/**
 * Catalogue activation for the desktop app.
 *
 * `@lingui/vite-plugin` compiles `src/locales/<locale>/messages.po` on import,
 * so catalogues are code-split modules rather than a committed build artifact.
 * Only the active locale is ever downloaded.
 */

/**
 * Monotonic counter fencing concurrent activations. Switching de → en while
 * the German catalogue is still in flight must not let the late German import
 * overwrite English: the stale activation sees a bumped generation and drops
 * its result.
 */
let activationGeneration = 0;

/** The locale whose catalogue is currently active, or null before the first. */
let activeLocale: AppLocale | null = null;

export function getActiveLocale(): AppLocale | null {
  return activeLocale;
}

/**
 * Load and activate `locale`.
 *
 * Rejects if the catalogue cannot be loaded — callers decide the recovery.
 * Resolves to `false` when a newer activation superseded this one, so a caller
 * can tell "my switch landed" from "someone else's did".
 */
export async function activateLocale(locale: AppLocale): Promise<boolean> {
  const generation = ++activationGeneration;
  const { messages } = await import(`../../locales/${locale}/messages.po`);
  if (generation !== activationGeneration) return false;

  i18n.loadAndActivate({ locale, messages });
  activeLocale = locale;
  // Assistive technology picks pronunciation from this attribute; leaving it
  // on `en` while the UI renders German makes a screen reader unintelligible.
  globalThis.document?.documentElement?.setAttribute("lang", locale);
  return true;
}

/** Test seam: reset module state between cases. */
export function resetI18nForTests(): void {
  activationGeneration = 0;
  activeLocale = null;
}

export { i18n };
