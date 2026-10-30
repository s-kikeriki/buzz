import { intlLocale } from "@/shared/lib/intlLocale";
import type { AppLocale } from "@/shared/lib/localePreference";

export type AnimatedCountSlot = {
  current: string;
  isDigit: boolean;
  place: number;
  previous: string;
};

const countFormatterCache = new Map<AppLocale, Intl.NumberFormat>();

/**
 * Grouping separator follows the locale: German writes 1.234 where English
 * writes 1,234. The slot machinery below treats any non-digit as a static
 * separator, so swapping "," for "." changes the glyph without changing the
 * animation.
 */
function countFormatter(locale: AppLocale): Intl.NumberFormat {
  const cached = countFormatterCache.get(locale);
  if (cached) return cached;
  const created = new Intl.NumberFormat(intlLocale(locale), {
    maximumFractionDigits: 0,
  });
  countFormatterCache.set(locale, created);
  return created;
}

export function normalizeAnimatedCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

export function formatAnimatedCount(value: number, locale: AppLocale): string {
  return countFormatter(locale).format(normalizeAnimatedCount(value));
}

export function isAsciiDigit(value: string): boolean {
  return value.length === 1 && value >= "0" && value <= "9";
}

export function getAnimatedCountSlots(
  previous: string,
  current: string,
): AnimatedCountSlot[] {
  const width = Math.max(previous.length, current.length);
  const previousOffset = width - previous.length;
  const currentOffset = width - current.length;

  return Array.from({ length: width }, (_, index) => {
    const previousCharacter =
      index >= previousOffset ? previous[index - previousOffset] : "";
    const currentCharacter =
      index >= currentOffset ? current[index - currentOffset] : "";

    return {
      current: currentCharacter ?? "",
      isDigit:
        isAsciiDigit(previousCharacter) || isAsciiDigit(currentCharacter),
      place: width - index - 1,
      previous: previousCharacter ?? "",
    };
  });
}
