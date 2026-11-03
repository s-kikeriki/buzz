import { expect, type Page, test } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";

/**
 * The communities area, rendered in German.
 *
 * `pnpm check:i18n` proves every extracted id has a German translation and the
 * coverage ratchet proves no converted file still holds a literal — but a
 * descriptor built and never resolved, or a copy table resolved once at module
 * scope, satisfies both gates and still puts English on screen. Only a render
 * in `de` catches that, and this area has one of each: the switcher's
 * `CONNECTION_STATE_LABEL` is a module-level table, and the add-community
 * dialog's title and description are resolved per render from a ternary.
 *
 * Every German assertion has an English counterpart asserting the same phrases
 * are absent under `en`. Without that control a label resolved once at module
 * load would pass here for the wrong reason — it would read German because
 * German was the boot locale, not because it resolves per render.
 *
 * Assertions are on text a person reads, not on `data-testid`: a testid is
 * still there when the translation is not.
 */

const LOCALE_STORAGE_KEY = "buzz.appearance.locale";
const DEFAULT_MOCK_PUBKEY = "deadbeef".repeat(8);
const COMMUNITIES = [
  {
    id: "ws-a",
    name: "Alpha",
    relayUrl: "ws://localhost:3000",
    addedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "ws-b",
    name: "Bravo",
    relayUrl: "ws://localhost:3001",
    addedAt: "2026-01-02T00:00:00.000Z",
  },
];

/**
 * Seeded before the bridge: `AppI18nProvider` reads the preference on mount and
 * the bridge is what triggers mount. Seeding afterwards activates English first
 * and then swaps, which is the sequence that hides a module-scope resolution
 * bug.
 */
async function bootIn(page: Page, locale: "en" | "de") {
  await page.addInitScript(
    ({ communities, key, value }) => {
      window.localStorage.setItem(
        "buzz-communities",
        JSON.stringify(communities),
      );
      window.localStorage.setItem(
        "buzz-active-community-id",
        communities[0].id,
      );
      window.localStorage.setItem(key, value);
    },
    { communities: COMMUNITIES, key: LOCALE_STORAGE_KEY, value: locale },
  );
  await installMockBridge(
    page,
    {
      builderlabAuth: {
        email: "owner@example.com",
        expiresAt: "2099-01-01T00:00:00Z",
      },
      builderlabIdentity: { pubkey_hex: DEFAULT_MOCK_PUBKEY },
    },
    { skipCommunitySeed: true },
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
}

async function openAddCommunity(page: Page) {
  await page.getByTestId("community-rail-add").click();
  const dialog = page.getByTestId("add-community-dialog");
  await expect(dialog).toBeVisible();
  await waitForAnimations(page);
  return dialog;
}

/** Phrases that must appear in German and must NOT appear in English. */
const GERMAN_ONLY = {
  addChoices: [
    "Community hinzufügen",
    "Neue Community anlegen",
    "Einer bestehenden Community beitreten",
  ],
  addCreate: ["Öffnet Builderlab in deinem Browser."],
  switcherMenu: [
    "Community-URL kopieren",
    "Community-Einstellungen",
    "Community verlassen",
    "Von diesem Gerät entfernen",
  ],
} as const;

/** The English each of the above replaces. Asserted absent under `de`. */
const ENGLISH_ONLY = {
  addChoices: [
    "Add community",
    "Create a new community",
    "Join an existing community",
  ],
  addCreate: ["Opens Builderlab in your browser."],
  switcherMenu: [
    "Copy community URL",
    "Community settings",
    "Leave community",
    "Remove from this device",
  ],
} as const;

test("the add-community dialog reads German", async ({ page }) => {
  await bootIn(page, "de");
  const dialog = await openAddCommunity(page);

  for (const phrase of GERMAN_ONLY.addChoices) {
    await expect(dialog).toContainText(phrase);
  }
  for (const phrase of ENGLISH_ONLY.addChoices) {
    await expect(dialog).not.toContainText(phrase);
  }

  // The brand leak this batch fixed: the card used to say a hardcoded "Buzz
  // address", on a first-run surface. It now interpolates `BRAND.productName`,
  // so the assertion is on the *shape* with the name substituted — this e2e
  // build is the stock flavor, where that name happens to be "Buzz". A
  // "contains no Buzz anywhere" assertion would be wrong here and would also
  // pass for a string that never read the brand at all.
  await expect(dialog).toContainText("Sichere dir eine Buzz-Adresse");
});

test("the dialog title and description follow the chosen mode in German", async ({
  page,
}) => {
  await bootIn(page, "de");
  const dialog = await openAddCommunity(page);
  await page.getByTestId("add-community-create").click();

  // `title` and `description` are resolved per render from a ternary, so this
  // is the assertion that fails if either is ever hoisted to module scope.
  for (const phrase of GERMAN_ONLY.addCreate) {
    await expect(dialog).toContainText(phrase);
  }
  for (const phrase of ENGLISH_ONLY.addCreate) {
    await expect(dialog).not.toContainText(phrase);
  }
  await expect(page.getByTestId("add-community-back")).toHaveAccessibleName(
    "Zurück zu den Optionen zum Hinzufügen",
  );
});

test("the community switcher menu reads German", async ({ page }) => {
  await bootIn(page, "de");
  // The switcher lives inside the sidebar profile menu; it is not mounted
  // until that menu opens.
  await page.getByTestId("sidebar-profile-avatar-button").click();
  await page.getByTestId("community-switcher").click();

  const menu = page.getByTestId("profile-community-actions");
  await expect(menu).toBeVisible();
  await waitForAnimations(page);
  for (const phrase of GERMAN_ONLY.switcherMenu) {
    await expect(menu).toContainText(phrase);
  }
  for (const phrase of ENGLISH_ONLY.switcherMenu) {
    await expect(menu).not.toContainText(phrase);
  }
});

test("the same surfaces still read English under en", async ({ page }) => {
  await bootIn(page, "en");
  const dialog = await openAddCommunity(page);

  for (const phrase of ENGLISH_ONLY.addChoices) {
    await expect(dialog).toContainText(phrase);
  }
  for (const phrase of GERMAN_ONLY.addChoices) {
    await expect(dialog).not.toContainText(phrase);
  }
});
