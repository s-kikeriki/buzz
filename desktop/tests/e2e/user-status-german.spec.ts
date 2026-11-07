import { expect, type Page, test } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";

/**
 * The set-status dialog, the name-row indicators and the auxiliary panel's
 * chrome, rendered in German.
 *
 * Three of this tranche's changes cannot be seen by either of the other gates:
 *
 * 1. The expiry options used to *be* their own labels — `DurationLabel` was
 *    `"1 hour" | "8 hours" | …` and the component switched on it. They are
 *    `{id, label}` pairs now. A catalogue gate cannot tell a translated label
 *    from a broken discriminator: with the id still English the menu would
 *    read German, a selection would match no `switch` case and the status
 *    would silently expire at the wrong time.
 * 2. Each quick-status row's `data-testid` was built from its displayed text,
 *    so under German the DOM ids would have changed with the locale. The ids
 *    are fixed slugs now, and the English spec's selectors still bind them —
 *    this spec asserts the same ids resolve while the labels are German.
 * 3. The half-hour menu labelled its 48 entries with a hand-rolled 12-hour
 *    clock, so a German app offered "1:30 PM". They come from the locale's
 *    formatter now, which is 24-hour in German.
 *
 * Every German assertion is paired with a negative on the English it replaced,
 * and the last test re-runs the lot under `en`. Without that control a string
 * resolved once at module load passes the German half for the wrong reason —
 * because German happened to be the boot locale, not because the component
 * resolves per render. Two of the three changes above are module-scope tables,
 * which is exactly the bug that control exists for.
 */

const LOCALE_STORAGE_KEY = "buzz.appearance.locale";

/**
 * Seeded before the bridge: `AppI18nProvider` reads the preference on mount
 * and the bridge is what triggers mount. Seeding afterwards activates English
 * first and then swaps, which hides a module-scope resolution bug.
 */
async function bootIn(page: Page, locale: "en" | "de") {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: LOCALE_STORAGE_KEY, value: locale },
  );
  await installMockBridge(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
}

/** Settings popover → "Set a status", returning the open dialog. */
async function openStatusDialog(page: Page) {
  await page.getByTestId("open-settings").click();
  await expect(page.getByTestId("profile-popover")).toBeVisible();
  await page.getByTestId("profile-popover-set-status").click();
  const dialog = page.getByTestId("set-status-dialog");
  await expect(dialog).toBeVisible();
  await waitForAnimations(page);
  return dialog;
}

/**
 * Publishes a status carrying an emoji and an empty body, then opens a channel
 * so the indicator renders next to the author's name.
 */
async function seedEmojiOnlyStatus(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __BUZZ_E2E_HAS_MOCK_GLOBAL_KIND_SUBSCRIPTION__?: (
                kind: number,
              ) => boolean;
            }
          ).__BUZZ_E2E_HAS_MOCK_GLOBAL_KIND_SUBSCRIPTION__?.(30315) ?? false,
      ),
    )
    .toBe(true);
  await page.evaluate(() => {
    (
      window as Window & {
        __BUZZ_E2E_SET_MOCK_USER_STATUS__?: (input: {
          text: string;
          emoji?: string;
        }) => unknown;
      }
    ).__BUZZ_E2E_SET_MOCK_USER_STATUS__?.({ emoji: "🎯", text: "" });
  });
  await page.getByTestId("channel-general").click();
  await expect(page.getByTestId("chat-title")).toHaveText("general");
}

/** German phrase → the English it replaced. Both halves are asserted. */
const DIALOG_COPY = [
  ["Status festlegen", "Set a status"],
  ["Lass andere wissen, was du gerade machst.", "Let others know what"],
  ["Dauer", "Duration"],
  ["Statusvorschläge", "Quick statuses"],
  ["Status speichern", "Save status"],
] as const;

/** The five quick statuses, as `[testid slug, German, English]`. */
const PRESETS = [
  ["in-a-meeting", "In einem Meeting", "In a meeting"],
  ["commuting", "Auf dem Weg", "Commuting"],
  ["out-sick", "Krank gemeldet", "Out sick"],
  ["vacationing", "Im Urlaub", "Vacationing"],
  ["working-remotely", "Im Homeoffice", "Working remotely"],
] as const;

