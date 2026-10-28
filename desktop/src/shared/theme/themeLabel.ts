/**
 * Display labels for the appearance picker's theme tiles.
 *
 * Every label is derived from the theme's identifier rather than stored
 * alongside it, which is what keeps a new Shiki bundle from needing a label
 * entry — and is also why renaming the first-party pair is a formatting
 * question rather than a data one. See `brandThemeLabel.ts` for why the
 * identifiers themselves cannot move.
 */

import { BRAND } from "@/shared/branding/brand";
import { BUZZ_DARK_THEME_NAME, BUZZ_THEME_NAME } from "./theme-loader";

/** The pair a flavor's `themeLabel` renames. Nothing else is branded. */
const BRANDED_THEMES = new Set<string>([BUZZ_THEME_NAME, BUZZ_DARK_THEME_NAME]);

function titleCaseWord(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * The identifier's segments as display words, with the brand word substituted
 * on a build that configured one.
 *
 * Substituting the segment rather than the finished string is what preserves
 * the pair's existing shape: `buzz` keeps rendering as one word and
 * `buzz-dark` as that word plus "Dark", so a rename cannot quietly add or
 * drop a qualifier. It also leaves the brand's own casing alone — `kikeriki`
 * is lowercase by design and title-casing it would be a second, unasked-for
 * rename.
 */
function labelWords(name: string, brandLabel: string | null): string[] {
  const segments = name.split("-");
  if (brandLabel !== null && BRANDED_THEMES.has(name)) {
    return [brandLabel, ...segments.slice(1).map(titleCaseWord)];
  }
  return segments.map(titleCaseWord);
}

/**
 * Display label for one theme.
 *
 * `brandLabel` is a parameter with a default rather than a bare read of
 * `BRAND` so the branching is testable without a Vite environment; callers in
 * the app pass nothing and get this build's own label.
 */
export function formatThemeLabel(
  name: string,
  brandLabel: string | null = BRAND.themeLabel,
): string {
  return labelWords(name, brandLabel).join(" ");
}

/**
 * Display label for a paired theme, derived from its light variant's name.
 *
 * Strips mode-specific tokens (light, latte, dawn, lotus, ochin, lighter,
 * plus) from any position, handling names like `github-light-default`,
 * `light-plus`, `material-theme-lighter` and `gruvbox-light-soft`.
 */
export function pairedThemeLabel(
  lightName: string,
  brandLabel: string | null = BRAND.themeLabel,
): string {
  const modeTokens = new Set([
    "light",
    "latte",
    "dawn",
    "lotus",
    "ochin",
    "lighter",
    "plus",
  ]);
  const parts = lightName.split("-").filter((t) => !modeTokens.has(t));
  // If stripping removed everything (e.g. "light-plus"), fall back to the raw name
  const base = parts.length > 0 ? parts.join("-") : lightName;
  return formatThemeLabel(base, brandLabel);
}
