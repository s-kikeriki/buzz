import type { AppLocale } from "@/shared/lib/localePreference";

/**
 * BCP-47 tag to hand `Intl` for an app locale.
 *
 * `pseudo` is not a language — it is the generated accent-and-pad locale used
 * to prove a screen is fully extracted. `Intl` does not reject it (an
 * unmatched tag silently falls back to the runtime default), which is exactly
 * why it has to be mapped here: a silent fallback means pseudo-locale dates
 * would quietly follow whatever locale the machine happens to be in, and the
 * overflow guard would be reading a number nobody chose. Pin it to English so
 * the pseudo build's dates are the English dates, padded copy around them.
 */
const INTL_TAGS: Record<AppLocale, string> = {
  en: "en-US",
  de: "de-DE",
  pseudo: "en-US",
};

/**
 * Throws on anything that is not an app locale.
 *
 * Not defensive programming — this is the guard that makes the conversion
 * checkable. `Intl` treats `undefined` as "use the host's locale", so a caller
 * that forgets the argument gets the *operating system's* language and looks
 * correct on a US English Mac while being wrong for the app. TypeScript cannot
 * see the ones that matter: the unit tests are `.mjs`, so a stale
 * `formatShortMonthDay(ts)` call there would silently assert the machine's
 * formatting and pass. Three such assertions were passing before this threw.
 */
export function intlLocale(locale: AppLocale): string {
  const tag = INTL_TAGS[locale];
  if (tag === undefined) {
    throw new TypeError(
      `intlLocale: ${JSON.stringify(locale)} is not an app locale. ` +
        "Pass the value from useLocale()/getLocale(), not undefined — " +
        "Intl would silently fall back to the host locale.",
    );
  }
  return tag;
}

/**
 * Memoised `Intl.DateTimeFormat` for an app locale.
 *
 * Constructing a `DateTimeFormat` is expensive enough that the formatters used
 * to be module-level constants — which is precisely how they ended up pinned
 * to `"en-US"`: a constant cannot follow a locale the user changes at runtime.
 * This keeps the memoisation and moves the locale into the key, so a German
 * timeline builds its formatters once and an `en → de` switch builds a second
 * set rather than reusing the first.
 */
const dateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();

export function localeDateTimeFormat(
  locale: AppLocale,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  // Option order is authored, not arbitrary, so a plain stringify is a stable
  // key in practice; sorting the entries makes it one by construction.
  const key = `${locale}|${JSON.stringify(
    Object.entries(options).sort(([a], [b]) => (a < b ? -1 : 1)),
  )}`;
  const cached = dateTimeFormatterCache.get(key);
  if (cached) return cached;

  const created = new Intl.DateTimeFormat(intlLocale(locale), options);
  dateTimeFormatterCache.set(key, created);
  return created;
}

/** Test seam: drop memoised formatters between cases. */
export function resetLocaleFormattersForTests(): void {
  dateTimeFormatterCache.clear();
}

/**
 * Drop-in replacements for `Date.prototype.toLocale*String()`.
 *
 * Those methods take the *operating system's* locale when called with no
 * argument (or with `undefined`), which is not the app's language setting —
 * a German app on an English Mac printed English dates, and an English app on
 * a German Mac printed German ones. Neither followed the preference the user
 * actually set. The option sets below reproduce each method's default output
 * exactly, so swapping a call for one of these changes the locale and nothing
 * else.
 */
const DATE_TIME_DEFAULT = {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
} as const;

const DATE_DEFAULT = {
  year: "numeric",
  month: "numeric",
  day: "numeric",
} as const;

const TIME_DEFAULT = {
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
} as const;

/** Equivalent of `date.toLocaleString()`, in the app's locale. */
export function localeDateTime(value: Date, locale: AppLocale): string {
  return localeDateTimeFormat(locale, DATE_TIME_DEFAULT).format(value);
}

/** Equivalent of `date.toLocaleDateString()`, in the app's locale. */
export function localeDate(value: Date, locale: AppLocale): string {
  return localeDateTimeFormat(locale, DATE_DEFAULT).format(value);
}

/** Equivalent of `date.toLocaleTimeString()`, in the app's locale. */
export function localeTime(value: Date, locale: AppLocale): string {
  return localeDateTimeFormat(locale, TIME_DEFAULT).format(value);
}
