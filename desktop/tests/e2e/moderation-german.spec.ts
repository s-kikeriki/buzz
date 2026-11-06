import { expect, type Page, test } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";

/**
 * The moderation surfaces a person reaches from a message, rendered in German.
 *
 * Three gates already pass on this code and none of them can see what this
 * one does: `check:i18n` proves every extracted id has a German translation,
 * the coverage ratchet proves no listed file holds a literal, and the unit
 * suite asserts English because the test loader activates `en`. A descriptor
 * that is built and never resolved — the shape this tranche found three copies
 * of — reads clean to all three.
 *
 * Both menus here are the reason this spec exists. The timeout durations used
 * to live in three places: `lib/timeout.ts`, the member sidebar card and the
 * per-message author menu. Only the sidebar's copy had been translated, so the
 * same submenu read German in the sidebar and English here.
 *
 * Every German assertion is paired with a negative on the English source. A
 * module-scope resolution passes the German half for the wrong reason — it
 * reads German because German booted, not because the component resolves per
 * render — and only the English control separates those two.
 */

const LOCALE_STORAGE_KEY = "buzz.appearance.locale";

/** Alice is an `admin` in the mock relay; the active identity is the `owner`. */
const ALICE_PUBKEY =
  "953d3363262e86b770419834c53d2446409db6d918a57f8f339d495d54ab001f";

/**
 * Seeded before the bridge: `AppI18nProvider` reads the preference on mount
 * and the bridge is what triggers mount. Seeding afterwards activates English
 * first and then swaps, which is exactly what hides a module-scope resolution.
 */
async function openChannelIn(page: Page, locale: "en" | "de") {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: LOCALE_STORAGE_KEY, value: locale },
  );
  // `relayRequiresMembership` defaults to false in mock mode, and with it off
  // the membership lookup returns null — so the viewer has no role and the
  // author cluster renders nothing at all. Without these two the spec passes
  // by asserting an absence of English in a menu that never had the items.
  await installMockBridge(page, {
    relayRequiresMembership: true,
    relayRole: "owner",
  });
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

/**
 * Emits one message signed by someone other than the viewer.
 *
 * The author cluster renders only when the signer is not the active identity,
 * so a message emitted with the default pubkey would hide every item this
 * spec is about and the test would pass by rendering nothing.
 */
async function emitMessageFromAlice(page: Page, content: string, id: string) {
  return page.evaluate(
    ({ content, id, pubkey }) => {
      const emit = window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__;
      if (!emit) throw new Error("Mock message emitter is unavailable.");
      return emit({ channelName: "general", content, id, pubkey }).id;
    },
    { content, id, pubkey: ALICE_PUBKEY },
  );
}

/** Opens the More menu on a message row and returns the menu locator. */
async function openMoreMenu(page: Page, content: string, messageId: string) {
  const row = page
    .locator('[data-testid="message-row"]')
    .filter({ hasText: content })
    .first();
  await expect(row).toBeVisible();
  await row.hover();
  await row.getByTestId(`more-actions-${messageId}`).click({ force: true });
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await waitForAnimations(page);
  return menu;
}

/** German phrase → the English source it replaces, one pair per line. */
const AUTHOR_MENU = [
  ["Autor eine Auszeit geben", "Time out author"],
  ["Aus dem Kanal entfernen", "Kick from channel"],
  ["Autor aus der Community sperren", "Ban author from community"],
] as const;

const TIMEOUT_DURATIONS = [
  ["1 Stunde", "1 hour"],
  ["24 Stunden", "24 hours"],
  ["7 Tage", "7 days"],
] as const;

const REPORT_DIALOG = [
  ["Nachricht melden", "Report message"],
  ["Spam", null],
  ["Beleidigungen oder Hassrede", "Profanity or hate speech"],
  ["Nacktheit oder sexuelle Inhalte", "Nudity or sexual content"],
  ["Identitätsmissbrauch", "Impersonation"],
  ["Schadsoftware oder Betrug", "Malware or scam"],
  ["Illegale Inhalte", "Illegal content"],
  ["Sonstiges", "Other"],
  ["Zusätzlicher Kontext (optional)", "Additional context (optional)"],
  ["Meldung senden", "Submit report"],
  ["Abbrechen", "Cancel"],
] as const;

test("the per-message author menu reads German", async ({ page }) => {
  await openChannelIn(page, "de");
  const id = await emitMessageFromAlice(page, "Von Alice", "a".repeat(64));
  const menu = await openMoreMenu(page, "Von Alice", id);

  for (const [german, english] of AUTHOR_MENU) {
    await expect(menu).toContainText(german);
    await expect(menu).not.toContainText(english);
  }

  // The durations are the three that used to be a private English copy in
  // this component. They live behind the submenu trigger, so opening it is
  // what proves the shared descriptor table is resolved here too.
  await menu.getByText("Autor eine Auszeit geben").hover();
  // `.last()`, not a text filter: the parent menu contains the submenu, so
  // filtering either menu by a duration matches both and trips strict mode.
  const submenu = page.getByRole("menu").last();
  await expect(submenu).toBeVisible();
  await waitForAnimations(page);
  for (const [german, english] of TIMEOUT_DURATIONS) {
    await expect(submenu).toContainText(german);
    await expect(submenu).not.toContainText(english);
  }
});

test("the report dialog reads German", async ({ page }) => {
  await openChannelIn(page, "de");
  const id = await emitMessageFromAlice(page, "Zu melden", "b".repeat(64));
  const menu = await openMoreMenu(page, "Zu melden", id);

  await menu.getByText("Nachricht melden").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await waitForAnimations(page);

  for (const [german, english] of REPORT_DIALOG) {
    await expect(dialog).toContainText(german);
    // "Spam" is the same word in both languages — it has no English
    // counterpart to assert absent, and pretending otherwise would make this
    // loop look stricter than it is.
    if (english) await expect(dialog).not.toContainText(english);
  }

  // The note field's placeholder is an attribute, so it reaches no text node.
  // Located through its label rather than a testid — the label is itself one
  // of the strings under test, so this binds two translations at once.
  await expect(
    dialog.getByLabel("Zusätzlicher Kontext (optional)"),
  ).toHaveAttribute(
    "placeholder",
    "Ergänze alles, was den Moderatoren hilft ...",
  );
});

test("the same surfaces still read English under en", async ({ page }) => {
  await openChannelIn(page, "en");
  const id = await emitMessageFromAlice(page, "From Alice", "c".repeat(64));
  const menu = await openMoreMenu(page, "From Alice", id);

  for (const [german, english] of AUTHOR_MENU) {
    await expect(menu).toContainText(english);
    await expect(menu).not.toContainText(german);
  }

  await menu.getByText("Time out author").hover();
  const submenu = page.getByRole("menu").last();
  await expect(submenu).toBeVisible();
  for (const [german, english] of TIMEOUT_DURATIONS) {
    await expect(submenu).toContainText(english);
    await expect(submenu).not.toContainText(german);
  }
});
