import { expect, type Page, test } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";

/**
 * The search palette, channel browser and shortcut help under the German
 * catalogue.
 *
 * These are the screens Ian reported: with the app set to German, the palette
 * still said "Search for a message", "Search in #…", "Search messages in this
 * channel", "Recent activity", "Actions" and "Browse channels". Every one of
 * those was a string that had never been marked for translation, so no
 * catalogue could hold it and the pseudo-locale run could not see it either —
 * accented English is still English-shaped.
 *
 * Assertions are on what a person reads, not on `data-testid`: a testid is
 * still there when the translation is missing. Each screen also asserts the
 * **absence** of its English original, because a half-applied catalogue
 * renders both and every positive assertion above would still pass.
 */

const SHOTS = "test-results/search-de";
const LOCALE_STORAGE_KEY = "buzz.appearance.locale";
const THEME_STORAGE_KEY = "buzz-theme";

test.use({ deviceScaleFactor: 2 });

/**
 * Seeded before the bridge: `AppI18nProvider` reads the preference on mount
 * and the bridge is what triggers mount. Seeding after it activates English
 * first and swaps, which is a different code path from a German start.
 */
async function openInGerman(page: Page, theme = "buzz-dark") {
  await page.addInitScript(
    ({ localeKey, themeKey, theme: value }) => {
      window.localStorage.setItem(localeKey, "de");
      window.localStorage.setItem(themeKey, value);
    },
    { localeKey: LOCALE_STORAGE_KEY, themeKey: THEME_STORAGE_KEY, theme },
  );
  await installMockBridge(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("app-sidebar")).toBeVisible();
}

test("the search palette reads German, unscoped", async ({ page }) => {
  await openInGerman(page);
  await page.getByTestId("open-search").click();

  const dialog = page.getByTestId("search-results");
  await expect(dialog).toBeVisible();

  // The rotating placeholder: prefix plus one of five noun phrases, each
  // carrying its own German article.
  const placeholder = page.getByTestId("search-placeholder");
  await expect(placeholder).toContainText("Suche nach");
  await expect(placeholder).not.toContainText("Search for");

  // The suggestion sections and the current-channel action.
  await expect(dialog.getByText("Letzte Aktivität").first()).toBeVisible();
  await expect(dialog.getByText("Aktionen").first()).toBeVisible();
  await expect(
    dialog.getByText("Kanäle durchsuchen", { exact: true }),
  ).toBeVisible();

  for (const english of [
    "Recent activity",
    "Actions",
    "Browse channels",
    "Create a new channel",
  ]) {
    await expect(dialog.getByText(english, { exact: true })).toHaveCount(0);
  }

  await waitForAnimations(page);
  await dialog.screenshot({ path: `${SHOTS}/palette-unscoped.png` });
});

test("the channel-scoped palette reads German", async ({ page }) => {
  await openInGerman(page);
  await page.getByTestId("channel-general").click();
  await page.getByTestId("open-search").click();

  const dialog = page.getByTestId("search-results");
  await expect(dialog).toBeVisible();

  // "Search in #general" / "Search messages in this channel" — Ian's second
  // and third examples, both on the current-channel row.
  const scopeRow = page.getByTestId("search-current-channel-control");
  await expect(scopeRow).toContainText("In #general suchen");
  await expect(scopeRow).toContainText(
    "Nachrichten in diesem Kanal durchsuchen",
  );
  await expect(scopeRow).not.toContainText("Search in");
  await expect(scopeRow).not.toContainText("Search messages in this channel");

  await scopeRow.click();

  // Scoped: the chip replaces the rotating placeholder with a plain prompt.
  const inputRow = page.getByTestId("search-dialog-input-row");
  await expect(inputRow).toContainText("Nachrichten durchsuchen");
  await expect(inputRow).not.toContainText("Search messages");

  await waitForAnimations(page);
  await dialog.screenshot({ path: `${SHOTS}/palette-scoped.png` });
});

test("an empty search result reads German", async ({ page }) => {
  await openInGerman(page);
  await page.getByTestId("open-search").click();
  await page
    .getByTestId("search-dialog-input")
    .fill("zzzqqqxxx-nichts-gefunden");

  const dialog = page.getByTestId("search-results");
  // One message with the query inside it, not "No" + query + "for".
  await expect(dialog).toContainText("Keine Treffer für");
  await expect(dialog).not.toContainText("No matches for");

  await waitForAnimations(page);
  await dialog.screenshot({ path: `${SHOTS}/palette-no-matches.png` });
});

test("the channel browser reads German", async ({ page }) => {
  await openInGerman(page);
  await page.getByTestId("open-search").click();
  await page.getByText("Kanäle durchsuchen", { exact: true }).click();

  const dialog = page.getByTestId("channel-browser-dialog");
  await expect(dialog).toBeVisible();

  await expect(dialog.getByText("Alle Kanäle", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Beigetreten", { exact: true })).toBeVisible();
  // The sort control is an icon-only button, so its copy is the accessible
  // name rather than visible text.
  await expect(dialog.getByTestId("channel-browser-sort")).toHaveAttribute(
    "aria-label",
    /sortieren: Alphabetisch/,
  );

  for (const english of ["All channels", "Joined"]) {
    await expect(dialog.getByText(english, { exact: true })).toHaveCount(0);
  }

  await dialog.getByTestId("channel-browser-sort").click();
  const sortMenu = page.locator('[role="menu"]:visible').first();
  await expect(sortMenu.getByText("Sortieren nach")).toBeVisible();
  await expect(sortMenu.getByText("Alphabetisch")).toBeVisible();
  await expect(sortMenu.getByText("Meiste Mitglieder")).toBeVisible();
  for (const english of ["Sort by", "Alphabetical", "Most members"]) {
    await expect(sortMenu.getByText(english, { exact: true })).toHaveCount(0);
  }
  await page.keyboard.press("Escape");

  await waitForAnimations(page);
  await dialog.screenshot({ path: `${SHOTS}/channel-browser.png` });
});

test("the keyboard-shortcut help reads German", async ({ page }) => {
  await openInGerman(page);
  await page.getByTestId("open-settings").click();
  await page.getByTestId("profile-popover-settings").click();
  await page.getByTestId("settings-nav-shortcuts").click();

  const card = page.getByTestId("settings-shortcuts");
  await expect(card).toBeVisible({ timeout: 10_000 });

  // Category headings and a label/description pair from the table. All 58 of
  // those strings live in a module-level array that no JSX node mentions,
  // which is why the coverage gate had to learn to read object literals.
  await expect(card.getByText("Navigation", { exact: true })).toBeVisible();
  await expect(card.getByText("Formatierung", { exact: true })).toBeVisible();
  await expect(card.getByText("Schnellsuche", { exact: true })).toBeVisible();
  await expect(
    card.getByText("Den Suchdialog öffnen", { exact: true }),
  ).toBeVisible();

  for (const english of [
    "Quick search",
    "Open the search dialog",
    "Formatting",
  ]) {
    await expect(card.getByText(english, { exact: true })).toHaveCount(0);
  }

  // The keycaps are not translated: ⌘K is what is printed on the keyboard,
  // and the coverage gate exempts `<kbd>` for exactly that reason.
  await expect(card.locator("kbd", { hasText: "⌘K" }).first()).toBeVisible();

  await waitForAnimations(page);
  await card.screenshot({ path: `${SHOTS}/shortcuts.png` });
});
