import { BRAND } from "@/shared/branding/brand";
import type { ProductLogoStyle } from "@/shared/branding/brandLogo";
import { cn } from "@/shared/lib/cn";

type BrandLogoMarkProps = {
  /** Must set a width and a height — a mask box has no intrinsic size. */
  className: string;
  label: string;
  style: ProductLogoStyle;
  url: string;
};

/**
 * The mark itself, in whichever of the two forms the flavor declared.
 *
 * `mask` paints the asset as a mask over `currentColor`, so the logo inherits
 * the surrounding text colour and one file reads in both the light and the
 * dark theme. `color` paints the same asset as an image with its own colours
 * intact, for a mark whose colours are part of the brand and survive no
 * recolouring — kikeriki's lime, for one. The asset then has to read on the
 * surface it lands on, which is the flavor's problem and not this component's.
 *
 * Split from {@link BrandLogo} for the same reason `brandAccent.ts` is split
 * from `brand.ts` — `BRAND` is populated from `import.meta.env` at module
 * load, which the unit-test runner has no Vite shim for. Keeping the rendering
 * in a component that takes its url as a prop is what lets the tests bind this
 * code path instead of a copy of it.
 */
export function BrandLogoMark({
  className,
  label,
  style,
  url,
}: BrandLogoMarkProps) {
  if (style === "color") {
    return (
      // `object-contain` for the same reason the mask is sized `contain`: the
      // caller sets the box, and an asset whose aspect ratio differs from it
      // must letterbox rather than stretch.
      <img
        alt={label}
        className={cn("inline-block object-contain", className)}
        data-testid="brand-logo"
        draggable={false}
        src={url}
      />
    );
  }
  const mask = `url("${url}") center / contain no-repeat`;
  return (
    <span
      aria-label={label}
      className={cn("inline-block bg-current", className)}
      data-testid="brand-logo"
      role="img"
      style={{ mask, WebkitMask: mask }}
    />
  );
}

/**
 * The organisation's logo, or nothing at all.
 *
 * A build whose flavor declares no `logo` — the OSS trunk included — renders
 * nothing. There is deliberately no placeholder mark: an unbranded build
 * should look unbranded rather than half-branded.
 */
export function BrandLogo({ className }: { className: string }) {
  const url = BRAND.productLogoUrl;
  if (!url) {
    return null;
  }
  return (
    <BrandLogoMark
      className={className}
      label={BRAND.productName}
      style={BRAND.productLogoStyle}
      url={url}
    />
  );
}
