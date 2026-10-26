import { BRAND } from "@/shared/branding/brand";
import { cn } from "@/shared/lib/cn";

type BrandLogoMarkProps = {
  /** Must set a width and a height — a mask box has no intrinsic size. */
  className: string;
  label: string;
  url: string;
};

/**
 * The mark itself, painted as a mask over `currentColor`.
 *
 * A mask rather than an `<img>` so the logo inherits the surrounding text
 * colour: one asset then reads correctly in both the light and the dark
 * theme, where two files would drift apart.
 *
 * Split from {@link BrandLogo} for the same reason `brandAccent.ts` is split
 * from `brand.ts` — `BRAND` is populated from `import.meta.env` at module
 * load, which the unit-test runner has no Vite shim for. Keeping the rendering
 * in a component that takes its url as a prop is what lets the tests bind this
 * code path instead of a copy of it.
 */
export function BrandLogoMark({ className, label, url }: BrandLogoMarkProps) {
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
    <BrandLogoMark className={className} label={BRAND.productName} url={url} />
  );
}
