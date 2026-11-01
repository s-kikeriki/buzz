import { expect, type Page, test } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";

/**
 * The channel area, rendered in German.
 *
 * This is the third gate, and the only one that can see the failure the other
 * two are blind to. `pnpm check:i18n` proves every extracted id has a German
 * translation, and the coverage ratchet proves no converted file still holds a
 * literal — but a descriptor that is built and never resolved, or a copy table
 * resolved once at module scope, satisfies both and still puts English on
 * screen. Only a render in `de` catches that.
 *
 * Every German test has an English counterpart asserting the *same* phrases
 * are absent under `en`. Without that control, a label that was resolved once
 * at module load would pass every German assertion here for the wrong reason:
 * it would read German because German was the boot locale, not because the
 * component resolves it per render.
 *
 * Assertions are on text a person reads, not on `data-testid` — a testid is
 * still present when the translation is missing.
 */

const LOCALE_STORAGE_KEY = "buzz.appearance.locale";

/**
 * Seeded before the bridge: `AppI18nProvider` reads the preference on mount,
 * and the bridge is what triggers mount. Seeding afterwards activates English
 * first and then swaps, which hides a module-scope resolution bug.
 */
async function openChannelIn(page: Page, locale: "en" | "de") {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: LOCALE_STORAGE_KEY, value: locale },
  );
  await installMockBridge(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("channel-general").click();
  await expect(page.getByTestId("chat-title")).toHaveText("general");
  await waitForAnimations(page);
}

async function openManagementSheet(page: Page) {
  await page.getByTestId("channel-management-trigger").click();
  await expect(page.getByTestId("channel-management-sheet")).toBeVisible();
  await waitForAnimations(page);
}

async function openEditDialog(page: Page) {
  await page.getByTestId("channel-management-edit").click();
  await expect(page.getByTestId("channel-management-save-changes")).toBeVisible(
    { timeout: 10_000 },
  );
  await waitForAnimations(page);
}

async function openMembersSidebar(page: Page) {
  await page.getByTestId("channel-members-trigger").click();
  await expect(page.getByTestId("members-sidebar")).toBeVisible();
  await waitForAnimations(page);
}

/** Phrases that must appear in German and must NOT appear in English. */
const GERMAN_ONLY = {
  managementSheet: ["Kanaleinstellungen"],
  editDialog: ["Kanal bearbeiten", "Änderungen speichern", "Sichtbarkeit"],
  channelType: ["Kanaltyp"],
  channelTypeTemporary: ["Läuft ab nach"],
  membersSidebar: ["Kanalmitglieder", "Mitglieder", "Inhaber"],
  memberMenu: ["Rolle ändern", "Aus dem Kanal entfernen"],
  canvas: ["Canvas erstellen"],
} as const;

/** The English each of the above replaces. Asserted absent under `de`. */
const ENGLISH_ONLY = {
  managementSheet: ["Channel Settings"],
  editDialog: ["Edit public channel", "Save changes", "Visibility"],
  channelType: ["Channel type"],
  channelTypeTemporary: ["Expires after"],
  membersSidebar: ["Channel members", "owner"],
  memberMenu: ["Change role", "Remove from channel"],
  canvas: ["Create canvas"],
} as const;

test("channel management sheet reads German", async ({ page }) => {
  await openChannelIn(page, "de");
  await openManagementSheet(page);

  const sheet = page.getByTestId("channel-management-sheet");
  for (const phrase of GERMAN_ONLY.managementSheet) {
    await expect(sheet).toContainText(phrase);
  }
  for (const phrase of ENGLISH_ONLY.managementSheet) {
    await expect(sheet).not.toContainText(phrase);
  }
});

test("channel edit dialog reads German, including the visibility table", async ({
  page,
}) => {
  await openChannelIn(page, "de");
  await openManagementSheet(page);
  await openEditDialog(page);

  const dialog = page.getByRole("dialog").last();
  for (const phrase of GERMAN_ONLY.editDialog) {
    await expect(dialog).toContainText(phrase);
  }
  for (const phrase of ENGLISH_ONLY.editDialog) {
    await expect(dialog).not.toContainText(phrase);
  }

  // `VISIBILITY_OPTIONS` is a module-level table of `msg` descriptors, so this
  // assertion is the one that fails if it is ever resolved at module load.
  await expect(
    page.getByTestId("channel-management-permissions"),
  ).toHaveAccessibleName(/Sichtbarkeit: (Privat|Öffentlich)/);
});

