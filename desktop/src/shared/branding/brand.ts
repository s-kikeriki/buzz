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
import { parseDefaultAccentColor } from "./brandAccent";
import { parseProductLogoUrl } from "./brandLogo";

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
  /** Single-colour logo as an SVG data URL, or `null` for a build with none. */
  productLogoUrl: parseProductLogoUrl(import.meta.env?.VITE_BUZZ_PRODUCT_LOGO),
} as const;
