/**
 * The interface language a build starts in.
 *
 * Unset is the OSS answer and the one every flavor had until now: with no
 * configured default, a fresh install follows the operating system and falls
 * back to English. A flavor that declares one takes that slot instead — the
 * OS is not consulted, because the point of declaring it is an organisation
 * whose people work in one language whatever their laptops are set to.
 *
 * It is a *default*, not a lock. The moment someone picks a language in
 * Settings that choice is stored and wins here forever after; this only
 * answers "what language before anyone has said", which is also the only
 * question the first-run screens get to ask.
 *
 * Its own module, like `brandAccent.ts` and `brandFont.ts`, and for the same
 * reason: the consumer is `shared/lib/localePreference.ts`, whose tests run in
 * plain Node with no Vite shim, so the parser has to be importable without
 * pulling in a module that reads `import.meta.env` at load.
 */

/**
 * Locales a flavor may declare.
 *
 * `pseudo` is deliberately absent. It is the generated overflow-proofing
 * locale, never offered in a shipped build (`isPseudoLocaleSelectable`), so a
 * flavor defaulting to it would hand users unreadable accented copy with no
 * control rendered to escape it.
 */
export const BRAND_DEFAULT_LOCALES = ["en", "de"] as const;

export type BrandDefaultLocale = (typeof BRAND_DEFAULT_LOCALES)[number];

/**
 * The configured default locale, or `null` when this build configured none.
 *
 * `null` rather than `"en"`: the caller has to be able to tell "this build
 * asked for English" from "this build asked for nothing", because the second
 * one means *follow the OS* and the first one means do not.
 */
export function parseBrandDefaultLocale(
  configured: unknown,
): BrandDefaultLocale | null {
  if (typeof configured !== "string") {
    return null;
  }
  const trimmed = configured.trim();
  return (BRAND_DEFAULT_LOCALES as readonly string[]).includes(trimmed)
    ? (trimmed as BrandDefaultLocale)
    : null;
}
