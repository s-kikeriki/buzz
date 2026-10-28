/**
 * The single source of the product name shown to users.
 *
 * Nothing in `src/` may hardcode a product name in user-facing copy. Strings
 * that need to name the product interpolate `BRAND.productName` into a
 * catalogue message instead:
 *
 * ```tsx
 * <Trans>Choose the highlight color used throughout {productName}.</Trans>
 * ```
 *
 * That keeps the translated string stable across rebrands — a per-organisation
 * build changes one env var, not a catalogue entry — and it is the shape the
 * `tauri.*.conf.json` overlays already use for `productName` / `identifier`.
 *
 * `VITE_BUZZ_PRODUCT_NAME` is read at build time, so a build overlay sets it
 * the same way it sets any other Vite env var. The fallback keeps the OSS
 * build's own name when no overlay is applied.
 */
import {
  parseConfiguredAccentColor,
  parseDefaultAccentColor,
} from "./brandAccent";
import { parseChromeSurface } from "./brandChrome";
import { parseProductLogoStyle, parseProductLogoUrl } from "./brandLogo";
import { parseThemeLabel } from "./brandThemeLabel";

const DEFAULT_PRODUCT_NAME = "Buzz";

function readProductName(): string {
  const configured = import.meta.env?.VITE_BUZZ_PRODUCT_NAME;
  return typeof configured === "string" && configured.trim().length > 0
    ? configured.trim()
    : DEFAULT_PRODUCT_NAME;
}

export const BRAND = {
  /** Product name for user-facing copy. Never hardcode this string. */
  productName: readProductName(),
  /** Accent colour a fresh install starts on. */
  defaultAccentColor: parseDefaultAccentColor(
    import.meta.env?.VITE_BUZZ_DEFAULT_ACCENT_COLOR,
  ),
  /**
   * The same value, but `null` when this build configured no accent. A branded
   * build's accent outranks the Buzz themes' neutral pin; an unconfigured one
   * must not.
   */
  configuredAccentColor: parseConfiguredAccentColor(
    import.meta.env?.VITE_BUZZ_DEFAULT_ACCENT_COLOR,
  ),
  /** Logo as an inline SVG data URL, or `null` for a build with none. */
  productLogoUrl: parseProductLogoUrl(import.meta.env?.VITE_BUZZ_PRODUCT_LOGO),
  /** The light theme's cut of that logo, or `null` to use the one above in both. */
  productLogoLightUrl: parseProductLogoUrl(
    import.meta.env?.VITE_BUZZ_PRODUCT_LOGO_LIGHT,
  ),
  /**
   * The compact companion mark, for places that want the brand at glyph size
   * rather than as a wordmark — today the onboarding landing field. `null` on
   * a build that declared none.
   */
  productLogoMarkUrl: parseProductLogoUrl(
    import.meta.env?.VITE_BUZZ_PRODUCT_LOGO_MARK,
  ),
  /** Whether that logo is recoloured to the theme or painted as it is. */
  productLogoStyle: parseProductLogoStyle(
    import.meta.env?.VITE_BUZZ_PRODUCT_LOGO_STYLE,
  ),
  /** Whether the navigation chrome stays on ink in both modes. */
  chromeSurface: parseChromeSurface(import.meta.env?.VITE_BUZZ_CHROME_SURFACE),
  /**
   * What the appearance picker calls the first-party theme pair, or `null` to
   * keep calling it "Buzz". Only the label — the `buzz` / `buzz-dark`
   * identifiers are what storage and the stylesheet match on.
   */
  themeLabel: parseThemeLabel(import.meta.env?.VITE_BUZZ_THEME_LABEL),
} as const;
