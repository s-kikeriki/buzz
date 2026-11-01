import { expect, test, type Page } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";

const LOCALE_STORAGE_KEY = "buzz.appearance.locale";

/**
 * Proves the Settings panels render German, panel by panel.
 *
 * The catalogue gate already guarantees every extracted string has a German
 * translation, and the coverage gate guarantees these files hold no hardcoded
 * copy. Neither can tell you the strings reach the screen: a descriptor that
 * is never resolved, a table resolved at module scope, or a panel that throws
 * on mount all pass both gates and still show English — or nothing at all.
 * That is what this spec is for.
 *
 * Only always-visible sections are covered. `agents` and `channel-templates`
 * sit behind feature gates, and a spec that silently skipped them when the
 * gate was off would read green while covering nothing.
 *
 * Each expectation is a phrase that exists **only** in the German catalogue,
 * so an untranslated panel fails rather than matching by accident. They are
 * deliberately not the full sentence: wrapping and punctuation are not what
 * this asserts.
 */
async function openSettingsIn(page: Page, locale: "en" | "de") {
  // Must run before installMockBridge: React reads the preference on mount
  // and the bridge is what triggers that mount.
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: LOCALE_STORAGE_KEY, value: locale },
  );
  await installMockBridge(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("open-settings").click();
  await page.getByTestId("profile-popover-settings").click();
  await expect(page.getByTestId("settings-profile")).toBeVisible({
    timeout: 10_000,
  });
  await waitForAnimations(page);
}

async function openSection(page: Page, section: string, panelTestId: string) {
  await page.getByTestId(`settings-nav-${section}`).click();
  await expect(page.getByTestId(panelTestId)).toBeVisible({ timeout: 10_000 });
  await waitForAnimations(page);
}

/** `section` → panel test id, plus German phrases that must be on screen. */
const PANELS: Array<{
  section: string;
  panelTestId: string;
  german: string[];
}> = [
  {
    section: "profile",
    panelTestId: "settings-profile",
    german: ["Profilangaben", "Anzeigename", "Identitätsdetails", "Abmelden"],
  },
  {
    section: "notifications",
    panelTestId: "settings-notifications",
    german: [
      "Desktop-Hinweise",
      "Auch beim Lesen benachrichtigen",
      "Start-Zähler",
    ],
  },
  {
    section: "voice",
    panelTestId: "settings-voice",
    german: ["Wiedergabe", "Agenten-Sprachausgabe", "Pocket-TTS-Stimme"],
  },
  {
    section: "experimental",
    panelTestId: "settings-experimental",
    german: ["Funktionen", "noch verfeinert"],
  },
  {
    section: "hosted-communities",
    panelTestId: "hosted-communities-settings",
    german: ["funktioniert mit jedem Relay"],
  },
  {
    section: "mobile",
    panelTestId: "settings-mobile",
    german: ["QR-Code scannen", "Mobile App koppeln"],
  },
  {
    section: "updates",
    panelTestId: "settings-updates",
    german: ["Software-Updates", "Update-Status"],
  },
];

for (const { section, panelTestId, german } of PANELS) {
  test(`the ${section} settings panel reads German`, async ({ page }) => {
    await openSettingsIn(page, "de");
    await openSection(page, section, panelTestId);

    const panel = page.getByTestId(panelTestId);
    for (const phrase of german) {
      await expect(
        panel.getByText(phrase, { exact: false }).first(),
      ).toBeVisible();
    }
  });
}

/**
 * The control: the same walk under `en` must NOT show the German phrases.
 *
 * Without it, a panel that rendered the German string in every locale — a
 * descriptor resolved once at module scope while `de` happened to be active —
 * would pass every test above. This is the half that makes them falsifiable.
 */
test("the same panels read English under en", async ({ page }) => {
  await openSettingsIn(page, "en");

  for (const { section, panelTestId, german } of PANELS) {
    await openSection(page, section, panelTestId);
    const panel = page.getByTestId(panelTestId);
    for (const phrase of german) {
      await expect(panel.getByText(phrase, { exact: false })).toHaveCount(0);
    }
  }
});
