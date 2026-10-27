import { expect, type Page, test } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";

/**
 * The flavor brand mark at the foot of the sidebar.
 *
 * The mark only renders when the build carries `VITE_BUZZ_PRODUCT_LOGO`, which
 * `scripts/flavor-config.mjs` emits from a flavor's `logo` field — the OSS
 * build has none and renders nothing. So the box assertions below run against
 * whichever mark the build was given, and the whole file no-ops on a build
 * with no flavor rather than failing: asserting "a logo is present" in the
 * default e2e build would fail for the trunk, which is correct behaviour.
 *
 * What is asserted is the *box*, not the artwork. `BrandLogo` sizes itself
 * entirely from the class `SidebarProfileCard` hands it, and both painting
 * modes letterbox into that box (`object-contain` / `mask … / contain`), so a
 * wrong box is the one way the mark can come out the wrong size. 2.5:1 is the
 * ratio `flavors/logos/README.md` asks a flavor's artwork to keep.
 */

const SHOTS = "test-results/brand-logo";
const THEME_STORAGE_KEY = "buzz-theme";

/** The box `SidebarProfileCard` gives the mark, in CSS pixels. */
const LOGO_BOX = { height: 16, width: 40 };

test.use({ deviceScaleFactor: 2 });

async function seedTheme(page: Page, theme: string) {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: THEME_STORAGE_KEY, value: theme },
  );
}

async function openChannel(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("channel-general").click();
  await expect(page.getByTestId("chat-title")).toHaveText("general");
  await expect(page.getByTestId("app-sidebar")).toBeVisible();
}

/**
 * The mark, or `null` on a build with no flavor logo.
 *
 * Scoped to the profile card rather than the page: `BrandLogoMark` renders
 * *both* cuts of a `color` mark and lets CSS hide one, so a page-wide
 * `data-testid` lookup is ambiguous by design. `:visible` picks the cut the
 * current theme displays, which is also the one whose box we care about.
 */
function visibleMark(page: Page) {
  return page
    .getByTestId("sidebar-profile-card")
    .locator('[data-testid="brand-logo"]:visible');
}

for (const [mode, theme] of [
  ["light", "buzz"],
  ["dark", "buzz-dark"],
] as const) {
  test(`sidebar brand mark — ${mode}`, async ({ page }) => {
    await seedTheme(page, theme);
    await installMockBridge(page);
    await openChannel(page);

    const card = page.getByTestId("sidebar-profile-card");
    await expect(card).toBeVisible();

    const mark = visibleMark(page);
    if ((await mark.count()) === 0) {
      test.skip(true, "this build carries no flavor logo");
      return;
    }

    // Exactly one cut is displayed. Both being visible is the failure mode
    // the `dark:hidden` / `hidden dark:inline-block` pair exists to prevent,
    // and it would read on screen as a doubled mark.
    await expect(mark).toHaveCount(1);

    const box = await mark.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.round(box?.height ?? 0)).toBe(LOGO_BOX.height);
    expect(Math.round(box?.width ?? 0)).toBe(LOGO_BOX.width);

    // The row is laid out around the 32px avatar. A mark taller than that
    // would push the card open and move every row above it, which is not a
    // change to the logo — it is a change to the sidebar.
    const avatar = page.getByTestId("sidebar-profile-avatar-button");
    const avatarBox = await avatar.boundingBox();
    expect(box?.height ?? 0).toBeLessThanOrEqual(avatarBox?.height ?? 0);

    await waitForAnimations(page);
    await card.screenshot({ path: `${SHOTS}/profile-card-${mode}.png` });
    await page
      .getByTestId("app-sidebar")
      .screenshot({ path: `${SHOTS}/sidebar-${mode}.png` });
  });
}
