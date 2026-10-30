import { expect, type Page, test } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";

/**
 * The inbox under the German catalogue.
 *
 * Every surface Ian listed is here: the "All" filter and its menu, the "…"
 * menu with "Show unread only" and "Mark all as read", and the "Mentioned in"
 * line on an inbox row.
 *
 * Assertions are on German text rather than on `data-testid`, for the same
 * reason as the sidebar spec: a testid is still there when the translation is
 * missing, and the point is what a person reads. Each one is paired with a
 * negative on the English original, because a half-applied catalogue renders
 * both and every positive assertion would still pass.
 */

const SHOTS = "test-results/inbox-de";
const LOCALE_STORAGE_KEY = "buzz.appearance.locale";
const THEME_STORAGE_KEY = "buzz-theme";

test.use({ deviceScaleFactor: 2 });

/**
 * Seeded before the bridge: `AppI18nProvider` reads the preference on mount
 * and the bridge is what triggers mount, so seeding after it activates English
 * first and swaps.
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

async function openInbox(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // The nav row has no testid of its own; it is the first button in the
  // pinned primary menu, and under the German catalogue it reads
  // "Posteingang" — which is also the first thing this spec proves.
  await page
    .getByTestId("sidebar-primary-menu")
    .getByRole("button", { name: "Posteingang" })
    .first()
    .click();
  await expect(page.getByTestId("inbox-filter-trigger")).toBeVisible();
}

for (const [mode, theme] of [
  ["light", "buzz"],
  ["dark", "buzz-dark"],
] as const) {
  test(`the inbox filter reads German — ${mode}`, async ({ page }) => {
    await seedGerman(page, theme);
    await installMockBridge(page);
    await openInbox(page);

    const trigger = page.getByTestId("inbox-filter-trigger");
    await expect(trigger).toHaveText("Alle");
    await expect(trigger).not.toHaveText("All");

    await trigger.click();
    const menu = page.locator('[role="menu"]:visible').first();
    await expect(menu).toBeVisible();
    for (const label of [
      "Alle",
      "Projekte",
      "Erwähnungen",
      "Threads",
      "Aktion nötig",
      "Agenten",
      "Erinnerungen",
      "Entwürfe",
    ]) {
      await expect(menu.getByText(label, { exact: true })).toHaveCount(1);
    }
    // `Threads` is deliberately absent from this list: it is the same word in
    // both languages, so asserting it is gone would fail on a correct build.
    for (const english of [
      "All",
      "Projects",
      "Mentions",
      "Needs action",
      "Agents",
      "Reminders",
      "Drafts",
    ]) {
      await expect(menu.getByText(english, { exact: true })).toHaveCount(0);
    }

    await waitForAnimations(page);
    await menu.screenshot({ path: `${SHOTS}/filter-menu-${mode}.png` });
  });
}

test("the inbox options menu reads German", async ({ page }) => {
  await seedGerman(page, "buzz-dark");
  await installMockBridge(page);
  await openInbox(page);

  await page.getByTestId("inbox-options-trigger").click();
  const popover = page.locator("[data-radix-popper-content-wrapper]").first();
  await expect(popover).toBeVisible();

  await expect(
    popover.getByText("Nur ungelesene anzeigen", { exact: true }),
  ).toBeVisible();
  await expect(
    popover.getByText("Alle als gelesen markieren", { exact: true }),
  ).toBeVisible();
  for (const english of ["Show unread only", "Mark all as read"]) {
    await expect(popover.getByText(english, { exact: true })).toHaveCount(0);
  }

  await waitForAnimations(page);
  await popover.screenshot({ path: `${SHOTS}/options-menu-dark.png` });
});

test("an inbox row's type label reads German", async ({ page }) => {
  await seedGerman(page, "buzz-dark");
  await installMockBridge(page);
  await openInbox(page);

  // The row label is the one Ian pointed at. It is built in `inbox.ts`, which
  // hands out descriptors precisely so this line follows a language switch
  // rather than freezing in whichever locale the feed last changed under.
  const labels = page.locator("[data-inbox-type-label]");
  await expect(labels.first()).toBeVisible();

  const texts = await labels.allInnerTexts();
  const joined = texts.join("\n");
  for (const english of [
    "Mentioned in",
    "Needs action in",
    "Thread in",
    "Channel update",
  ]) {
    expect(joined).not.toContain(english);
  }
  // At least one row carries a German phrase, so the negatives above cannot
  // pass by matching nothing at all.
  expect(
    ["Erwähnt in", "Aktion nötig in", "Thread in", "Kanal-Update"].some(
      (german) => joined.includes(german),
    ),
  ).toBe(true);

  await waitForAnimations(page);
  await page
    .getByTestId("home-inbox-list")
    .screenshot({ path: `${SHOTS}/rows-dark.png` });
});

test("the empty inbox reads German", async ({ page }) => {
  await seedGerman(page, "buzz-dark");
  await installMockBridge(page);
  await openInbox(page);

  // Drafts is empty in the mock, which is what makes it the empty-state
  // fixture: its heading comes from `INBOX_EMPTY_STATE_TITLES`, the table the
  // coverage gate could not see until this change.
  await page.getByTestId("inbox-filter-trigger").click();
  await page
    .locator('[role="menuitemradio"]')
    .filter({ hasText: "Entwürfe" })
    .click();

  await expect(page.getByText("Keine Entwürfe", { exact: true })).toBeVisible();
  await expect(page.getByText("No drafts", { exact: true })).toHaveCount(0);

  await waitForAnimations(page);
  // `home-inbox`, not `home-inbox-list`: the list testid belongs to the
  // virtualized list, which is not rendered at all when the filter is empty —
  // so the one shot that is specifically about an empty state is the one that
  // cannot be scoped to it.
  await page
    .getByTestId("home-inbox")
    .screenshot({ path: `${SHOTS}/empty-drafts-dark.png` });
});
