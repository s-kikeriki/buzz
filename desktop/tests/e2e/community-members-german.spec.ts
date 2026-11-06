import { expect, test, type Page } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";
import { openSettings } from "../helpers/settings";

const LOCALE_STORAGE_KEY = "buzz.appearance.locale";
const INVITE_URL = "https://alpha.example.com/invite/members-german";
const DIRECT_ADD_HEX =
  "ea9b4d7a7a78a3e3729e5568b14d764d4962be0e1f20f749bcf8d9dbbf9a9328";
const DIRECT_ADD_NPUB =
  "npub1a2d567n60z37xu57245tzntkf4yk90swrus0wjdulrvah0u6jv5qusyp60";

/**
 * Proves the Invites settings panel and the community invite dialog render
 * German.
 *
 * The coverage gate guarantees these files hold no hardcoded copy and the
 * catalogue gate guarantees every extracted string has a German translation.
 * Neither can tell you the strings reach the screen. Both option tables here
 * (invite expiry, maximum uses) and both role names are built at *module
 * import*, so a descriptor that is never resolved — or one resolved once at
 * module scope — passes both gates and still shows English.
 *
 * The asserted phrases exist only in the German catalogue, so an untranslated
 * screen fails rather than matching by accident, and the `en` control at the
 * bottom is what makes them falsifiable.
 */
async function openInvitesIn(page: Page, locale: "de" | "en") {
  // Must run before installMockBridge: React reads the preference on mount
  // and the bridge is what triggers that mount.
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: LOCALE_STORAGE_KEY, value: locale },
  );
  await installMockBridge(page, {
    relayRequiresMembership: true,
    relayRole: "owner",
  });
  await page.route("**/api/invites", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        code: "members-german",
        expires_at: Math.floor(Date.now() / 1000) + 3 * 86_400,
        url: INVITE_URL,
      },
      status: 200,
    });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await openSettings(page, "community-members");
  await expect(
    page.getByTestId("settings-panel-community-members"),
  ).toBeVisible({ timeout: 10_000 });
  await waitForAnimations(page);
}

/** Phrases that must be on screen in German, per surface. */
const PANEL_GERMAN = [
  "Verwalte Mitglieder und den Zugang zur Community.",
  "Zur Community einladen",
];

const DIALOG_GERMAN = [
  "Füg jemanden direkt hinzu oder teil einen Link zum Beitreten.",
  "Oder kopier einen Link",
];

test("the Invites panel and member roster read German", async ({ page }) => {
  await openInvitesIn(page, "de");

  await expect(
    page.getByTestId("settings-nav-community-members"),
  ).toContainText("Einladungen");

  const panel = page.getByTestId("settings-panel-community-members");
  for (const phrase of PANEL_GERMAN) {
    await expect(
      panel.getByText(phrase, { exact: false }).first(),
    ).toBeVisible();
  }
  await expect(page.getByTestId("community-members-search")).toHaveAttribute(
    "placeholder",
    "Mitglieder suchen",
  );
  // `Added {addedAt}` is assembled around a formatted date, so only the
  // sentence fragment is asserted — the date itself is the locale formatter's
  // job and is covered by the intl-locale gate.
  await expect(
    panel.getByText("Hinzugefügt", { exact: false }).first(),
  ).toBeVisible();
});

test("the community invite dialog reads German", async ({ page }) => {
  await openInvitesIn(page, "de");
  await page.getByTestId("community-invite-dialog-trigger").click();

  const dialog = page.getByTestId("community-invite-dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Zur Community einladen" }),
  ).toBeVisible();
  for (const phrase of DIALOG_GERMAN) {
    await expect(dialog.getByText(phrase, { exact: false })).toBeVisible();
  }
  await expect(page.getByTestId("invite-link-url")).toHaveValue(INVITE_URL);
  await expect(page.getByTestId("copy-invite-link")).toHaveText(
    "Link kopieren",
  );

  // Both option tables are module-level descriptor arrays: these two reads are
  // what prove they are resolved per render rather than frozen at import.
  await expect(page.getByTestId("invite-link-ttl-trigger")).toHaveText(
    "3 Tage",
  );
  await expect(page.getByTestId("invite-link-max-uses-trigger")).toHaveText(
    "Kein Limit",
  );
  await page.getByTestId("invite-link-ttl-trigger").click();
  await expect(
    page.getByRole("menuitemradio", { name: "7 Tage" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
});

test("the member role reads Admin, not the settings section's Administration", async ({
  page,
}) => {
  await openInvitesIn(page, "de");

  // The two meanings of the msgid "Admin", on screen at the same time: this
  // nav entry is the relay admin console, the dropdown below is a member role.
  // They shared one catalogue entry until a `context` split them, and the
  // German for the console — "Administration" — was what the role rendered.
  await expect(page.getByTestId("settings-nav-relay-admin")).toContainText(
    "Administration",
  );

  await page.getByTestId("community-invite-dialog-trigger").click();
  await page.getByTestId("member-pubkey-input").fill(DIRECT_ADD_NPUB);
  await page.getByTestId(`member-search-result-${DIRECT_ADD_HEX}`).click();

  const memberRole = page.getByTestId("member-role");
  await expect(memberRole).toHaveText("Mitglied");
  await memberRole.click();

  await expect(
    page.getByRole("menuitemradio", { name: "Admin" }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitemradio", { name: "Administration" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
});

/**
 * The control: the same surfaces under `en` must NOT show the German phrases.
 *
 * Without it, a table resolved once at module scope while `de` happened to be
 * active would pass every test above.
 */
test("the same surfaces read English under en", async ({ page }) => {
  await openInvitesIn(page, "en");

  const panel = page.getByTestId("settings-panel-community-members");
  for (const phrase of PANEL_GERMAN) {
    await expect(panel.getByText(phrase, { exact: false })).toHaveCount(0);
  }
  await expect(page.getByTestId("community-members-search")).toHaveAttribute(
    "placeholder",
    "Search members",
  );

  await page.getByTestId("community-invite-dialog-trigger").click();
  const dialog = page.getByTestId("community-invite-dialog");
  await expect(dialog).toBeVisible();
  for (const phrase of DIALOG_GERMAN) {
    await expect(dialog.getByText(phrase, { exact: false })).toHaveCount(0);
  }
  await expect(page.getByTestId("invite-link-ttl-trigger")).toHaveText(
    "3 days",
  );
  await expect(page.getByTestId("invite-link-max-uses-trigger")).toHaveText(
    "No limit",
  );
});
