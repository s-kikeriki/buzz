import { expect, type Page, test } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";

/**
 * Projects under the German catalogue, on the mock bridge's public test
 * channel (the same fixture as the English projects screenshots).
 *
 * Assertions are on the words a person reads. Each German string is paired
 * with a negative on the English original, because a missing translation
 * still renders the source and a positive check would pass.
 */

const SHOTS = "test-results/projects-de";
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

async function openProjectsActivity(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("open-projects-view").click();
  await expect(page.getByTestId("projects-page-tabs")).toBeVisible();
  await expect(page.getByTestId("projects-activity-intro")).toBeVisible();
}

test("projects activity reads English before the catalogue is applied", async ({
  page,
}) => {
  await seedLocale(page, "en");
  await installMockBridge(page);
  await openProjectsActivity(page);
  await expect(page.getByTestId("projects-activity-intro")).toContainText(
    "Projects Activity",
  );
  await expect(page.getByTestId("projects-section-all")).toHaveText("Activity");
  await waitForAnimations(page);
  await page.screenshot({ path: `${SHOTS}/activity-en.png`, fullPage: true });
});

test("projects activity and workspace tabs read German", async ({ page }) => {
  await seedLocale(page, "de");
  await installMockBridge(page);
  await openProjectsActivity(page);

  await expect(page.getByTestId("projects-activity-intro")).toContainText(
    "Projektaktivität",
  );
  await expect(page.getByTestId("projects-activity-intro")).not.toContainText(
    "Projects Activity",
  );

  const tabs: Array<[string, string, string]> = [
    ["all", "Aktivität", "Activity"],
    ["projects", "Projekte", "Projects"],
    ["issues", "Aufgaben", "Tasks"],
    ["channels", "Kanäle", "Channels"],
  ];
  for (const [id, german, english] of tabs) {
    const tab = page.getByTestId(`projects-section-${id}`);
    await expect(tab).toHaveText(german);
    await expect(tab).not.toHaveText(english);
  }

  await waitForAnimations(page);
  await page.screenshot({ path: `${SHOTS}/activity-de.png`, fullPage: true });

  await page.getByTestId("projects-section-projects").click();
  const projectEntry = page
    .locator(
      '[data-testid="project-card-buzz"], [data-testid="project-row-buzz"]',
    )
    .first();
  await expect(projectEntry).toBeVisible({ timeout: 10_000 });
  await projectEntry.click();

  for (const [german, english] of [
    ["Übersicht", "Overview"],
    ["Dateien", "Files"],
    ["Aufgaben", "Tasks"],
    ["Kanäle", "Channels"],
    ["Mitwirkende", "Contributors"],
  ] as const) {
    const tab = page.getByRole("tab", { name: german, exact: true });
    await expect(tab).toBeVisible();
    await expect(
      page.getByRole("tab", { name: english, exact: true }),
    ).toHaveCount(0);
  }

  await waitForAnimations(page);
  await page.screenshot({
    path: `${SHOTS}/project-home-de.png`,
    fullPage: true,
  });
});