/** The five expiry options, German and the English each replaced. */
const DURATIONS = [
  ["1 Stunde", "1 hour"],
  ["8 Stunden", "8 hours"],
  ["Heute", "Today"],
  ["Diese Woche", "This week"],
  ["Benutzerdefiniert", "Custom"],
] as const;

test("the set-status dialog reads German", async ({ page }) => {
  await bootIn(page, "de");
  const dialog = await openStatusDialog(page);

  for (const [german, english] of DIALOG_COPY) {
    await expect(dialog).toContainText(german);
    await expect(dialog).not.toContainText(english);
  }

  // Accessible names, which neither other gate can read.
  await expect(dialog.getByTestId("set-status-save")).toHaveAccessibleName(
    "Status speichern",
  );
  await expect(dialog.getByTestId("set-status-input")).toHaveAttribute(
    "placeholder",
    "Was ist dein Status?",
  );
  await expect(
    dialog.getByRole("button", { name: "Status-Emoji auswählen" }),
  ).toHaveCount(1);
  await expect(
    dialog.getByRole("button", { name: "Choose a status emoji" }),
  ).toHaveCount(0);
});

/**
 * The quick statuses: German labels behind the *English-derived* test ids.
 *
 * This is the assertion that fails if the ids go back to being derived from
 * the displayed text — `set-status-preset-in-einem-meeting` would not resolve
 * — and it is also what proves clicking one fills the input with German, since
 * the preset's label is the text the person then publishes.
 */
