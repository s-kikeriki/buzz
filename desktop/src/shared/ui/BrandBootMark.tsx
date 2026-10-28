import { BrandMark, BrandMarkImage } from "@/shared/ui/BrandMark";
import { FlappingBee } from "@/shared/ui/buzz-logo/FlappingBee";

/** The testid the boot-gate specs bind. */
const BOOT_MARK_TEST_ID = "brand-boot-mark";

/**
 * The mark on the startup gates, as an image.
 *
 * A thin naming of {@link BrandMarkImage} for the boot gate's two fixed
 * answers: the gate forces the brand's ink canvas, so the surface is `ink`
 * rather than the document's mode, and the mark breathes because a gate that
 * paints a still frame reads as a hung app.
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
    <BrandMarkImage
      className={className}
      motion
      surface="ink"
      testId={BOOT_MARK_TEST_ID}
      url={url}
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
 * Pinned to the ink surface. The boot gate forces the brand's ink canvas, so
 * the dark cut is right there whatever the document is doing; the surfaces
 * that do not force it ask {@link BrandMark} for `light` or `auto`.
 */
export function BrandBootMark({ className }: { className?: string }) {
  return (
    <BrandMark
      className={className}
      fallback={<FlappingBee className={className} />}
      motion
      surface="ink"
      testId={BOOT_MARK_TEST_ID}
    />
  );
}