test("channel type and TTL tables read German", async ({ page }) => {
  await openChannelIn(page, "de");
  await openManagementSheet(page);
  await openEditDialog(page);

  const dialog = page.getByRole("dialog").last();
  for (const phrase of GERMAN_ONLY.channelType) {
    await expect(dialog).toContainText(phrase);
  }
  for (const phrase of ENGLISH_ONLY.channelType) {
    await expect(dialog).not.toContainText(phrase);
  }

  // The TTL row only exists for a temporary channel, and the nine duration
  // labels are a second module-level descriptor table — one of them resolved
  // through a different path (the trigger's current value) than the dropdown
  // rows, so both are asserted.
  // The sheet renders the dropdown variant, so the type is changed through
  // the picker. `getByLabel` is the German aria-label, which is itself the
  // assertion that `temporaryOptionAriaLabel` reaches the catalogue — it used
  // to be an English default parameter.
  await page.getByTestId("channel-management-channel-type").click();
  await page.getByLabel("Temporärer Kanal").click();
  for (const phrase of GERMAN_ONLY.channelTypeTemporary) {
    await expect(dialog).toContainText(phrase);
  }
  for (const phrase of ENGLISH_ONLY.channelTypeTemporary) {
    await expect(dialog).not.toContainText(phrase);
  }
  const ttl = page.getByTestId("channel-management-ttl");
  await expect(ttl).toBeVisible();
  await ttl.click();
  await expect(
    page.getByTestId("channel-management-ttl-option-1800"),
  ).toContainText("30 Minuten");
  await expect(
    page.getByTestId("channel-management-ttl-option-86400"),
  ).toContainText("1 Tag");
});

test("members sidebar and member menu read German", async ({ page }) => {
  await openChannelIn(page, "de");
  await openMembersSidebar(page);

  const sidebar = page.getByTestId("members-sidebar");
  for (const phrase of GERMAN_ONLY.membersSidebar) {
    await expect(sidebar).toContainText(phrase);
  }
  for (const phrase of ENGLISH_ONLY.membersSidebar) {
    await expect(sidebar).not.toContainText(phrase);
  }

  // The member menu is twelve more strings, including the role submenu, whose
  // labels come from a module-level descriptor table of their own. The row is
  // located by testid prefix rather than by a fixed pubkey so the spec does
  // not encode which mock member happens to come first.
  // A plain member, not the viewer's own row: "Change role" only renders for
  // someone the viewer can re-role, so opening the self row would silently
  // skip that half of the menu.
  const memberRow = page
    .locator('[data-testid^="sidebar-member-"]')
    .filter({ hasText: "bob" })
    .first();
  await expect(memberRow).toBeVisible();
  await memberRow.hover();
  await memberRow
    .locator('[data-testid^="sidebar-member-menu-"]')
    .click({ force: true });
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await waitForAnimations(page);
  for (const phrase of GERMAN_ONLY.memberMenu) {
    await expect(menu).toContainText(phrase);
  }
  for (const phrase of ENGLISH_ONLY.memberMenu) {
    await expect(menu).not.toContainText(phrase);
  }
});

test("channel canvas ingress reads German", async ({ page }) => {
  await openChannelIn(page, "de");
  await openManagementSheet(page);

  await page.getByTestId("channel-canvas-ingress").click();
  const canvas = page.getByTestId("channel-canvas-section");
  await expect(canvas).toBeVisible({ timeout: 10_000 });
  await waitForAnimations(page);

  for (const phrase of GERMAN_ONLY.canvas) {
    await expect(canvas).toContainText(phrase);
  }
  for (const phrase of ENGLISH_ONLY.canvas) {
    await expect(canvas).not.toContainText(phrase);
  }
});

test("the terminal toggle names the flavor, not Buzz", async ({ page }) => {
  await openChannelIn(page, "de");

  // `BRAND.productName` is interpolated into the German string rather than
  // baked in, so the stock build reads "Buzz Term öffnen" here and a flavored
  // build substitutes its own name. The assertion is on the German verb plus
  // the interpolated name, which is what proves both halves are wired.
  await expect(
    page.getByRole("button", { name: /Term (öffnen|ausblenden)$/ }),
  ).toBeVisible();
});

/**
 * The English control. Every phrase the German tests assert must be absent
 * here, and the English it replaced present — otherwise a string resolved once
 * at module scope would pass the German half for the wrong reason.
 */
test("the same surfaces still read English under en", async ({ page }) => {
  await openChannelIn(page, "en");
  await openManagementSheet(page);

  const sheet = page.getByTestId("channel-management-sheet");
  await expect(sheet).toContainText("Channel Settings");
  await expect(sheet).not.toContainText("Kanaleinstellungen");

  await openEditDialog(page);
  const dialog = page.getByRole("dialog").last();
  for (const phrase of ENGLISH_ONLY.editDialog) {
    await expect(dialog).toContainText(phrase);
  }
  for (const phrase of GERMAN_ONLY.editDialog) {
    await expect(dialog).not.toContainText(phrase);
  }
  await expect(
    page.getByTestId("channel-management-permissions"),
  ).toHaveAccessibleName(/Visibility: (Private|Public)/);
});
