import { expect, test, type Page } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";

const LOCALE_STORAGE_KEY = "buzz.appearance.locale";

/**
 * Proves the relay admin console renders German, tab by tab.
 *
 * The catalogue gate already guarantees every extracted string has a German
 * translation, and the coverage gate guarantees these files hold no hardcoded
 * copy. Neither can tell you the strings reach the screen, and this area is
 * full of the shapes where they don't: a module-level `Record<T, string>` of
 * relay identifiers resolved once at import time, a `msg` descriptor never
 * passed to `i18n._`, an ICU message whose braces hold a dot and which lingui
 * therefore drops from every compiled catalogue while all three gates stay
 * green. Only a render in the built bundle closes that gap.
 *
 * Each expectation is a phrase that exists **only** in the German catalogue,
 * so an untranslated tab fails rather than matching by accident. `Host`,
 * `Feedback`, `Community` and `Operator` are deliberately not used: they are
 * identical in both locales and would pass on an English screen.
 *
 * The mock bridge answers the console's reads from
 * `src/testing/e2eBridgeAdminConsole.ts` — probe authorized as operator, one
 * open report, one reviewed feedback entry, two operators, one community, one
 * restricted member. It models no mutation, so this spec reads screens and
 * never submits.
 */
async function openAdminConsoleIn(page: Page, locale: "en" | "de") {
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
  await page.getByTestId("settings-nav-relay-admin").click();
  await expect(page.getByTestId("settings-admin-console")).toBeVisible({
    timeout: 10_000,
  });
  // The panel appears only once the probe resolves; waiting for it is what
  // makes every tab assertion below reachable.
  await expect(page.getByTestId("admin-console-panel")).toBeVisible({
    timeout: 10_000,
  });
  await waitForAnimations(page);
}

/**
 * `tab` → German phrases that must be on screen.
 *
 * `placeholders` is a separate list because `getByText` cannot see a
 * `placeholder` attribute: asserting one through `getByText` fails as
 * "element not found" whether or not the string is translated, which reads
 * like a missing translation and is not one.
 */
const TABS: Array<{ tab: string; german: string[]; placeholders?: string[] }> =
  [
    {
      // Also covers the probe badge and the section header, which render above
      // the tab bar on every tab.
      //
      // "Meldungen" is deliberately NOT asserted here: the section header's
      // description contains the word, so a page-wide match stays green even
      // with the whole tab bar frozen in English — the break test proved it.
      // The tab labels get their own test below, bound to the buttons that
      // render them.
      tab: "reports",
      german: [
        "Verbunden als Operator",
        "Verwalte die Plattformebene",
        "Melder:",
        "Offen",
      ],
    },
    {
      tab: "feedback",
      german: ["Geprüft"],
    },
    {
      tab: "communities",
      german: ["Verbunden"],
      placeholders: ["Nach Host suchen (z. B. team.example.com)"],
    },
    {
      tab: "operators",
      german: ["Operator hinzufügen", "Konfiguration", "Datenbank"],
      placeholders: ["64-stelliger Hex-Pubkey"],
    },
  ];

for (const { tab, german, placeholders } of TABS) {
  test(`the admin console ${tab} tab reads German`, async ({ page }) => {
    await openAdminConsoleIn(page, "de");
    await page.getByTestId(`admin-tab-${tab}`).click();
    await waitForAnimations(page);

    const section = page.getByTestId("settings-admin-console");
    for (const phrase of german) {
      await expect(
        section.getByText(phrase, { exact: false }).first(),
      ).toBeVisible();
    }
    for (const phrase of placeholders ?? []) {
      await expect(section.getByPlaceholder(phrase).first()).toBeVisible();
    }
  });
}

/**
 * The tab bar, bound to the four buttons that render it.
 *
 * Each label is asserted on its own element rather than page-wide, because
 * every one of the four words also appears elsewhere on the screen — the
 * section header mentions reports and feedback, the operator roster mentions
 * operators. A page-wide match therefore passes with the tab bar frozen in
 * English, which is the exact regression the descriptor table exists to stop.
 */
test("the admin console tab bar reads German", async ({ page }) => {
  await openAdminConsoleIn(page, "de");

  for (const [tab, label] of [
    ["reports", "Meldungen"],
    ["feedback", "Feedback"],
    ["communities", "Communitys"],
    ["operators", "Operatoren"],
  ] as const) {
    await expect(page.getByTestId(`admin-tab-${tab}`)).toHaveText(label);
  }
});

