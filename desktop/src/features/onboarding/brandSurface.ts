import type { CSSProperties } from "react";

import { BRAND } from "@/shared/branding/brand";

/**
 * Whether this build paints the first-run canvas on the brand's ink surface.
 *
 * The same flavor fact that keeps the navigation rail dark in both document
 * modes — a brand whose house style is a black header over a white body. Every
 * first-run surface is chrome: it is the window before the user has a document
 * to be in. They follow the one declaration rather than each deciding for
 * itself, which is how the landing came to be ink while the six pages behind
 * it stayed Buzz chartreuse.
 *
 * Lifted out of `MachineOnboardingFlow` when the second and third surface
 * needed it. A copy per screen is a copy per screen that can be forgotten.
 */
export const BRAND_INK_ONBOARDING = BRAND.chromeSurface === "ink";

/**
 * The flavor's accent, handed to the stylesheet rather than written into it.
 *
 * `components.css` must stay organisation-neutral — no flavor's colour is
 * baked into the trunk — so the brand-ink block reads `--buzz-brand-accent`
 * and this supplies it from the build's own configuration. `undefined` on a
 * build with no configured accent leaves the block's own fallback in place.
 */
export const BRAND_ACCENT_STYLE: CSSProperties | undefined =
  BRAND_INK_ONBOARDING && BRAND.configuredAccentColor !== null
    ? ({
        "--buzz-brand-accent": BRAND.configuredAccentColor,
      } as CSSProperties)
    : undefined;

/**
 * Which cut of the brand mark reads on a first-run surface.
 *
 * `ink` once the shell is repainted, and the stock chartreuse-to-light-blue
 * gradient otherwise — both are fixed surfaces that ignore the document mode,
 * so neither can be answered by a `dark:` variant.
 */
export const BRAND_ONBOARDING_SURFACE = BRAND_INK_ONBOARDING ? "ink" : "light";

/** The shell class for a brand-ink first-run screen, or nothing. */
export const BRAND_INK_SHELL_CLASS = BRAND_INK_ONBOARDING
  ? "buzz-onboarding-brand-ink"
  : undefined;

/**
 * The OS colour-scheme pin a first-run shell should carry.
 *
 * `undefined` on a brand-ink build, and the caller's own value otherwise.
 * This is not a cosmetic suppression: `.buzz-onboarding-neutral-theme[data-
 * system-color-scheme="light"]` is a two-class selector declared *after*
 * `.buzz-onboarding-brand-ink` and sets the same tokens on the same element,
 * so on a machine reporting a light OS scheme it silently wins and the shell
 * renders white with near-black text under an ink dot grid. The landing
 * escaped it only because it never set the attribute. A build that has
 * already pinned its own surface has no question for the OS.
 */
export function brandOnboardingColorScheme(
  scheme: "dark" | "light" | undefined,
): "dark" | "light" | undefined {
  return BRAND_INK_ONBOARDING ? undefined : scheme;
}

/**
 * The counter-pin for a white content card sitting on that ink shell.
 *
 * See `.buzz-onboarding-brand-ink-card` in `components.css`: the shell
 * inverts `--foreground`, and a card that hardcodes `bg-white` and paints its
 * text with `text-foreground` needs it back.
 */
export const BRAND_INK_CARD_CLASS = BRAND_INK_ONBOARDING
  ? "buzz-onboarding-brand-ink-card"
  : undefined;
