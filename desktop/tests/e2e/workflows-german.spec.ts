import { expect, type Locator, type Page, test } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";

/**
 * The workflow editor, rendered in German.
 *
 * The third gate, and the only one that sees what the other two cannot.
 * `pnpm check:i18n` proves every extracted id has a German translation and the
 * coverage ratchet proves no converted file still holds a literal — but a
 * descriptor that is built and never resolved, or a copy table resolved once
 * at module scope, satisfies both and still puts English on screen.
 *
 * Scope note: this file covers the editor dialog and its step forms. The
 * canvas and the trigger description engine are covered by
 * `workflow-triggers-german.spec.ts`; the helpers below reach two canvas
 * controls, and they now use the German names those controls acquired in that
 * tranche. They were English here on purpose until it landed.
 *
 * Every German assertion has an English counterpart at the bottom asserting
 * the same phrases are absent under `en`. Without that control, a label
 * resolved once at module load would pass every German assertion for the
 * wrong reason: it would read German because German was the boot locale, not
 * because the component resolves it per render.
 */

const LOCALE_STORAGE_KEY = "buzz.appearance.locale";

/**
 * Seeded before the bridge: `AppI18nProvider` reads the preference on mount,
 * and the bridge is what triggers mount. Seeding afterwards activates English
 * first and then swaps, which hides a module-scope resolution bug.
 */
