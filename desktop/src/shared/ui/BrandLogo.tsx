import { BRAND } from "@/shared/branding/brand";
import type { ProductLogoStyle } from "@/shared/branding/brandLogo";
import { cn } from "@/shared/lib/cn";

type BrandLogoMarkProps = {
  /** Must set a width and a height — a mask box has no intrinsic size. */
  className: string;
  label: string;
  /** The light theme's cut, or `null` to use `url` in both themes. */
  lightUrl?: string | null;
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
 * recolouring — kikeriki's lime, for one.
 *
 * A `color` mark drawn for one surface needs a second cut for the other, and
 * `lightUrl` is it: both images are rendered, and CSS decides which is
 * displayed. Doing it in CSS rather than from the theme context is deliberate
 * — the signal is written by `ThemeProvider` itself, so the swap follows a
 * theme change in the same paint, with no subscription to get out of step and
 * no state to re-read on mount. `hidden` is `display: none`, which takes the
 * other cut out of the accessibility tree too, so the mark is announced once
 * rather than twice.
 *
 * The `dark:` classes below are the fallback, for a theme that paints no
 * chrome canvas of its own. When one is painted, `data-buzz-chrome` on
 * `<html>` overrides them from `theme.css` — the mark sits *on the rail*, so
 * which cut reads is a question about the rail's surface and not about the
 * document. An ink rail under a light document is exactly where those two
 * answers differ, and taking the document's answer there renders the dark-ink
 * wordmark on near-black.
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
  lightUrl,
  style,
  url,
}: BrandLogoMarkProps) {
  if (style === "color") {
    // `object-contain` for the same reason the mask is sized `contain`: the
    // caller sets the box, and an asset whose aspect ratio differs from it
    // must letterbox rather than stretch.
    const image = (variant: "dark" | "light", src: string, show: string) => (
      <img
        alt={label}
        className={cn("object-contain", show, className)}
        data-brand-logo-cut={variant}
        data-testid="brand-logo"
        data-variant={variant}
        draggable={false}
        key={variant}
        src={src}
      />
    );
    if (!lightUrl) {
      return image("dark", url, "inline-block");
    }
    return (
      <>
        {image("light", lightUrl, "inline-block dark:hidden")}
        {image("dark", url, "hidden dark:inline-block")}
      </>
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
      lightUrl={BRAND.productLogoLightUrl}
      style={BRAND.productLogoStyle}
      url={url}
    />
  );
}
