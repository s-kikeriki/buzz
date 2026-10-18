import { expect, test, type Page } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";

const LOCALE_STORAGE_KEY = "buzz.appearance.locale";

/**
 * Proves the Appearance panel survives translation.
 *
 * Two different failures are in scope and they fail for different reasons:
 *
 *  - **Untranslated copy** — a string that never reached the catalogue still
 *    renders in English under `de`. The German assertions below catch that.
 *  - **Overflow** — German runs roughly 30% longer than English, and this
 *    panel is full of fixed-width segmented controls (`w-48`, `w-72`). The
 *    `pseudo` locale pads every string further still, so it fails here rather
 *    than in a customer's window.
 */
async function openAppearanceIn(page: Page, locale: "en" | "de" | "pseudo") {
  // Must run before installMockBridge: React reads the preference on mount
  // and the bridge is what triggers that mount.
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: LOCALE_STORAGE_KEY, value: locale },
  );
  await installMockBridge(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("open-settings").click();
  await page.getByTestId("profile-popover-settings").click();
  await page.getByTestId("settings-nav-appearance").click();
  await expect(page.getByTestId("settings-theme")).toBeVisible({
    timeout: 10_000,
  });
  await waitForAnimations(page);
}

/**
 * Segmented controls are the panel's tightest copy slot: a fixed-width
 * `fieldset` (`w-48` / `w-72`) that is `h-8` and `overflow-hidden`, holding
 * equal-fraction grid columns.
 *
 * Measured, not assumed: a label too long for its column does **not** widen
 * the button — the text wraps, the button grows taller (28px → 48px for three
 * lines), and the fieldset clips it vertically. So the honest signal is the
 * fieldset's `scrollHeight`, not any button's `scrollWidth`. Both axes are
 * checked anyway; a future `whitespace-nowrap` would move the failure back to
 * the horizontal one. One pixel of slack absorbs sub-pixel rounding.
 */
async function clippedControls(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="settings-theme"]');
    if (!panel) throw new Error("Appearance panel is not mounted");

    const controls = panel.querySelectorAll(
      'fieldset[data-slot="segmented-control"]',
    );
    if (controls.length === 0) {
      throw new Error("No segmented controls found — selector is stale");
    }

    const clipped: string[] = [];
    for (const control of controls) {
      const id = control.getAttribute("data-testid") ?? "(unnamed)";
      if (control.scrollHeight > control.clientHeight + 1) {
        clipped.push(
          `${id} clipped vertically (${control.scrollHeight}>${control.clientHeight}): ${control.textContent?.trim()}`,
        );
      }
      if (control.scrollWidth > control.clientWidth + 1) {
        clipped.push(
          `${id} clipped horizontally (${control.scrollWidth}>${control.clientWidth}): ${control.textContent?.trim()}`,
        );
      }
    }
    return clipped;
  });
}

async function documentOverflowsHorizontally(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth > root.clientWidth + 1;
  });
}

test("renders the Appearance panel in English", async ({ page }) => {
  await openAppearanceIn(page, "en");

  await expect(page.getByTestId("settings-theme")).toContainText("Appearance");
  await expect(page.getByTestId("language-row")).toContainText("Language");
  await expect(page.getByTestId("font-size-row")).toContainText("Font size");
});

test("renders the Appearance panel in German", async ({ page }) => {
  await openAppearanceIn(page, "de");

  // Section header, a preference label, and a segment label — three different
  // extraction shapes (<Trans>, <Trans>, msg`` resolved at render).
  await expect(page.getByTestId("settings-theme")).toContainText("Darstellung");
  await expect(page.getByTestId("font-size-row")).toContainText("Schriftgröße");
  await expect(page.getByTestId("font-size-control")).toContainText("Größer");

  // The product name is interpolated, not baked into the German string.
  await expect(page.getByTestId("conversation-density-row")).toContainText(
    "Buzz",
  );

  // If any of the above still read English, the catalogue missed them.
  await expect(page.getByTestId("font-size-row")).not.toContainText(
    "Font size",
  );
});

test("sets the document language so screen readers follow the locale", async ({
  page,
}) => {
  await openAppearanceIn(page, "de");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
});

test("switching language in the picker re-renders without a reload", async ({
  page,
}) => {
  await openAppearanceIn(page, "en");

  await page.getByTestId("language-de").click();

  await expect(page.getByTestId("font-size-row")).toContainText("Schriftgröße");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
});

test("German copy does not overflow the Appearance panel", async ({ page }) => {
  await openAppearanceIn(page, "de");

  expect(await clippedControls(page)).toEqual([]);
  expect(await documentOverflowsHorizontally(page)).toBe(false);
});

test("pseudo-locale copy does not overflow the Appearance panel", async ({
  page,
}) => {
  await openAppearanceIn(page, "pseudo");

  // Sanity-check the stress input is actually applied — an empty pseudo
  // catalogue would make the overflow assertions below pass for free.
  await expect(page.getByTestId("font-size-row")).not.toContainText(
    "Font size",
  );

  expect(await clippedControls(page)).toEqual([]);
  expect(await documentOverflowsHorizontally(page)).toBe(false);
});