async function openWorkflowsIn(page: Page, locale: "en" | "de") {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: LOCALE_STORAGE_KEY, value: locale },
  );
  await installMockBridge(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // The click is retried until the route actually changes. `domcontentloaded`
  // resolves before React attaches the handler, so a click can land on a
  // rendered-but-not-yet-live button and be swallowed — twice in eight runs
  // this spec reached the workflows-view assertion having never navigated,
  // which reads exactly like a product bug. Retrying the *click* and gating
  // on the URL separates "the click was lost" from "the view did not render",
  // and a genuinely broken render still fails after the retries.
  await expect(async () => {
    await page.getByTestId("open-workflows-view").click();
    await expect(page).toHaveURL(/#\/workflows$/, { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByTestId("workflows-view")).toBeVisible();
  await waitForAnimations(page);
}

/** Open the create dialog and pick a channel, by its English affordances. */
async function openCreateDialog(page: Page): Promise<Locator> {
  // By testid: this button's label is German now, and naming it here would
  // make the helper assert copy while meaning to click.
  await page.getByTestId("new-workflow-card").click();
  // Not by accessible name: the dialog's name *is* its title, which is one of
  // the strings under test, so naming it here would make the helper assert
  // the thing the tests are supposed to assert. And not a bare
  // `getByRole("dialog")` either — the channel combobox is a Radix popover
  // that also carries `role="dialog"`, so there are two. The primary-action
  // testid identifies the modal without reading any copy.
  const dialog = page
    .locator('[role="dialog"]')
    .filter({ has: page.getByTestId("workflow-dialog-primary-action") });
  await expect(dialog).toBeVisible();
  await waitForAnimations(page);

  const channelList = page.getByTestId("channel-combobox-list");
  if (!(await channelList.isVisible())) {
    await dialog.getByRole("combobox").first().click();
  }
  await expect(channelList).toBeVisible();
  await waitForAnimations(page);
  await channelList
    .getByRole("option", { name: "agents", exact: true })
    .click();
  return dialog;
}

/** Add a send-message step and leave its inspector open. */
async function addSendMessageStep(
  page: Page,
  dialog: Locator,
  locale: "en" | "de",
) {
  // The canvas "+" button. Its accessible name is the same message as the
  // dialog's primary action, so it is scoped to the node list rather than the
  // dialog; the primary action is a button, not a list item.
  const addStep = { de: "Schritt hinzufügen", en: "Add step" };
  const sendMessage = { de: "Nachricht senden", en: "Send Message" };
  await dialog
    .getByRole("list")
    .getByRole("button", { name: addStep[locale], exact: true })
    .click();
  await page.getByRole("menuitem", { name: sendMessage[locale] }).click();
  const inspector = dialog.getByTestId("workflow-node-inspector");
  await expect(inspector).toBeVisible();
  await waitForAnimations(page);
  return inspector;
}

test("the create dialog's own chrome is German", async ({ page }) => {
  await openWorkflowsIn(page, "de");
  const dialog = await openCreateDialog(page);

  await expect(
    dialog.getByRole("heading", { name: "Workflow erstellen" }),
  ).toBeVisible();
  await expect(dialog).toContainText(
    "Automatisiere Aktionen, wenn in einem Kanal etwas passiert.",
  );
  await expect(dialog.getByRole("tab", { name: "Formular" })).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Workflow-Namen bearbeiten" }),
  ).toBeVisible();
  // Before a step exists the primary action is the add-step button. Its
  // visible text and its `aria-label` are two different messages, so both are
  // asserted.
  const primaryAction = dialog.getByTestId("workflow-dialog-primary-action");
  await expect(primaryAction).toHaveText("Schritt hinzufügen");
  await expect(primaryAction).toHaveAccessibleName("Ersten Schritt hinzufügen");
});

/**
 * The step form and the suggestion popover in one journey.
 *
 * They were two tests with identical setup. Merged on purpose: the e2e
 * preview server is a single-threaded `python3 -m http.server`, and a run
 * that loads the app one extra time occasionally stalls for minutes on the
 * asset fetch — which surfaces as a navigation timeout that looks nothing
 * like a copy failure. Fewer page loads per file is the only lever a spec
 * has over that.
 *
 * The popover half is the part this tranche most needed. It is the only
 * assertion that reaches three things at once: the descriptor table resolved
 * per render, the group heading that used to *be* the grouping key, and the
 * suggestion filter — which searches the description, so leaving it a
 * descriptor would make typing German match nothing while typing English
 * matched a row showing German.
 */
test("the step form and its variable popover are German, and the popover filters on its German text", async ({
  page,
}) => {
  await openWorkflowsIn(page, "de");
  const dialog = await openCreateDialog(page);
  const inspector = await addSendMessageStep(page, dialog, "de");

  // The field label is a `t` call in the step card; the section buttons are
  // the two accordion headers.
  await expect(inspector.getByLabel("Nachrichtentext")).toBeVisible();
  await expect(
    inspector.getByRole("button", { name: "Ausführungssteuerung" }),
  ).toBeVisible();
  await expect(
    inspector.getByRole("button", { name: "Schritt-Details" }),
  ).toBeVisible();

  await inspector.getByRole("button", { name: "Ausführungssteuerung" }).click();
  await waitForAnimations(page);
  // `Timeout` is one msgid used as both a bare label and an `(optional)`
  // variant; the run controls render the bare one.
  await expect(
    inspector.getByRole("textbox", { name: "Zeitlimit", exact: true }),
  ).toBeVisible();

  await inspector.getByRole("button", { name: "Schritt-Details" }).click();
  await waitForAnimations(page);
  await expect(inspector.getByLabel("Name (optional)")).toBeVisible();
  await expect(inspector.getByText("Schritt-ID")).toBeVisible();

  const messageField = inspector.getByLabel("Nachrichtentext");
  await messageField.fill("{{");
  const listbox = page.getByRole("listbox");
  await expect(listbox).toBeVisible();
  await waitForAnimations(page);

  await expect(listbox.getByText("Auslöser", { exact: true })).toBeVisible();
  await expect(
    listbox.getByText("Nachrichtentext", { exact: true }),
  ).toBeVisible();
  await expect(listbox.getByText("Pubkey des Autors")).toBeVisible();
  await expect(listbox.getByText("Unix-Zeitstempel")).toBeVisible();

  // Typing the German description has to narrow the list. `trigger.timestamp`
  // contains no "zeitstempel", so a row that survives this query can only
  // have matched its resolved description.
  await messageField.fill("{{Zeitstempel");
  await expect(listbox.getByText("Unix-Zeitstempel")).toBeVisible();
  await expect(listbox.getByText("Pubkey des Autors")).not.toBeVisible();

  await messageField.fill("{{keinetreffer");
  await expect(listbox.getByText("Keine passenden Variablen")).toBeVisible();
});

test("the activation warning is German, including its spelled-out interval", async ({
  page,
}) => {
  await openWorkflowsIn(page, "de");
  const dialog = await openCreateDialog(page);

  // A schedule trigger written through the YAML editor: an `interval` of 5m
  // is the one path on a converted screen that renders a spelled-out
  // duration, so it is the only place the ICU unit plurals are observable.
  await dialog.getByRole("tab", { name: "YAML" }).click();
  // German, since the canvas tranche landed: the editor's own label is
  // "Workflow-YAML" now.
  const yamlEditor = dialog.getByRole("textbox", { name: "Workflow-YAML" });
  await expect(yamlEditor).toBeVisible();
  await yamlEditor.fill(
    [
      "name: Zeitplan",
      "trigger:",
      "  on: schedule",
      "  interval: 5m",
      "steps:",
      "  - id: notify",
      "    action: send_message",
      "    text: Hallo",
      "",
    ].join("\n"),
  );
  // By testid: the submit label is one of the strings under test, and
  // matching it by name here would assert it twice while meaning to click.
  await dialog.getByTestId("workflow-dialog-primary-action").click();

  const confirmation = page.getByRole("alertdialog", {
    name: "Dieser Workflow läuft möglicherweise häufig",
  });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText(
    "Er ist so geplant, dass er alle 5 Minuten läuft. Prüfe den Zeitplan, bevor du ihn einschaltest.",
  );
  await expect(
    confirmation.getByRole("button", { name: "Einschalten" }),
  ).toBeVisible();
  await expect(
    confirmation.getByRole("button", { name: "Ausgeschaltet lassen" }),
  ).toBeVisible();
});

/**
 * The control. Each phrase asserted above must be absent under `en`, or a
 * module-scope resolution would satisfy the German tests for the wrong
 * reason.
 */
test("none of the German copy appears under en", async ({ page }) => {
  await openWorkflowsIn(page, "en");
  const dialog = await openCreateDialog(page);

  await expect(
    dialog.getByRole("heading", { name: "Create workflow" }),
  ).toBeVisible();
  for (const phrase of [
    "Workflow erstellen",
    "Automatisiere Aktionen",
    "Workflow-Namen bearbeiten",
    "Formular",
  ]) {
    await expect(dialog.getByText(phrase)).toHaveCount(0);
  }

  const inspector = await addSendMessageStep(page, dialog, "en");
  await expect(inspector.getByLabel("Message text")).toBeVisible();
  for (const phrase of [
    "Nachrichtentext",
    "Ausführungssteuerung",
    "Schritt-Details",
  ]) {
    await expect(inspector.getByText(phrase)).toHaveCount(0);
  }

  await inspector.getByLabel("Message text").fill("{{");
  const listbox = page.getByRole("listbox");
  await expect(listbox).toBeVisible();
  await expect(listbox.getByText("Trigger", { exact: true })).toBeVisible();
  await expect(listbox.getByText("Author pubkey")).toBeVisible();
  await expect(listbox.getByText("Auslöser")).toHaveCount(0);
  await expect(listbox.getByText("Pubkey des Autors")).toHaveCount(0);
});
