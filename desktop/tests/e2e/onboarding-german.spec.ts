import { hexToBytes } from "@noble/hashes/utils.js";
import { expect, type Page, test } from "@playwright/test";
import { nsecEncode } from "nostr-tools/nip19";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";

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

  test("the key-import form itself", async ({ page }) => {
    await page
      .getByRole("button", { name: "Vorhandenen Schlüssel verwenden" })
      .click();

    // The form, not the step chrome around it. Its label is `sr-only` in this
    // treatment, so it is asserted through the accessible name rather than
    // visible text — which is also the thing a screen reader announces.
    await expect(
      page.getByLabel("Privater Schlüssel", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Private key", { exact: true })).toHaveCount(
      0,
    );

    const input = page.getByTestId("nostr-import-nsec-input");
    await expect(input).toHaveAttribute(
      "placeholder",
      "Gib hier deinen Schlüssel ein",
    );

    // Typing something that is not a key: the hint and the reveal toggle are
    // both copy the detector never saw, and the toggle's is an aria-label.
    await input.fill("definitiv kein schlüssel");
    await expect(page.getByTestId("nostr-import-feedback")).toContainText(
      "Warte auf einen gültigen nsec1-Schlüssel",
    );
    await expect(page.getByTestId("nostr-import-feedback")).not.toContainText(
      "Waiting for a valid nsec1 key",
    );
    await expect(
      page.getByTestId("nostr-import-reveal-toggle"),
    ).toHaveAttribute("aria-label", "Privaten Schlüssel anzeigen");

    await waitForAnimations(page);
    await page.screenshot({ path: `${SHOTS}/04b-import-form.png` });
  });
});

/**
 * The English counterpart of the key-import test above.
 *
 * Its own `describe` because the German block seeds `de` and navigates in
 * `beforeEach`, and a locale has to be seeded before the bridge mounts. Paired
 * on purpose: a catalogue that leaked German into the English build would pass
 * every assertion in the German test and fail here.
 */
test.describe("the key-import form still reads English under en", () => {
  test("the label and the invalid hint", async ({ page }) => {
    await seedStoredLocale(page, "en");
    await openFirstRun(page);
    await page.getByRole("button", { name: "Use an existing key" }).click();

    await expect(page.getByLabel("Private key", { exact: true })).toBeVisible();
    await page
      .getByTestId("nostr-import-nsec-input")
      .fill("definitely not a key");
    await expect(page.getByTestId("nostr-import-feedback")).toContainText(
      "Waiting for a valid nsec1 key",
    );
    await expect(page.getByTestId("nostr-import-feedback")).not.toContainText(
      "Warte auf einen gültigen nsec1-Schlüssel",
    );
  });
});

/**
 * The screens after the key exists — the batch the key-creation tranche adds.
 *
 * These are reached only by actually creating a key, so they sit in their own
 * describe with their own navigation rather than extending the first-run
 * block above. Same rule as there: every German assertion is paired with a
 * negative on the English source, because a half-applied catalogue renders
 * the English string and a positive assertion alone would pass on the
 * regression.
 */
