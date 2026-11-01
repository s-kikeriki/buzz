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

/**
 * The surfaces behind a click, which is where the English survived.
 *
 * The agents page itself read German while the create-agent dialog's submit
 * button still said "Add agent" and the team menu still said "Choose from
 * catalog". Neither the catalogue gate nor the hardcoded-copy detector could
 * see them: the catalogue was complete, and the two copy tables they came
 * from mix `msg` descriptors with plain strings, which switches the
 * detector's copy-table rule off for the whole object. Only a rendered screen
 * finds that, so these assert it.
 */
test("the agent and team dialogs behind a click read German", async ({
  page,
}) => {
  await seedLocale(page, "de");
  await installMockBridge(page);
  await openAgents(page);

  await page.getByTestId("new-agent-card").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const submit = dialog.getByTestId("persona-dialog-submit");
  await expect(submit).toHaveText("Agent hinzufügen");
  await expect(submit).not.toHaveText("Add agent");
  await waitForAnimations(page);
  await page.screenshot({
    path: `${SHOTS}/create-agent-de.png`,
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.getByTestId("new-team-card").click();
  const catalogItem = page.getByTestId("team-catalog-open");
  await expect(catalogItem).toHaveText("Aus dem Katalog wählen");
  await expect(catalogItem).not.toHaveText("Choose from catalog");
});
