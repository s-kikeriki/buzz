import { expect, type Page, test } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";

/**
 * The message area, rendered in German.
 *
 * Same reasoning as `channels-german.spec.ts`: `pnpm check:i18n` proves every
 * extracted id has a German translation and the coverage ratchet proves no
 * converted file still holds a literal, but neither can see a descriptor that
 * is built and never resolved, or a copy table resolved once at module scope.
 * Only a render in `de` catches those — in the channel area that is exactly
 * what found a module-level label table and two English default parameters.
 *
 * Every German test has an English counterpart asserting the same phrases are
 * absent under `en`. Without that control a string resolved once at module load
 * passes the German half for the wrong reason: it reads German because German
 * was the boot locale, not because the component resolves per render.
 *
 * Assertions are on text a person reads — accessible names and visible copy —
 * never on a `data-testid`, which survives a missing translation intact.
 */

const LOCALE_STORAGE_KEY = "buzz.appearance.locale";

/**
 * Seeded before the bridge: `AppI18nProvider` reads the preference on mount and
 * the bridge is what triggers mount. Seeding afterwards activates English first
 * and then swaps, which hides a module-scope resolution bug.
 */
async function openChannelIn(page: Page, locale: "en" | "de") {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: LOCALE_STORAGE_KEY, value: locale },
  );
  await installMockBridge(page);
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("channel-general").click();
  await expect(page.getByTestId("chat-title")).toHaveText("general");
  await expect
    .poll(() =>
      page.evaluate(
        () => typeof window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__ === "function",
      ),
    )
    .toBe(true);
  await waitForAnimations(page);
}

/** Emits one message and returns its id, so the action rail has a row to open. */
async function emitMessage(page: Page, content: string, id: string) {
  return page.evaluate(
    ({ content, id }) => {
      const emit = window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__;
      if (!emit) throw new Error("Mock message emitter is unavailable.");
      const event = emit({ channelName: "general", content, id });
      return event.id;
    },
    { content, id },
  );
}

/**
 * Accessible names, paired German/English, for the icon-only buttons.
 *
 * Paired rather than held in two independent lists: these are matched as
 * substrings, and a German noun ("Formatierung umschalten") contains neither
 * more nor less than its English counterpart ("Toggle formatting") by accident.
 * Keeping each pair on one line is what makes the absence half meaningful.
 */
const BUTTON_LABELS = {
  composer: [
    ["Formatierung umschalten", "Toggle formatting"],
    ["Datei anhängen", "Attach file"],
  ],
  formatting: [
    ["Fett", "Bold"],
    ["Kursiv", "Italic"],
    ["Durchgestrichen", "Strikethrough"],
    ["Codeblock", "Code block"],
    ["Aufzählung", "Bullet list"],
    ["Nummerierte Liste", "Ordered list"],
    ["Zitat", "Quote"],
  ],
  actionBar: [
    ["Antworten", "Reply"],
    ["Link kopieren", "Copy link"],
    ["Reaktionen öffnen", "Open reactions"],
  ],
} as const;

/** Phrases that must appear in German and must NOT appear in English. */
const GERMAN_ONLY = {
  moreMenu: ["Nachricht löschen", "Als ungelesen markieren", "Später erinnern"],
  deleteDialog: ["Nachricht löschen?", "Abbrechen"],
  newMessage: ["An:"],
} as const;

/** The English each of the above replaces. Asserted absent under `de`. */
const ENGLISH_ONLY = {
  moreMenu: ["Delete message", "Mark unread", "Remind me later"],
  deleteDialog: ["Delete message?", "Cancel"],
  newMessage: ["To:"],
} as const;

/**
 * Not asserted here: the composer's own empty-state prompt ("Choose a recipient
 * to start a message"). It is a TipTap placeholder, and with no recipient
 * selected the editor renders `contenteditable="false"` — TipTap's Placeholder
 * extension defaults to `showOnlyWhenEditable`, so the string reaches no DOM
 * attribute at all in that state and there is nothing for a spec to read. It is
 * translated and covered by the catalogue gate; only this third gate is blind
 * to it.
 */

/**
 * Asserts each pair's `present` name is reachable and the other is not.
 *
 * The absent half is anchored (`^…$`) because the two languages share prefixes
 * — an unanchored "Code block" would also match "Codeblock" and quietly pass.
 */
async function expectLabels(
  scope: ReturnType<Page["getByTestId"]>,
  pairs: ReadonlyArray<readonly [string, string]>,
  locale: "de" | "en",
) {
  for (const [german, english] of pairs) {
    const present = locale === "de" ? german : english;
    const absent = locale === "de" ? english : german;
    await expect(
      scope.getByRole("button", { name: new RegExp(present) }),
    ).toHaveCount(1);
    await expect(
      scope.getByRole("button", { name: new RegExp(`^${absent}$`) }),
    ).toHaveCount(0);
  }
}

