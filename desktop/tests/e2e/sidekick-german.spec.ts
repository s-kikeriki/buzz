import { expect, type Page, test } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";

/**
 * The Sidekick surface rendered in German.
 *
 * The feature is called **Sidekick** in both languages, and its directory,
 * components, tauri commands and `bestie` feature flag keep their original
 * names — only the copy a person reads was renamed. So this spec is the only
 * thing that can catch a missed string: a grep for "Bestie" in source still
 * matches dozens of legitimate identifiers, and the coverage ratchet only
 * proves a file holds no literal, not that the literal it replaced says
 * "Sidekick".
 *
 * Every German assertion is paired with a negative on both the English source
 * *and* the old "Bestie" wording. The second negative is the point: a string
 * that was translated but never renamed, or renamed in German but left as
 * "Bestie" in English, passes a plain German-only assertion.
 */

const SIDEKICK_PUBKEY = TEST_IDENTITIES.alice.pubkey;
const SECOND_PUBKEY = TEST_IDENTITIES.bob.pubkey;
const RELAY_URL = "ws://localhost:3000";
const LOCALE_STORAGE_KEY = "buzz.appearance.locale";

/**
 * Seeds the locale and the feature flag before the bridge mounts the app.
 * `AppI18nProvider` reads the preference on mount and the bridge is what
 * triggers mount, so seeding afterwards activates English first and then
 * swaps — which is exactly what hides a module-scope resolution.
 */
async function openSidekickIn(page: Page, locale: "en" | "de") {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
      window.localStorage.setItem(
        "buzz-feature-overrides-v1",
        JSON.stringify({ bestie: true }),
      );
    },
    { key: LOCALE_STORAGE_KEY, value: locale },
  );
  await installMockBridge(
    page,
    {
      managedAgents: [
        { pubkey: SIDEKICK_PUBKEY, name: "Mochi", status: "stopped" },
        { pubkey: SECOND_PUBKEY, name: "Yuzu", status: "stopped" },
      ],
      managedAgentRuntimes: [
        { pubkey: SIDEKICK_PUBKEY, relayUrl: RELAY_URL, lifecycle: "stopped" },
        { pubkey: SECOND_PUBKEY, relayUrl: RELAY_URL, lifecycle: "stopped" },
      ],
    },
    { seedPreviewFeatures: false },
  );
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("bestie-floating-avatar")).toBeVisible();
  await waitForAnimations(page);
}

/**
 * The agent-profile button's own accessible name is translated copy
 * (`{title} agent profile`), so a hardcoded English name finds nothing under
 * `de`. Reaching the Sidekick action means going through it, so the spec has
 * to speak the active locale here.
 */
function agentProfileButton(page: Page, locale: "en" | "de", name = "Mochi") {
  return page.getByRole("button", {
    name:
      locale === "de" ? `Agentenprofil von ${name}` : `${name} agent profile`,
  });
}

/** Walks the profile -> action -> confirm flow and returns the open dialog. */
async function openAssignDialog(page: Page, name: string) {
  await page.getByTestId("open-agents-view").click();
  await agentProfileButton(page, "de", name).click();
  const action = page.getByTestId("user-profile-bestie-action");
  await action.click();
  const dialog = page.getByTestId("bestie-confirm-dialog");
  await expect(dialog).toBeVisible();
  await waitForAnimations(page);
  return { action, dialog };
}

/** German phrase → [English source, old wording] that must both be absent. */
const EMPTY_STATE = [
  ["Sidekick auswählen", "Choose a Sidekick", "Choose a Bestie"],
  [
    "Öffne einen deiner lokalen Agenten und aktiviere Sidekick.",
    "Open one of your local agents and turn on Sidekick.",
    "Open one of your local agents and turn on Bestie.",
  ],
] as const;

test("the Sidekick overlay empty state reads German", async ({ page }) => {
  await openSidekickIn(page, "de");

  // Asserted before opening: the Bloom trigger morphs away while the panel is
  // open, so this resolves to 0 elements afterwards.
  await expect(
    page.getByRole("button", { name: "Sidekick öffnen" }),
  ).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Open Bestie" })).toHaveCount(
    0,
  );

  await page.getByTestId("bestie-floating-avatar").click();
  const bloom = page.getByTestId("bestie-bloom-content");
  await expect(bloom).toBeVisible();
  await waitForAnimations(page);

  for (const [german, english, old] of EMPTY_STATE) {
    await expect(bloom).toContainText(german);
    await expect(bloom).not.toContainText(english);
    await expect(bloom).not.toContainText(old);
  }
});

