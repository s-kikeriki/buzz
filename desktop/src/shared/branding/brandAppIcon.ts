import { BRAND } from "@/shared/branding/brand";

/**
 * The glyph that sits in the middle of a pairing QR code.
 *
 * `/app-icon@2x.png` is the Buzz bee on its black tile, so a build that ships
 * its own mark must not keep it: the QR is a full-screen surface on two of
 * the app's most identity-shaped moments (mobile pairing, identity recovery),
 * and a bee there says Buzz louder than the branded chrome behind it.
 *
 * The **dark** cut, deliberately, and not the document's mode.
 * {@link StyledQrCode} paints a `foregroundColor` tile behind this image to
 * keep the code scannable, and that colour defaults to black on both call
 * sites — so the centre is a forced dark surface whatever the theme is doing.
 * Asking for the light cut here is how a navy-on-black mark ends up as
 * invisible as the black-on-black wordmark this flavor already shipped once.
 *
 * `logoMark`, not the wordmark `logo`: the slot is a small square, and a wide
 * lockup letterboxed into it is a smudge.
 */
export const BRAND_QR_CENTER_ICON_URL =
  BRAND.productLogoMarkUrl ?? "/app-icon@2x.png";