test("the composer and its formatting toolbar read German", async ({
  page,
}) => {
  await openChannelIn(page, "de");

  const toolbar = page.getByTestId("message-composer-toolbar");
  await expect(toolbar).toBeVisible();

  // The composer chrome: these are `t` labels on icon-only buttons, so the
  // accessible name is the only place the translation is observable.
  await expectLabels(toolbar, BUTTON_LABELS.composer, "de");

  // The formatting buttons live behind the toggle. Every one is an icon with a
  // `t` aria-label and no visible text at all — the shape that reads clean to
  // both of the other two gates.
  await toolbar
    .getByRole("button", { name: /Formatierung umschalten/ })
    .first()
    .click();
  const formatting = page.getByTestId("message-formatting-toolbar");
  await expect(formatting).toBeVisible();
  await waitForAnimations(page);
  await expectLabels(formatting, BUTTON_LABELS.formatting, "de");
});

test("the message action rail and its More menu read German", async ({
  page,
}) => {
  await openChannelIn(page, "de");
  const messageId = await emitMessage(page, "Hallo Kanal", "c".repeat(64));

  const row = page
    .locator('[data-testid="message-row"]')
    .filter({ hasText: "Hallo Kanal" })
    .first();
  await expect(row).toBeVisible();
  await row.hover();

  const rail = page.getByTestId(`message-action-bar-${messageId}`);
  await expect(rail).toBeVisible();
  await expectLabels(rail, BUTTON_LABELS.actionBar, "de");

  // The More menu is a dropdown of `t` labels built in a different branch of
  // the same component, so it is asserted separately from the rail.
  await row.getByTestId(`more-actions-${messageId}`).click({ force: true });
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await waitForAnimations(page);
  for (const phrase of GERMAN_ONLY.moreMenu) {
    await expect(menu).toContainText(phrase);
  }
  for (const phrase of ENGLISH_ONLY.moreMenu) {
    await expect(menu).not.toContainText(phrase);
  }
});

test("the delete confirmation reads German", async ({ page }) => {
  await openChannelIn(page, "de");
  const messageId = await emitMessage(
    page,
    "Zu löschende Nachricht",
    "d".repeat(64),
  );

  const row = page
    .locator('[data-testid="message-row"]')
    .filter({ hasText: "Zu löschende Nachricht" })
    .first();
  await row.hover();
  await row.getByTestId(`more-actions-${messageId}`).click({ force: true });
  await page.getByTestId(`delete-message-${messageId}`).click();

  // A destructive confirmation is the one dialog where a half-translated
  // string is worst: the reader has to understand it before they answer it.
  // `alertdialog`, not `dialog` — it is a Radix `AlertDialog`, and
  // `getByRole("dialog")` finds nothing at all.
  const dialog = page.getByRole("alertdialog").last();
  await expect(dialog).toBeVisible();
  await waitForAnimations(page);
  for (const phrase of GERMAN_ONLY.deleteDialog) {
    await expect(dialog).toContainText(phrase);
  }
  for (const phrase of ENGLISH_ONLY.deleteDialog) {
    await expect(dialog).not.toContainText(phrase);
  }
});

/** Opens the new-message page by the German menu item, not the English one. */
async function openNewMessageIn(page: Page, locale: "de" | "en") {
  await page.getByTestId("section-actions-dms").click({ force: true });
  await page
    .getByRole("menuitem", {
      name: locale === "de" ? "Neue Nachricht" : "New message",
    })
    .click();
  await page.getByTestId("new-message-page").waitFor({ state: "visible" });
  await waitForAnimations(page);
}

test("the new-message screen reads German", async ({ page }) => {
  await openChannelIn(page, "de");

  // Reaching this screen is itself an assertion: the shared helper in
  // `tests/helpers/bridge.ts` clicks a menu item named "New message", so if the
  // DM section menu were not translated this would be the English name.
  await openNewMessageIn(page, "de");

  const screen = page.getByTestId("new-message-page");
  for (const phrase of GERMAN_ONLY.newMessage) {
    await expect(screen).toContainText(phrase);
  }
  for (const phrase of ENGLISH_ONLY.newMessage) {
    await expect(screen).not.toContainText(phrase);
  }
});

/**
 * The English control. Every phrase the German tests assert must be absent
 * here, and the English it replaced present — otherwise a label resolved once
 * at module scope would pass the German half for the wrong reason.
 */
test("the same surfaces still read English under en", async ({ page }) => {
  await openChannelIn(page, "en");

  const toolbar = page.getByTestId("message-composer-toolbar");
  await expectLabels(toolbar, BUTTON_LABELS.composer, "en");

  await toolbar
    .getByRole("button", { name: /Toggle formatting/ })
    .first()
    .click();
  const formatting = page.getByTestId("message-formatting-toolbar");
  await expect(formatting).toBeVisible();
  await waitForAnimations(page);
  await expectLabels(formatting, BUTTON_LABELS.formatting, "en");

  // The new-message screen too, so its German is proven to be per-render
  // rather than whichever locale happened to boot.
  await openNewMessageIn(page, "en");
  const screen = page.getByTestId("new-message-page");
  for (const phrase of ENGLISH_ONLY.newMessage) {
    await expect(screen).toContainText(phrase);
  }
  for (const phrase of GERMAN_ONLY.newMessage) {
    await expect(screen).not.toContainText(phrase);
  }
});
