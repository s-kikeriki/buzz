import { BRAND } from "@/shared/branding/brand";

/**
 * The custom property every text surface resolves its family through.
 *
 * Declared with the stock stack in `theme.css`, so an unflavored build needs
 * nothing from this module and a flavored one overrides exactly one value.
 */
const FONT_VARIABLE = "--font-sans";

/**
 * Paint this build's text in the flavor's own family.
 *
 * Done at runtime on the root element rather than in the stylesheet because
 * the family travels in the build environment, and `theme.css` is a static
 * file with no way to read one. Tailwind's `font-sans` and the `body` rule
 * both resolve through {@link FONT_VARIABLE}, so setting it here moves every
 * text surface in one assignment instead of per component.
 *
 * A build that declares no font changes nothing: the property keeps the
 * declaration `theme.css` shipped, which is the stack Buzz has always used.
 */
export function applyBrandFont(doc: Document = document): void {
  const stack = BRAND.fontStack;
  if (stack === null) {
    return;
  }
  doc.documentElement.style.setProperty(FONT_VARIABLE, stack);
}
