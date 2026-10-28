import type { ReactNode } from "react";

import { BRAND } from "@/shared/branding/brand";
import { cn } from "@/shared/lib/cn";

/**
 * Which surface this mark is being painted on.
 *
 * Not which *theme* is active — the two are different questions, and taking
 * the theme's answer is how a mark ends up invisible. The onboarding flow
 * alone has three surfaces that ignore the document mode: the brand-ink
 * canvas is dark under a light document, the hosted-community dialog forces
 * light with `data-system-color-scheme="light"`, and the backup step forces
 * its own dark security theme. Each call site knows which one it is standing
 * on; nothing downstream can work it out.
 *
 * `auto` is for the surfaces that genuinely do follow the document, and is
 * the only value that renders both cuts and lets CSS choose.
 */
export type BrandMarkSurface = "auto" | "ink" | "light";

type BrandMarkImageProps = {
  className?: string;
  /** Empty renders the mark decorative; the surface around it names itself. */
  label?: string;
  /** The light surface's cut, or `null` to use `url` on every surface. */
  lightUrl?: string | null;
  /** Adds the slow breath `buzz-boot-mark` carries on the startup gates. */
  motion?: boolean;
  surface?: BrandMarkSurface;
  testId?: string;
  url: string;
};

function markImage({
  className,
  cut,
  label,
  motion,
  show,
  src,
  surface,
  testId,
}: {
  className?: string;
  cut: "dark" | "light";
  label: string;
  motion: boolean;
  show: string;
  src: string;
  surface: BrandMarkSurface;
  testId: string;
}) {
  return (
    <img
      alt={label}
      aria-hidden={label === "" ? "true" : undefined}
      // `object-contain` for the same reason `BrandLogoMark` uses it: the
      // caller owns the box, and a mark whose aspect ratio differs from it
      // must letterbox rather than stretch.
      className={cn(
        "object-contain",
        motion && "buzz-boot-mark",
        show,
        className,
      )}
      data-brand-mark-cut={cut}
      data-brand-mark-surface={surface}
      data-testid={testId}
      draggable={false}
      key={cut}
      src={src}
    />
  );
}

/**
 * The flavor's glyph-sized mark, as an image.
 *
 * Split from {@link BrandMark} for the reason `BrandLogoMark` is split from
 * `BrandLogo`: `BRAND` is populated from `import.meta.env` at module load,
 * which the unit-test runner has no Vite shim for. Taking the urls as props
 * is what lets a test bind this code path rather than a copy of it.
 *
 * On `auto` both cuts are rendered and Tailwind's `dark:` variant hides one.
 * On a named surface only one cut is rendered at all: a surface that has
 * already opted out of the document mode would get the wrong answer from a
 * `dark:` variant, and the right one is known here for free.
 *
 * `data-brand-mark-cut` is deliberately **not** `BrandLogo`'s
 * `data-brand-logo-cut`. Those rules in `theme.css` resolve the cut from
 * `data-buzz-chrome`, which is the right question for a mark sitting on the
 * navigation rail and the wrong one everywhere here: under ink chrome they
 * set `display: none` on every light cut in the document, which would hide
 * the hosted-community dialog's mark on exactly the build this exists for.
 * A separate attribute no stylesheet matches is what keeps the explicit
 * surface above authoritative.
 *
 * The motion is on the `<img>` — an HTML element — rather than inside the
 * SVG, for the reason the bee's wings are HTML layers: WebKit paints SVG
 * children on the main thread, so an animation inside the mark freezes for
 * exactly as long as boot work holds that thread.
 */
export function BrandMarkImage({
  className,
  label = "",
  lightUrl,
  motion = false,
  surface = "auto",
  testId = "brand-mark",
  url,
}: BrandMarkImageProps) {
  const light = lightUrl ?? url;
  if (surface === "ink") {
    return markImage({
      className,
      cut: "dark",
      label,
      motion,
      show: "inline-block",
      src: url,
      surface,
      testId,
    });
  }
  if (surface === "light") {
    return markImage({
      className,
      cut: "light",
      label,
      motion,
      show: "inline-block",
      src: light,
      surface,
      testId,
    });
  }
  if (!lightUrl) {
    return markImage({
      className,
      cut: "dark",
      label,
      motion,
      show: "inline-block",
      src: url,
      surface,
      testId,
    });
  }
  return (
    <>
      {markImage({
        className,
        cut: "light",
        label,
        motion,
        show: "inline-block dark:hidden",
        src: light,
        surface,
        testId,
      })}
      {markImage({
        className,
        cut: "dark",
        label,
        motion,
        show: "hidden dark:inline-block",
        src: url,
        surface,
        testId,
      })}
    </>
  );
}

/**
 * The brand's own glyph where the Buzz bee used to be, or the bee.
 *
 * `fallback` is the stock node, passed in rather than chosen here: the sites
 * this replaces do not all fly the same bee — one is the static `BuzzMark`,
 * one the `FlappingBee`, one the animated `FuzzyLogo` — and collapsing them
 * into a single default would change the OSS trunk's own screens, which is
 * the one thing a flavor must never do. A build that declares no `logoMark`
 * renders exactly what it rendered before, by construction.
 */
export function BrandMark({
  className,
  fallback,
  label,
  motion,
  surface,
  testId,
}: {
  className?: string;
  fallback: ReactNode;
  label?: string;
  motion?: boolean;
  surface?: BrandMarkSurface;
  testId?: string;
}) {
  const url = BRAND.productLogoMarkUrl;
  if (url === null) {
    return <>{fallback}</>;
  }
  return (
    <BrandMarkImage
      className={className}
      label={label}
      lightUrl={BRAND.productLogoMarkLightUrl}
      motion={motion}
      surface={surface}
      testId={testId}
      url={url}
    />
  );
}
