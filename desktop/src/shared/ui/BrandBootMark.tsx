import { BRAND } from "@/shared/branding/brand";
import { cn } from "@/shared/lib/cn";
import { FlappingBee } from "@/shared/ui/buzz-logo/FlappingBee";

/**
 * The mark on the startup gates, as an image.
 *
 * Split from {@link BrandBootMark} for the same reason `BrandLogoMark` is
 * split from `BrandLogo`: `BRAND` is populated from `import.meta.env` at
 * module load, which the unit-test runner has no Vite shim for. Taking the
 * url as a prop is what lets a test bind this code path rather than a copy of
 * it.
 *
 * `buzz-boot-mark` carries the motion (see animations.css). It is on the
 * `<img>` — an HTML element — deliberately: WebKit paints SVG children on the
 * main thread, so an animation inside the mark would freeze for exactly as
 * long as boot work hogs that thread, which is the whole window in which this
 * is on screen. The same reason the bee's wings are HTML-level layers.
 *
 * Decorative: the gate around it already announces itself through its own
 * `sr-only` caption and `role="status"`, so naming the product here would
 * announce the same screen twice.
 */
export function BrandBootMarkImage({
  className,
  url,
}: {
  className?: string;
  url: string;
}) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={cn("buzz-boot-mark block object-contain", className)}
      data-testid="brand-boot-mark"
      src={url}
    />
  );
}

/**
 * The mark the startup gates fly: the brand's own glyph on a build that ships
 * one, the Buzz bee on a build that does not.
 *
 * `logoMark` rather than the wordmark `logo`, because this slot is
 * glyph-sized — the same asset and the same reasoning as the onboarding
 * landing field. A flavor that declares no mark keeps the bee, so the OSS
 * trunk and every flavor that has not drawn one are untouched by construction
 * rather than by omission.
 *
 * For ink surfaces only. The bee is painted in `currentColor` and reads on
 * anything; a `color` mark carries its own colours and is cut for one surface
 * — kikeriki's is white and citron, which vanishes on a light background. The
 * boot gate forces the brand's ink canvas, so the pairing holds there. Any
 * other gate wanting this needs a light cut of the mark first, the way the
 * wordmark has `logoLight`.
 */
export function BrandBootMark({ className }: { className?: string }) {
  const url = BRAND.productLogoMarkUrl;
  if (url === null) {
    return <FlappingBee className={className} />;
  }
  return <BrandBootMarkImage className={className} url={url} />;
}
