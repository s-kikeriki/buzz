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

/**
 * Assert a section tab reads `wanted` and not `other`.
 *
 * Each tab prints its label twice: an `invisible` bold copy in the same grid
 * cell reserves the selected width so nothing shifts, and the visible copy
 * sits on top. So `textContent` is "AktivitätAktivität" and an equality
 * assertion on the label can never pass. Check the accessible name, which is
 * the single `aria-label` a screen reader announces, and pair it with a
 * substring negative on the other language — equality would pass against the
 * doubled string whatever it said.
 */
async function expectTabReads(
  page: Page,
  id: string,
  wanted: string,
  other: string,
) {
  const tab = page.getByTestId(`projects-section-${id}`);
  await expect(tab).toHaveAccessibleName(wanted);
  await expect(tab).toContainText(wanted);
  await expect(tab).not.toContainText(other);
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
  await expectTabReads(page, "all", "Activity", "Aktivität");
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
    await expectTabReads(page, id, german, english);
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

  // Project home is the context rail, not a tab strip — the `role="tab"`
  // row this used to look for does not exist on this surface, so the check
  // never reached a real element. Assert the rail a person actually reads.
  const rail = page.getByTestId("project-home-context-panel");
  await expect(rail).toBeVisible({ timeout: 10_000 });

  for (const [testId, german, english] of [
    ["project-home-context-tasks", "Aufgaben", "Tasks"],
    ["project-home-context-files", "Dateien", "Files"],
    ["project-home-context-people", "Personen", "People"],
    ["project-home-context-channel", "Kanäle", "Channels"],
    ["project-home-context-codebase", "Codebasis", "Codebase"],
  ] as const) {
    const entry = rail.getByTestId(testId);
    await expect(entry).toContainText(german);
    await expect(entry).not.toContainText(english);
  }

  await waitForAnimations(page);
  await page.screenshot({
    path: `${SHOTS}/project-home-de.png`,
    fullPage: true,
  });
});
