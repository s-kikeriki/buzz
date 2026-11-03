import { expect, type Page, test } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";
import { openSettings } from "../helpers/settings";

/**
 * The profile panel and the avatar editor, rendered in German.
 *
 * `pnpm check:i18n` proves every extracted id has a German translation and the
 * coverage ratchet proves no converted file still holds a literal — but a
 * descriptor that is built and never resolved, or a copy table resolved once at
 * module scope, satisfies both gates and still puts English on screen. Only a
 * render in `de` catches that, and this area is almost entirely descriptor
 * tables: the field rows, the panel titles and the avatar mode tabs are all
 * built at module import.
 *
 * Every German assertion has an English counterpart asserting the same phrases
 * are absent under `en`. Without that control a label resolved once at module
 * load would pass here for the wrong reason — it would read German because
 * German was the boot locale, not because the component resolves per render.
 *
 * Assertions are on text a person reads, not on `data-testid`: a testid is
 * still there when the translation is not.
 */

const LOCALE_STORAGE_KEY = "buzz.appearance.locale";

/**
 * Seeded before the bridge: `AppI18nProvider` reads the preference on mount and
 * the bridge is what triggers mount. Seeding afterwards activates English first
 * and then swaps, which is exactly the sequence that hides a module-scope
 * resolution bug.
 */
async function bootIn(page: Page, locale: "en" | "de") {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: LOCALE_STORAGE_KEY, value: locale },
  );
  await installMockBridge(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
}

async function waitForMockLiveSubscription(page: Page, channelName: string) {
  await expect
    .poll(async () =>
      page.evaluate(
        ({ ch }) =>
          (
            window as Window & {
              __BUZZ_E2E_HAS_MOCK_LIVE_SUBSCRIPTION__?: (input: {
                channelName: string;
              }) => boolean;
            }
          ).__BUZZ_E2E_HAS_MOCK_LIVE_SUBSCRIPTION__?.({ channelName: ch }) ??
          false,
        { ch: channelName },
      ),
    )
    .toBe(true);
}

/** Open another person's profile panel by clicking their name on a message. */
async function openPersonProfile(page: Page) {
  await page.getByTestId("channel-general").click();
  await expect(page.getByTestId("chat-title")).toHaveText("general");
  await waitForMockLiveSubscription(page, "general");

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
      content: "Profil auf Deutsch",
      pubkey: bobPubkey,
    });
  }, TEST_IDENTITIES.bob.pubkey);

  const messageRow = page
    .getByTestId("message-row")
    .filter({ hasText: "Profil auf Deutsch" });
  await expect(messageRow).toBeVisible();
  await messageRow.locator("button").first().click();

  const panel = page.getByTestId("user-profile-panel");
  await expect(panel).toBeVisible();
  await waitForAnimations(page);
  return panel;
}

/**
 * Open the own-profile avatar editor from Settings → Profile.
 *
 * Returns both halves on purpose: the mode tabs render into a portal slot
 * *outside* the editor shell, so asserting on the shell alone silently misses
 * them — which is how the first version of this spec passed for three of the
 * four tabs' worth of copy and nothing for the tabs themselves.
 */
async function openAvatarEditor(page: Page) {
  await openSettings(page, "profile");
  await page.getByTestId("profile-avatar-edit").click();
  const shell = page.getByTestId("profile-avatar-editor-shell");
  await expect(shell).toBeVisible();
  const modeTabs = page.getByTestId("profile-avatar-mode-tabs-slot");
  await expect(modeTabs).toBeVisible();
  await waitForAnimations(page);
  return { modeTabs, shell };
}

/** Phrases that must appear in German and must NOT appear in English. */
const GERMAN_ONLY = {
  actionTiles: ["Nachricht", "Winken"],
  avatarModeTabs: ["Bild", "Animiert"],
} as const;

/** The English each of the above replaces. Asserted absent under `de`. */
const ENGLISH_ONLY = {
  actionTiles: ["Message", "Wave"],
  avatarModeTabs: ["Image", "Animated"],
} as const;

test("profile action tiles read German", async ({ page }) => {
  await bootIn(page, "de");
  const panel = await openPersonProfile(page);

  const actionGroup = panel.getByTestId("user-profile-primary-actions");
  await expect(actionGroup).toBeVisible();
  for (const phrase of GERMAN_ONLY.actionTiles) {
    await expect(actionGroup).toContainText(phrase);
  }
  for (const phrase of ENGLISH_ONLY.actionTiles) {
    await expect(actionGroup).not.toContainText(phrase);
  }

  // The tile's accessible name comes from `label` on a separate prop path to
  // the visible span, so a half-converted tile passes the text assertion.
  await expect(panel.getByTestId("user-profile-wave")).toHaveAccessibleName(
    "Winken",
  );
});

test("the profile field rows read German", async ({ page }) => {
  await bootIn(page, "de");
  const panel = await openPersonProfile(page);

  // "Öffentlicher Schlüssel" is a `msg` descriptor in the module-level field
  // builder, resolved through `i18n._(field.label)` per render. This is the
  // assertion that fails if that table is ever resolved at module load.
  await expect(panel.getByTestId("user-profile-public-key")).toBeVisible();
  await expect(panel).toContainText("Öffentlicher Schlüssel");
  await expect(panel).not.toContainText("Public key");

  // The copy affordance builds its own label around the same descriptor, so a
  // field whose label resolved but whose wrapper did not still fails here.
  await expect(
    panel.getByRole("button", { name: "Öffentlicher Schlüssel kopieren" }),
  ).toBeVisible();
});

test("the avatar editor and its mode tabs read German", async ({ page }) => {
  await bootIn(page, "de");
  const { modeTabs, shell } = await openAvatarEditor(page);

  // `MODE_TAB_LABELS` is keyed by mode rather than living in a `label:` field,
  // which is why the coverage detector never saw it. It still renders.
  for (const phrase of GERMAN_ONLY.avatarModeTabs) {
    await expect(modeTabs).toContainText(phrase);
  }
  for (const phrase of ENGLISH_ONLY.avatarModeTabs) {
    await expect(modeTabs).not.toContainText(phrase);
  }

  // The editor's own copy, including the Done button — a literal inside a JSX
  // ternary, which the coverage detector does not see and this spec found.
  await expect(shell).toContainText("Avatar-Bildauswahl");
  await expect(shell).toContainText("Fertig");
  await expect(shell).not.toContainText("Done");
});

test("the same surfaces still read English under en", async ({ page }) => {
  await bootIn(page, "en");
  const panel = await openPersonProfile(page);

  const actionGroup = panel.getByTestId("user-profile-primary-actions");
  for (const phrase of ENGLISH_ONLY.actionTiles) {
    await expect(actionGroup).toContainText(phrase);
  }
  for (const phrase of GERMAN_ONLY.actionTiles) {
    await expect(actionGroup).not.toContainText(phrase);
  }
  await expect(panel).toContainText("Public key");
  await expect(panel).not.toContainText("Öffentlicher Schlüssel");
});