/**
 * The report detail and its resolve form — where the action matrix, the
 * reason-audience copy and the detail-row labels live. These are the strings
 * that were a `switch` of single-word returns and a set of `label="..."`
 * props, so they are the ones most likely to have been missed.
 */
test("the admin console report detail and resolve form read German", async ({
  page,
}) => {
  await openAdminConsoleIn(page, "de");
  await page.getByTestId("admin-tab-reports").click();
  await waitForAnimations(page);

  const section = page.getByTestId("settings-admin-console");
  await section.getByRole("button", { name: /spam/ }).first().click();
  await expect(page.getByTestId("report-detail-fields")).toBeVisible({
    timeout: 10_000,
  });
  await waitForAnimations(page);

  for (const phrase of [
    "Zurück zu den Meldungen",
    "Zielart",
    "Gemeldete Nachricht",
    "Erledigt von",
    "Meldung erledigen",
    "Rauswerfen",
    "Eskalieren",
  ]) {
    await expect(
      section.getByText(phrase, { exact: false }).first(),
    ).toBeVisible();
  }

  // Selecting an action reveals the reason-audience disclosure, which is its
  // own message per action family.
  await page.getByTestId("action-btn-ban").click();
  await expect(page.getByTestId("resolve-reason-audience")).toHaveText(
    /betroffene Person/,
  );
});

/**
 * The community page: its section nav used to be
 * `s[0].toUpperCase() + s.slice(1)` over the section ids, so all four labels
 * were English with no literal anywhere for the detector to find.
 */
test("the admin console community page reads German", async ({ page }) => {
  await openAdminConsoleIn(page, "de");
  await page.getByTestId("admin-tab-communities").click();
  await waitForAnimations(page);

  await page.getByTestId("community-row-alpha.example.com").click();
  await expect(page.getByTestId("community-page")).toBeVisible({
    timeout: 10_000,
  });
  await waitForAnimations(page);

  const page_ = page.getByTestId("community-page");
  for (const phrase of ["Einschränkungen", "Mitglieder", "Aktionen"]) {
    await expect(
      page_.getByText(phrase, { exact: false }).first(),
    ).toBeVisible();
  }

  await page.getByTestId("community-section-restrictions").click();
  await expect(page.getByTestId("restrictions-section")).toBeVisible();
  for (const phrase of ["Aktive Einschränkungen", "gesperrt", "Auszeit"]) {
    await expect(
      page_.getByText(phrase, { exact: false }).first(),
    ).toBeVisible();
  }

  await page.getByTestId("community-section-actions").click();
  await expect(page.getByTestId("actions-tab")).toBeVisible();
  for (const phrase of [
    "Mitglied sperren",
    "Mitglied in Auszeit schicken",
    "Nachricht löschen",
    "Prüfen",
  ]) {
    await expect(
      page_.getByText(phrase, { exact: false }).first(),
    ).toBeVisible();
  }
});

/**
 * The control: the same walk under `en` must NOT show the German phrases.
 *
 * Without it, a label resolved once at module scope while `de` happened to be
 * active would pass every test above. This is the half that makes them
 * falsifiable.
 */
test("the admin console reads English under en", async ({ page }) => {
  await openAdminConsoleIn(page, "en");

  const section = page.getByTestId("settings-admin-console");
  // "Operator" is the same word in both locales, so the English-only half of
  // this phrase is "Connected as".
  await expect(section.getByText("Connected as Operator")).toBeVisible();

  for (const german of [
    "Verbunden als Operator",
    "Meldungen",
    "Operator hinzufügen",
  ]) {
    await expect(section.getByText(german, { exact: false })).toHaveCount(0);
  }

  await expect(page.getByTestId("admin-tab-reports")).toHaveText("Reports");
  await expect(page.getByTestId("admin-tab-operators")).toHaveText("Operators");

  await page.getByTestId("admin-tab-operators").click();
  await waitForAnimations(page);
  await expect(section.getByText("Add operator")).toBeVisible();
  await expect(
    section.getByText("Operator hinzufügen", { exact: false }),
  ).toHaveCount(0);
});
