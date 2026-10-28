import { BRAND } from "@/shared/branding/brand";

/** Where `index.html` declares the stock icon. */
const ICON_LINK_SELECTOR = 'link[rel="icon"]';

/**
 * Point the document icon at the flavor's own mark.
 *
 * `index.html` is a static file served to every build, so it hardcodes
 * `/buzz.svg` — the Buzz bee. Inside Tauri nothing renders it, which is why it
 * survived the rest of the rebrand; it is the window icon on Linux and
 * Windows, and it is the tab icon in every browser the built frontend is
 * opened in, including the flavor preview used to review these very screens.
 *
 * Done here rather than in `index.html` because the mark travels as a base64
 * data URL in the build environment, and a static HTML file cannot read one.
 *
 * A build that declares no mark changes nothing: the element is left exactly
 * as the document shipped it.
 */
export function applyBrandFavicon(doc: Document = document): void {
  const url = BRAND.productLogoMarkUrl;
  if (url === null) {
    return;
  }
  const link = doc.querySelector<HTMLLinkElement>(ICON_LINK_SELECTOR);
  if (!link) {
    return;
  }
  link.type = "image/svg+xml";
  link.href = url;
}
