import { expect, type Page, test } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";

/**
 * Agents page under the German catalogue, on the mock bridge.
 *
 * Assertions are on the words a person reads. Each German string is paired
 * with a negative on the English original, because a missing translation
 * still renders the source and a positive check would pass.
 */

const SHOTS = "test-results/agents-de";
const LOCALE_STORAGE_KEY = "buzz.appearance.locale";
const THEME_STORAGE_KEY = "buzz-theme";

test.use({ deviceScaleFactor: 2 });

async function seedLocale(page: Page, locale: "en" | "de") {
  await page.addInitScript(
    ({ localeKey, themeKey, locale: value }) => {
      window.localStorage.setItem(localeKey, value);
      window.localStorage.setItem(themeKey, "buzz");
    },
    { localeKey: LOCALE_STORAGE_KEY, themeKey: THEME_STORAGE_KEY, locale },
  );
}

async function openAgents(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("open-agents-view").click();
  await expect(page.getByTestId("agents-page-content")).toBeVisible();
}

test("agents page reads English before the catalogue is applied", async ({
  page,
}) => {
  await seedLocale(page, "en");
  await installMockBridge(page);
  await openAgents(page);
  await expect(page.getByTestId("agents-page-content")).toContainText(
    "Set up and manage your agents.",
  );
  await expect(page.getByTestId("agent-defaults-button")).toHaveText(
    "Set agent defaults",
  );
  await waitForAnimations(page);
  await page.screenshot({ path: `${SHOTS}/agents-en.png`, fullPage: true });
});

test("agents page reads German", async ({ page }) => {
  await seedLocale(page, "de");
  await installMockBridge(page);
  await openAgents(page);

  const pageContent = page.getByTestId("agents-page-content");
  await expect(pageContent).toContainText(
    "Richte deine Agenten ein und verwalte sie.",
  );
  await expect(pageContent).not.toContainText("Set up and manage your agents.");
  await expect(page.getByTestId("agent-defaults-button")).toHaveText(
    "Agent-Standardwerte festlegen",
  );
  await expect(page.getByTestId("agent-defaults-button")).not.toHaveText(
    "Set agent defaults",
  );

  await waitForAnimations(page);
  await page.screenshot({ path: `${SHOTS}/agents-de.png`, fullPage: true });
});
