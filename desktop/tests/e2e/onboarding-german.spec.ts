import { expect, type Page, test } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";

/**
 * First run under the German catalogue, and the OS-locale default that gets
 * someone there without touching a setting.
 *
 * These two belong in one spec because they are two halves of the same bug.
 * Ethos's Debian box runs `LANG=de_DE.UTF-8` and the app still started in
 * English, and even once it did not, the first screen it showed was English
 * anyway — the language control lives in Settings, which is behind the
 * account this screen exists to create.
 *
 * Every German assertion is paired with a negative on the English original.
 * A half-applied catalogue renders the English source string, so a positive
 * assertion alone would pass on exactly the regression being guarded.
 *
 * Not flavor-gated: this is the catalogue, not the branding, and it must hold
 * for a stock bundle too.
 */

const SHOTS = "test-results/onboarding-de";
const LOCALE_STORAGE_KEY = "buzz.appearance.locale";

test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

/** The first-run gate, with no community and no onboarding state seeded. */
async function openFirstRun(page: Page) {
  await installMockBridge(page, undefined, {
    skipCommunitySeed: true,
    skipOnboardingSeed: true,
  });
  await page.goto("/");
  await expect(page.getByTestId("machine-onboarding-gate")).toBeVisible();
  await waitForAnimations(page);
}

/**
 * Seeded before the bridge: `AppI18nProvider` reads the preference on mount
 * and the bridge is what triggers mount, so seeding after it activates one
 * catalogue and then swaps.
 */
async function seedStoredLocale(page: Page, locale: string) {
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: LOCALE_STORAGE_KEY, value: locale },
  );
}

