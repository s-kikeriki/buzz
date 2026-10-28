import { expect, type Page, test } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";

/**
 * The flavor's name for the first-party theme pair.
 *
 * What this binds is the part a unit test cannot reach: that the label the
 * appearance picker renders comes from the flavor at all. `themeLabel.ts` can
 * be entirely correct while the panel still formats its own labels — it did
 * until this change — and every unit test would pass. Only a bundle built
 * with the flavor's env answers that, which is why these run against one.
 */

const SHOTS = "test-results/kikeriki-theme";
const THEME_STORAGE_KEY = "buzz-theme";
const FOLLOW_SYSTEM_KEY = "buzz-follow-system";
const BRAND_LABEL = "kikeriki";

test.use({ deviceScaleFactor: 2 });

async function seed(page: Page, theme: string, followSystem: boolean) {
  await page.addInitScript(
    ({ themeKey, themeValue, followKey, followValue }) => {
      window.localStorage.setItem(themeKey, themeValue);
      window.localStorage.setItem(followKey, followValue);
    },
    {
      themeKey: THEME_STORAGE_KEY,
      themeValue: theme,
      followKey: FOLLOW_SYSTEM_KEY,
      followValue: followSystem ? "true" : "false",
    },
  );
}

async function openAppearance(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("app-sidebar")).toBeVisible();
  // Same three steps as `i18n-appearance.spec.ts`: the profile button opens a
  // popover, not the settings panel. The popover animates in, and a click
  // landing mid-animation is retried against an element Radix then detaches —
  // so settle it before reaching for the item.
  await page.getByTestId("open-settings").click();
  await waitForAnimations(page);
  await page.getByTestId("profile-popover-settings").click();
  await waitForAnimations(page);
  await page.getByTestId("settings-nav-appearance").click();
  await expect(page.getByTestId("settings-theme")).toBeVisible({
    timeout: 20_000,
  });
  await waitForAnimations(page);
}

/**
 * The label for the currently selected theme.
 *
 * Read off the trigger's `aria-label` rather than its text: the collapsed row
 * shows a colour preview and a chevron and no words at all, so the accessible
 * name is the only place the selected theme is actually named — and it is what
 * a screen-reader user hears, which makes it the right thing to bind.
 */
function selectedThemeLabel(page: Page) {
  return page
    .getByTestId("theme-style-trigger")
    .getAttribute("aria-label")
    .then((value) => value ?? "");
}

/**
 * Which flavor the bundle under test was built with, declared by the runner.
 *
 * The obvious gate — "skip when the tile still says Buzz" — is the one gate
 * this file must not use. Deleting the substitution in `themeLabel.ts` makes
 * the tile say "Buzz", so that gate would turn the exact regression these
 * tests exist for into a skip, and a skipped test reads green. The condition
 * has to be independent of the thing under test, so the runner states it:
 *
 *     BUZZ_E2E_FLAVOR=ki.keriki pnpm exec playwright test --project=smoke \
 *       tests/e2e/kikeriki-theme.spec.ts
 *
 * Unset means a stock bundle and these skip, which is correct — a trunk build
 * has no flavor and should not be failed for saying "Buzz". Set means the
 * bundle is claimed to carry the flavor, and from there every assertion is
 * unconditional.
 */
const E2E_FLAVOR = process.env.BUZZ_E2E_FLAVOR;

test.skip(
  E2E_FLAVOR !== "ki.keriki",
  "stock bundle: build the e2e bundle with the ki.keriki flavor env and " +
    "re-run with BUZZ_E2E_FLAVOR=ki.keriki",
);

test.describe("ki.keriki theme label", () => {
  test("the dark member is the flavor's name plus Dark", async ({ page }) => {
    await seed(page, "buzz-dark", false);
    await installMockBridge(page);
    await openAppearance(page);

    expect(await selectedThemeLabel(page)).toContain(`${BRAND_LABEL} Dark`);
    // The identifier is untouched — that is what storage and `theme.css`
    // match on, and renaming it would strand an existing selection.
    await expect(page.getByTestId("appearance-mode-dark")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      await page.evaluate(() => window.localStorage.getItem("buzz-theme")),
    ).toBe("buzz-dark");
    expect(
      await page.evaluate(() =>
        document.documentElement.getAttribute("data-buzz-theme"),
      ),
    ).toBe("buzz-dark");

    await page.getByTestId("theme-style-trigger").click();
    await waitForAnimations(page);
    await expect(page.getByTestId("theme-option-buzz-dark")).toContainText(
      `${BRAND_LABEL} Dark`,
    );
    await expect(page.getByTestId("settings-theme")).not.toContainText(
      /\bBuzz\b/,
    );
    await page
      .getByTestId("settings-theme")
      .screenshot({ path: `${SHOTS}/appearance-dark.png` });
  });

  test("the light member keeps the pair's one-word shape", async ({ page }) => {
    await seed(page, "buzz", false);
    await installMockBridge(page);
    await openAppearance(page);

    // "kikeriki", not "kikeriki Light": the Buzz pair labels its light member
    // with the bare name today, and the rename is a substitution, not a
    // reshaping.
    const label = await selectedThemeLabel(page);
    expect(label).toContain(BRAND_LABEL);
    expect(label).not.toContain("Dark");
    expect(
      await page.evaluate(() => window.localStorage.getItem("buzz-theme")),
    ).toBe("buzz");

    await page.getByTestId("theme-style-trigger").click();
    await waitForAnimations(page);
    await expect(page.getByTestId("theme-option-buzz")).toContainText(
      BRAND_LABEL,
    );
    await page
      .getByTestId("settings-theme")
      .screenshot({ path: `${SHOTS}/appearance-light.png` });
  });

  test("System mode shows the renamed pair as one tile", async ({ page }) => {
    await seed(page, "buzz", true);
    await installMockBridge(page);
    await openAppearance(page);

    expect(await selectedThemeLabel(page)).toContain(BRAND_LABEL);
    await page.getByTestId("theme-style-trigger").click();
    await waitForAnimations(page);
    await expect(page.getByTestId("theme-pair-buzz")).toContainText(
      BRAND_LABEL,
    );
    await page
      .getByTestId("settings-theme")
      .screenshot({ path: `${SHOTS}/appearance-system.png` });
  });

  test("no other theme is renamed", async ({ page }) => {
    await seed(page, "github-dark", false);
    await installMockBridge(page);
    await openAppearance(page);

    await page.getByTestId("theme-style-trigger").click();
    await waitForAnimations(page);
    // Reached through the flavored bundle rather than the unit test, because
    // this is the assertion that a too-eager substitution would break.
    await expect(page.getByTestId("theme-option-github-dark")).toContainText(
      "Github Dark",
    );
    await expect(page.getByTestId("theme-option-dracula")).toContainText(
      "Dracula",
    );
  });
});
