import { expect, type Page, test } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";

/**
 * The sidebar under the German catalogue.
 *
 * `i18n-appearance.spec.ts` already proves the pseudo-locale does not overflow
 * the Settings panel. This one is the other half: that the sidebar's own copy
 * is in the catalogue at all. The two fail differently — a string that was
 * never wrapped renders in English no matter how wide the box is, and a
 * pseudo-locale run cannot see it, because English and accented English are
 * the same length.
 *
 * Assertions are on German text, not on `data-testid`. A testid is still there
 * when the translation is missing; the point here is what a person reads.
 */

const SHOTS = "test-results/sidebar-de";
const LOCALE_STORAGE_KEY = "buzz.appearance.locale";
const THEME_STORAGE_KEY = "buzz-theme";

test.use({ deviceScaleFactor: 2 });

/**
 * Seeded before the bridge, like every other localStorage seed in this suite:
 * `AppI18nProvider` reads the preference on mount and the bridge is what
 * triggers mount. Seeding after it would activate English first and swap.
 */
async function seedGerman(page: Page, theme: string) {
  await page.addInitScript(
    ({ localeKey, themeKey, theme: value }) => {
      window.localStorage.setItem(localeKey, "de");
      window.localStorage.setItem(themeKey, value);
    },
    { localeKey: LOCALE_STORAGE_KEY, themeKey: THEME_STORAGE_KEY, theme },
  );
}

async function openChannel(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("channel-general").click();
  await expect(page.getByTestId("app-sidebar")).toBeVisible();
}

for (const [mode, theme] of [
  ["light", "buzz"],
  ["dark", "buzz-dark"],
] as const) {
  test(`sidebar navigation reads German — ${mode}`, async ({ page }) => {
    await seedGerman(page, theme);
    await installMockBridge(page);
    await openChannel(page);

    const sidebar = page.getByTestId("app-sidebar");

    // The pinned rows and the section titles: the copy visible without
    // opening anything.
    // `filter({ visible: true })` is load-bearing: `SidebarMenuLabel` renders
    // a second, `aria-hidden` copy of the same text in the bold weight to
    // reserve the row's width, so an unfiltered match resolves to an
    // `invisible` span and the assertion fails on a label that is on screen.
    for (const label of [
      "Posteingang",
      "Agenten",
      "Kanäle",
      "Direktnachrichten",
    ]) {
      await expect(
        sidebar.getByText(label, { exact: true }).filter({ visible: true }),
      ).toHaveCount(1);
    }

    // And the English originals are gone, not merely joined. A half-applied
    // catalogue renders both — the German label on one row and the English on
    // the next — which every positive assertion above would still pass.
    for (const english of ["Inbox", "Channels", "Direct messages"]) {
      await expect(sidebar.getByText(english, { exact: true })).toHaveCount(0);
    }

    await waitForAnimations(page);
    await sidebar.screenshot({ path: `${SHOTS}/sidebar-${mode}.png` });
  });
}

test("the channel context menu reads German", async ({ page }) => {
  await seedGerman(page, "buzz-dark");
  await installMockBridge(page);
  await openChannel(page);

  await page.getByTestId("channel-random").click({ button: "right" });

  // The sidebar's own rows are a `role="menu"` too, so `getByRole("menu")`
  // matches more than the popup and `.first()` picked the wrong one. The
  // context menu is the visible Radix content node.
  const menu = page.locator('[role="menu"]:visible').first();
  await expect(menu).toBeVisible();
  // `random` has no unread messages in the mock, so the menu offers "mark
  // unread" rather than "mark as read" — the two are alternatives on the same
  // row, not both present.
  for (const label of [
    "Als ungelesen markieren",
    "Kanal stummschalten",
    "Kanal anheften",
    "Kopieren",
  ]) {
    await expect(
      page.getByRole("menuitem", { name: label, exact: true }),
    ).toBeVisible();
  }

  await waitForAnimations(page);
  await menu.screenshot({ path: `${SHOTS}/channel-menu-dark.png` });
});