test.describe("the OS locale decides when nothing is saved", () => {
  // Playwright's `locale` sets `navigator.language`/`navigator.languages` in
  // the browser, which is the signal `osPreferredLocales` reads first. It is
  // Chromium here, not the WebKitGTK the `.deb` ships — so this binds the
  // app's half of the contract (we consult the OS and map it) and not
  // WebKitGTK's half (that it reports `LANG`).
  test.describe(() => {
    test.use({ locale: "de-DE" });

    test("a German OS boots into German with no preference stored", async ({
      page,
    }) => {
      await openFirstRun(page);

      await expect(
        page.getByRole("button", {
          name: "Neuen Identitätsschlüssel erstellen",
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Create a new identity key" }),
      ).toHaveCount(0);
    });

    test("a stored preference still outranks the OS", async ({ page }) => {
      // Someone who chose English on a German machine keeps English. Without
      // this the detection would override a deliberate choice on every launch.
      await seedStoredLocale(page, "en");
      await openFirstRun(page);

      await expect(
        page.getByRole("button", { name: "Create a new identity key" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Neuen Identitätsschlüssel erstellen",
        }),
      ).toHaveCount(0);
    });
  });

  test.describe(() => {
    test.use({ locale: "fr-FR" });

    test("a language with no catalogue falls back to English", async ({
      page,
    }) => {
      await openFirstRun(page);

      await expect(
        page.getByRole("button", { name: "Create a new identity key" }),
      ).toBeVisible();
    });
  });
});

test.describe("the first-run screens read German", () => {
  test.beforeEach(async ({ page }) => {
    await seedStoredLocale(page, "de");
    await openFirstRun(page);
  });

  test("the landing page", async ({ page }) => {
    const gate = page.getByTestId("machine-onboarding-gate");

    // The tagline carries a <br/> inside the message, so assert on the text
    // either side of it rather than on one run.
    await expect(gate).toContainText("Deine Leute, deine Agenten, deine");
    await expect(gate).toContainText("alles an einem Ort.");
    await expect(gate).not.toContainText("all in one place");

    await expect(
      page.getByRole("button", { name: "Neuen Identitätsschlüssel erstellen" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Vorhandenen Schlüssel verwenden" }),
    ).toBeVisible();
    for (const english of [
      "Create a new identity key",
      "Use an existing key",
    ]) {
      await expect(page.getByRole("button", { name: english })).toHaveCount(0);
    }

    // Present from the start but faded in after a delay, so this reads its
    // text rather than clicking it — the help screen is reached below through
    // the always-visible inline link instead.
    await expect(page.getByTestId("identity-key-help-trigger")).toHaveText(
      "Was ist ein Identitätsschlüssel?",
    );

    await waitForAnimations(page);
    await page.screenshot({ path: `${SHOTS}/01-landing.png` });
  });

  test("the create-a-key screen", async ({ page }) => {
    await page
      .getByRole("button", { name: "Neuen Identitätsschlüssel erstellen" })
      .click();

    const intro = page.getByTestId("onboarding-page-key-intro");
    await expect(intro).toBeVisible();
    await expect(intro).toContainText("Privaten Identitätsschlüssel erstellen");
    await expect(intro).not.toContainText("Create a private identity key");

    // All three guidance rows: the middle one is the only place the em dash
    // became a German en dash, which is the kind of detail a bulk translation
    // drops.
    for (const line of [
      "Sicher auf diesem Gerät gespeichert",
      "Gib ihn niemals weiter – wer diesen Schlüssel hat, kann sich als du anmelden",
      "Nutze ein sicheres Backup, um dein Konto wiederherzustellen",
    ]) {
      await expect(page.getByTestId("onboarding-key-guidance")).toContainText(
        line,
      );
    }
    await expect(page.getByTestId("onboarding-key-guidance")).not.toContainText(
      "Stored securely on this device",
    );

    await expect(page.getByTestId("onboarding-create-private-key")).toHaveText(
      "Meinen privaten Schlüssel erstellen",
    );

    await waitForAnimations(page);
    await page.screenshot({ path: `${SHOTS}/02-create-key.png` });
  });

  test("the identity-key explainer", async ({ page }) => {
    await page
      .getByRole("button", { name: "Neuen Identitätsschlüssel erstellen" })
      .click();
    await expect(page.getByTestId("onboarding-page-key-intro")).toBeVisible();

    await page
      .getByRole("button", { name: "So funktionieren Identitätsschlüssel" })
      .click();

    const help = page.getByTestId("identity-key-help-dialog");
    await expect(help).toBeVisible();
    await expect(help).toContainText("Was ist ein Identitätsschlüssel?");
    await expect(help).not.toContainText("What’s an identity key?");
    // The body is the longest prose in this tranche and the one most likely
    // to be left in English by a partial catalogue.
    await expect(help).toContainText(
      "erstellt eine Nostr-Identität aus zwei Teilen",
    );
    await expect(help).toContainText("Diese Identität gehört dir");
    await expect(help).not.toContainText("will create a Nostr identity");

    await waitForAnimations(page);
    await page.screenshot({ path: `${SHOTS}/03-identity-key-help.png` });
  });

  test("the sign-in-with-an-existing-key screen", async ({ page }) => {
    await page
      .getByRole("button", { name: "Vorhandenen Schlüssel verwenden" })
      .click();

    const gate = page.getByTestId("machine-onboarding-gate");
    await expect(gate).toContainText("Privaten Schlüssel eingeben");
    await expect(gate).not.toContainText("Enter your private key");
    // The sentence with the two inline links. Lingui numbers them, so a
    // translation that dropped `<0>`/`<1>` would render the literal markers
    // or lose the links entirely.
    await expect(gate).toContainText("Du kannst auch eine");
    await expect(page.getByTestId("nostr-import-file-button")).toHaveText(
      "Backup-Datei",
    );
    await expect(page.getByTestId("nostr-import-phone-link")).toHaveText(
      "von deinem Handy wiederherstellen",
    );

    await waitForAnimations(page);
    await page.screenshot({ path: `${SHOTS}/04-existing-key.png` });
  });
});