test("the quick statuses are German behind stable test ids", async ({
  page,
}) => {
  await bootIn(page, "de");
  const dialog = await openStatusDialog(page);

  for (const [slug, german, english] of PRESETS) {
    const row = dialog.getByTestId(`set-status-preset-${slug}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText(german);
    await expect(row).not.toContainText(english);
  }

  await dialog.getByTestId("set-status-preset-working-remotely").click();
  await expect(dialog.getByTestId("set-status-input")).toHaveValue(
    "Im Homeoffice",
  );
  await expect(dialog.getByTestId("set-status-save")).toBeEnabled();
});

/**
 * The expiry menu, and the half-hour clock behind its custom option.
 *
 * Selecting a German option has to still drive the English-keyed `switch`:
 * the trigger reflecting the choice back is what shows the id survived the
 * round trip. A label-only translation would render the menu in German and
 * then fall through every case.
 */
test("the expiry options read German and still select", async ({ page }) => {
  await bootIn(page, "de");
  const dialog = await openStatusDialog(page);

  const trigger = dialog.getByTestId("set-status-duration");
  await expect(trigger).toContainText("Heute");
  await expect(trigger).not.toContainText("Today");

  await trigger.click();
  await waitForAnimations(page);
  for (const [german, english] of DURATIONS) {
    await expect(page.getByRole("menuitem", { name: german })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: english })).toHaveCount(0);
  }

  await page.getByRole("menuitem", { name: "8 Stunden" }).click();
  await expect(trigger).toContainText("8 Stunden");

  // The closing menu animates out, so reopening while it is still mounted
  // leaves two `menuitem` sets in the DOM and the locator binds the dying one
  // — the click then fails with "element was detached from the DOM".
  await expect(page.getByRole("menu")).toHaveCount(0);
  await trigger.click();
  await waitForAnimations(page);
  await page.getByRole("menuitem", { name: "Benutzerdefiniert" }).click();
  await expect(dialog).toContainText("Bis");
  await expect(dialog).not.toContainText("Until");
  await expect(
    dialog.getByRole("button", { name: "Ablaufdatum des Status" }),
  ).toHaveCount(1);

  // The 48 half-hour marks: 24-hour German, and no AM/PM anywhere. The count
  // is asserted too, so a formatter that threw and left an empty menu cannot
  // pass the absence half.
  const timeButton = dialog.getByRole("button", {
    name: "Ablaufzeit des Status",
  });
  await expect(timeButton).toBeVisible();
  await timeButton.click();
  await waitForAnimations(page);
  const timeMenu = page.getByTestId("status-expiration-time-menu");
  await expect(timeMenu.getByRole("menuitem")).toHaveCount(48);
  await expect(
    timeMenu.getByRole("menuitem", { exact: true, name: "13:30" }),
  ).toHaveCount(1);
  await expect(timeMenu).not.toContainText("PM");
  await expect(timeMenu).not.toContainText("AM");
});

/**
 * The name-row indicators.
 *
 * The huddle badge's accessible name is the headphone emoji plus the same
 * sentence as its tooltip, built by interpolation. Asserting the full
 * attribute is what catches the two drifting apart.
 */
test("the name-row status indicators read German", async ({ page }) => {
  await bootIn(page, "de");
  await seedEmojiOnlyStatus(page);

  const indicator = page.getByTestId("user-status-indicator").first();
  await expect(indicator).toBeVisible();

  // A status with an emoji and no text is what exercises the fallback copy:
  // with text, both the tooltip and the accessible name are the person's own
  // words and nothing translated is rendered at all.
  const label = await indicator.getAttribute("aria-label");
  expect(label).toContain("Nutzerstatus");
  expect(label).not.toContain("User status");
});

/**
 * The auxiliary panel chrome, which every panel in the app shares.
 *
 * Its close label was a resolved module constant, so it would have frozen in
 * the boot locale. The shell's own resize handle is suppressed wherever
 * `RightAuxiliaryPane` renders one instead, which is every surface this mock
 * harness can reach — `auxiliaryPanelContext.test.mjs` covers that label.
 */
test("the auxiliary panel's close action reads German", async ({ page }) => {
  await bootIn(page, "de");

  await page.getByTestId("channel-general").click();
  await expect(page.getByTestId("chat-title")).toHaveText("general");
  await page.evaluate((bobPubkey) => {
    const emit = (
      window as Window & {
        __BUZZ_E2E_EMIT_MOCK_MESSAGE__?: (input: {
          channelName: string;
          content: string;
          pubkey: string;
        }) => unknown;
      }
    ).__BUZZ_E2E_EMIT_MOCK_MESSAGE__;
    if (!emit) {
      throw new Error("Mock message emitter is unavailable.");
    }
    emit({
      channelName: "general",
      content: "Seitenbereich auf Deutsch",
      pubkey: bobPubkey,
    });
  }, TEST_IDENTITIES.bob.pubkey);

  const messageRow = page
    .getByTestId("message-row")
    .filter({ hasText: "Seitenbereich auf Deutsch" });
  await expect(messageRow).toBeVisible();
  await messageRow.locator("button").first().click();

  const panel = page.getByTestId("user-profile-panel");
  await expect(panel).toBeVisible();
  await waitForAnimations(page);

  const close = page.getByTestId("auxiliary-panel-close");
  await expect(close).toHaveAccessibleName("Bereich schließen");
  await expect(page.getByRole("button", { name: "Close panel" })).toHaveCount(
    0,
  );
});

/**
 * The English control.
 *
 * Without it the German tests above pass whenever German is the boot locale,
 * whether or not anything resolves per render — and two of the three tables
 * this tranche changed live at module scope, which is precisely the bug that
 * passes a German-only suite.
 */
test("the same surfaces still read English under en", async ({ page }) => {
  await bootIn(page, "en");
  const dialog = await openStatusDialog(page);

  for (const [german, english] of DIALOG_COPY) {
    await expect(dialog).toContainText(english);
    await expect(dialog).not.toContainText(german);
  }
  for (const [slug, german, english] of PRESETS) {
    const row = dialog.getByTestId(`set-status-preset-${slug}`);
    await expect(row).toContainText(english);
    await expect(row).not.toContainText(german);
  }

  const trigger = dialog.getByTestId("set-status-duration");
  await expect(trigger).toContainText("Today");
  await trigger.click();
  await waitForAnimations(page);
  for (const [german, english] of DURATIONS) {
    await expect(page.getByRole("menuitem", { name: english })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: german })).toHaveCount(0);
  }

  // The half-hour labels come from the locale's formatter for English too, so
  // this is also the assertion that the en output did not move to 24-hour.
  await page.getByRole("menuitem", { name: "Custom" }).click();
  await dialog.getByRole("button", { name: "Status expiration time" }).click();
  await waitForAnimations(page);
  const timeMenu = page.getByTestId("status-expiration-time-menu");
  await expect(timeMenu.getByRole("menuitem")).toHaveCount(48);
  // `name` matches a substring, so an inexact "1:30 PM" also resolves
  // "11:30 PM" and the count assertion reads 2.
  await expect(
    timeMenu.getByRole("menuitem", { exact: true, name: "1:30 PM" }),
  ).toHaveCount(1);
  await expect(
    timeMenu.getByRole("menuitem", { exact: true, name: "12:00 AM" }),
  ).toHaveCount(1);
});