test("the assign flow and its confirmation read German", async ({ page }) => {
  await openSidekickIn(page, "de");

  await page.getByTestId("open-agents-view").click();
  await agentProfileButton(page, "de").click();

  const action = page.getByTestId("user-profile-bestie-action");
  await expect(action).toContainText("Als Sidekick festlegen");
  await expect(action).not.toContainText("Make Sidekick");
  await expect(action).not.toContainText("Make Bestie");

  await action.click();
  const dialog = page.getByTestId("bestie-confirm-dialog");
  await expect(dialog).toBeVisible();
  await waitForAnimations(page);

  // The title interpolates the agent name; the body is one whole sentence per
  // case because German cannot share a translatable tail between them.
  await expect(dialog).toContainText("Mochi als Sidekick festlegen?");
  await expect(dialog).not.toContainText("Make Mochi your");
  await expect(dialog).toContainText(
    "Mochi erscheint im schwebenden Schnellzugriff und in den Nachrichtenaktionen.",
  );
  await expect(dialog).not.toContainText("will appear in the floating");
  await expect(dialog).toContainText("Abbrechen");

  await dialog.getByRole("button", { name: "Als Sidekick festlegen" }).click();
  await expect(action).toContainText("Als Sidekick entfernen");
  await expect(action).not.toContainText("Remove Bestie");
});

test("the assigned Sidekick popover and badge read German", async ({
  page,
}) => {
  await openSidekickIn(page, "de");

  // Assign first: the popover composer and the card badge only exist once an
  // agent is designated, so asserting them before this would pass on absence.
  await page.getByTestId("open-agents-view").click();
  await agentProfileButton(page, "de").click();
  const action = page.getByTestId("user-profile-bestie-action");
  await action.click();
  const dialog = page.getByTestId("bestie-confirm-dialog");
  await dialog.getByRole("button", { name: "Als Sidekick festlegen" }).click();
  await expect(action).toContainText("Als Sidekick entfernen");

  // The card badge's tooltip and accessible name.
  const badge = page.getByTestId(`bestie-card-badge-${SIDEKICK_PUBKEY}`);
  await expect(badge).toHaveAttribute("title", "Sidekick");
  await expect(badge).toHaveAttribute("aria-label", "Mochi ist dein Sidekick");

  // The popover: close button and the composer's placeholder/aria name.
  await page.getByTestId("bestie-floating-avatar").click();
  const bloom = page.getByTestId("bestie-bloom-content");
  await expect(bloom).toBeVisible();
  await waitForAnimations(page);
  await expect(
    page.getByRole("button", { name: "Sidekick schließen" }),
  ).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Close Bestie" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "In der Sidekick-Unterhaltung senden" }),
  ).toHaveCount(1);
  await expect(bloom.getByTestId("bestie-composer")).toHaveAttribute(
    "placeholder",
    "Nachricht an Mochi",
  );
});

test("the Sidekick surface still reads English when the locale is en", async ({
  page,
}) => {
  await openSidekickIn(page, "en");

  await expect(page.getByRole("button", { name: "Open Sidekick" })).toHaveCount(
    1,
  );
  await expect(page.getByRole("button", { name: "Open Bestie" })).toHaveCount(
    0,
  );

  await page.getByTestId("bestie-floating-avatar").click();
  const bloom = page.getByTestId("bestie-bloom-content");
  await expect(bloom).toBeVisible();
  await waitForAnimations(page);

  // English, and renamed: the old wording must be gone from English too.
  await expect(bloom).toContainText("Choose a Sidekick");
  await expect(bloom).not.toContainText("Choose a Bestie");

  await page.keyboard.press("Escape");
  await page.getByTestId("open-agents-view").click();
  await agentProfileButton(page, "en").click();
  const action = page.getByTestId("user-profile-bestie-action");
  await expect(action).toContainText("Make Sidekick");
  await expect(action).not.toContainText("Make Bestie");
});

/**
 * The *replace* branch of the confirmation body.
 *
 * Without this, nothing exercises it: on a first assignment `previousName` is
 * undefined, so both branches render the "will appear" sentence and inverting
 * the condition changes nothing observable. A break test is what exposed that
 * — the spec passed against a mutated condition.
 */
test("the confirmation names the agent being replaced, in German", async ({
  page,
}) => {
  await openSidekickIn(page, "de");

  const first = await openAssignDialog(page, "Mochi");
  await first.dialog
    .getByRole("button", { name: "Als Sidekick festlegen" })
    .click();
  await expect(first.action).toContainText("Als Sidekick entfernen");

  // Yuzu now replaces Mochi, so the other sentence must render.
  const second = await openAssignDialog(page, "Yuzu");
  await expect(second.dialog).toContainText(
    "Yuzu ersetzt Mochi im schwebenden Schnellzugriff und in den Nachrichtenaktionen.",
  );
  await expect(second.dialog).not.toContainText("Yuzu erscheint im");
  await expect(second.dialog).not.toContainText("will replace");
});

/**
 * The sidebar entry. "Sidekick" is the same word in both languages, so a
 * positive German assertion here proves nothing — the negative on the old
 * wording is the whole value, and it is what catches a label left unrenamed.
 */
test("the sidebar entry is renamed, not just translated", async ({ page }) => {
  await openSidekickIn(page, "de");

  const entry = page.getByTestId("bestie-sidebar-entry");
  await expect(entry).toBeVisible();
  await expect(entry).toContainText("Sidekick");
  await expect(entry).not.toContainText("Bestie");
});