test.describe("the key and backup screens read German", () => {
  test.beforeEach(async ({ page }) => {
    await seedStoredLocale(page, "de");
    await installMockBridge(page, undefined, {
      skipCommunitySeed: true,
      skipOnboardingSeed: true,
    });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Neuen Identitätsschlüssel erstellen" })
      .click();
    await page
      .getByRole("button", { name: "Meinen privaten Schlüssel erstellen" })
      .click();
    await expect(page.getByTestId("onboarding-page-backup")).toBeVisible();
  });

  test("the key well, after the creation hold", async ({ page }) => {
    // The step sells the creation moment first and swaps the heading after a
    // hold, so both headings are asserted: a German "creating" line and an
    // English "created" one would otherwise pass on the first check alone.
    await expect(
      page.getByRole("heading", {
        name: "Dein Identitätsschlüssel wird erstellt",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Dein privater Identitätsschlüssel" }),
    ).toBeVisible();
    for (const english of [
      "Creating your identity key",
      "Your private identity key",
    ]) {
      await expect(page.getByRole("heading", { name: english })).toHaveCount(0);
    }

    const step = page.getByTestId("onboarding-page-backup");
    await expect(step).toContainText(
      "Gib diesen Schlüssel nicht weiter. Wer ihn hat, kann auf dein Konto zugreifen.",
    );
    await expect(step).not.toContainText("Don’t share this key");
    await expect(page.getByTestId("backup-option-password")).toContainText(
      "Passwortgeschütztes Backup erstellen",
    );
    await expect(step).not.toContainText("Create locked backup");
    await expect(page.getByTestId("onboarding-next")).toHaveText("Weiter");

    await waitForAnimations(page);
    await page.screenshot({ path: `${SHOTS}/05-key-well.png` });
  });

  test("the locked-backup screen and its password field", async ({ page }) => {
    await page.getByTestId("backup-option-password").click();

    const creator = page.getByTestId("encrypted-backup-creator");
    await expect(creator).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Sichere Backup-Datei erstellen" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Create a secure backup file" }),
    ).toHaveCount(0);

    // The `aria-label` path, not just JSX text: the field's accessible name
    // comes from `t`` ` and was the shape the detector had to learn.
    await expect(page.getByTestId("backup-passphrase-input")).toHaveAttribute(
      "aria-label",
      "Verschlüsselungspasswort",
    );
    await expect(page.getByTestId("encrypted-backup-create")).toContainText(
      "Backup speichern",
    );
    await expect(page.getByTestId("encrypted-backup-create")).not.toContainText(
      "Save backup",
    );

    // The generator popover: a module-level copy table resolved through
    // `i18n._`, so a plain string there would freeze in the boot locale and
    // render English here even with the catalogue loaded.
    await page.getByTestId("backup-passphrase-generate").click();
    const separator = page.getByTestId("backup-passphrase-separator");
    await expect(separator).toBeVisible();
    await expect(separator.locator("option").first()).toHaveText("Leerzeichen");
    await expect(separator.locator("option")).not.toContainText(["Spaces"]);

    await waitForAnimations(page);
    await page.screenshot({ path: `${SHOTS}/06-locked-backup.png` });
  });
});

/**
 * The harness setup step, reached the way the English specs reach it: an
 * existing-key import lands straight on it.
 *
 * The connection-method screen it opens with belongs to the sibling tranche,
 * so its own copy is asserted there and reached here by `data-testid`. That
 * seam is deliberate: asserting the method screen's German in this block
 * would make the spec fail for a change it does not guard.
 */
test.describe("the harness setup step reads German", () => {
  test.beforeEach(async ({ page }) => {
    await seedStoredLocale(page, "de");
    await installMockBridge(page, undefined, {
      skipCommunitySeed: true,
      skipOnboardingSeed: true,
    });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Vorhandenen Schlüssel verwenden" })
      .click();
    await page
      .getByTestId("nostr-import-nsec-input")
      .fill(nsecEncode(hexToBytes(TEST_IDENTITIES.alice.privateKey)));
    await page.getByTestId("nostr-import-submit").click();
    await expect(page.getByTestId("onboarding-page-2")).toBeVisible();
  });

  test("the skip affordance this step owns", async ({ page }) => {
    await expect(page.getByTestId("onboarding-setup-skip")).toHaveText(
      "Später einrichten",
    );
    await expect(
      page.getByRole("button", { name: "Set up later" }),
    ).toHaveCount(0);
  });

  // The subscription method, not the API-key one: choosing "api" hands
  // straight over to the default-config step and never renders this list.
  test("the harness list, after choosing a connection method", async ({
    page,
  }) => {
    await page.getByTestId("onboarding-harness-method-subscription").click();

    const list = page.getByTestId("onboarding-page-2");
    await expect(
      page.getByRole("heading", { name: "Mit einem KI-Abo fortfahren" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Continue with an AI subscription" }),
    ).toHaveCount(0);
    await expect(list).toContainText(
      "Abos verbinden sich über ein kompatibles Harness",
    );
    await expect(list).not.toContainText(
      "Subscriptions connect through a compatible harness",
    );

    await waitForAnimations(page);
    await page.screenshot({ path: `${SHOTS}/05-harness-list.png` });
  });
});
