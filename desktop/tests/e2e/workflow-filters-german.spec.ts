import { expect, type Locator, type Page, test } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";

/**
 * The trigger-condition editors, the channel combobox, and the workflows list
 * and its menus, rendered in German.
 *
 * Two of this tranche's findings are only observable here. The channel
 * combobox labelled its search field by lowercasing a translated noun and
 * appending an "s"; under German that yields a genitive singular, and both
 * other gates are green either way. And `Trigger` is a noun on the canvas and
 * a verb in the actions menu — one msgid holds one translation, so the menu
 * item renders the wrong word until it carries a context, which again neither
 * gate can see.
 *
 * Not covered here: the run trace. This build hides run history in the mock
 * bridge (`workflows.spec.ts` asserts that), so the shared status label is
 * bound by `workflowStatusLabel.test.mjs` instead, which asserts the lookup
 * rather than the words — under English the broken and fixed versions produce
 * identical output.
 */

const LOCALE_STORAGE_KEY = "buzz.appearance.locale";

async function openWorkflowsIn(page: Page, locale: "en" | "de") {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: LOCALE_STORAGE_KEY, value: locale },
  );
  await installMockBridge(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // Retried against the URL: `domcontentloaded` resolves before React attaches
  // the handler, so a click can land on a rendered-but-not-live button and be
  // swallowed. Gating on the route separates "the click was lost" from "the
  // view did not render".
  await expect(async () => {
    await page.getByTestId("open-workflows-view").click();
    await expect(page).toHaveURL(/#\/workflows$/, { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByTestId("workflows-view")).toBeVisible();
  await waitForAnimations(page);
}

/** The create dialog, with a channel chosen. By testid, never by copy. */
async function openCreateDialog(page: Page): Promise<Locator> {
  await page.getByTestId("new-workflow-card").click();
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

const TRIGGER_NODE = { de: /^Auslöser: /, en: /^Trigger: / };

/** Write a definition through the YAML editor and open the trigger inspector. */
async function openTriggerInspector(
  page: Page,
  dialog: Locator,
  locale: "en" | "de",
  lines: string[],
): Promise<Locator> {
  const tabs = {
    de: { yaml: "YAML", form: "Formular" },
    en: { yaml: "YAML", form: "Form" },
  };
  const editor = { de: "Workflow-YAML", en: "Workflow YAML" };
  await dialog.getByRole("tab", { name: tabs[locale].yaml }).click();
  const yamlEditor = dialog.getByRole("textbox", { name: editor[locale] });
  await expect(yamlEditor).toBeVisible();
  await yamlEditor.fill(`${lines.join("\n")}\n`);
  await dialog.getByRole("tab", { name: tabs[locale].form }).click();
  await waitForAnimations(page);
  await dialog.getByRole("button", { name: TRIGGER_NODE[locale] }).click();
  const inspector = dialog.getByTestId("workflow-node-inspector");
  await expect(inspector).toBeVisible();
  await waitForAnimations(page);
  return inspector;
}

const MESSAGE_TRIGGER = [
  "name: Filter",
  "trigger:",
  "  on: message_posted",
  "steps:",
  "  - id: notify",
  "    action: send_message",
  "    text: Hallo",
];

test("the trigger-condition editor is German, including its summaries", async ({
  page,
}) => {
  await openWorkflowsIn(page, "de");
  const dialog = await openCreateDialog(page);
  const inspector = await openTriggerInspector(
    page,
    dialog,
    "de",
    MESSAGE_TRIGGER,
  );

  await expect(inspector.getByRole("tab", { name: "Einfach" })).toBeVisible();
  await expect(inspector.getByRole("tab", { name: "Erweitert" })).toBeVisible();

  // The field names come from `conditionFieldsForTrigger`, a table of message
  // descriptors; "Beliebig" is a string literal inside a ternary, which the
  // coverage detector reported neither branch of.
  const textRow = inspector.getByRole("button", { name: /^Nachrichtentext/ });
  const authorRow = inspector.getByRole("button", { name: /^Autor/ });
  await expect(textRow).toBeVisible();
  await expect(authorRow).toContainText("Beliebig");

  // The first field opens expanded, so its operator buttons are already
  // rendered — clicking the row here would collapse it. Every value in that
  // table is one or two words, the shape the detector reports zero findings
  // for, so this is the only gate that sees them.
  for (const operator of [
    "enthält",
    "enthält nicht",
    "beginnt mit",
    "endet mit",
    "ist",
    "ist nicht",
    "ist nicht leer",
    "ist leer",
  ]) {
    await expect(
      inspector.getByRole("button", { name: operator, exact: true }),
    ).toHaveCount(1);
  }

  // Setting a value makes the row's collapsed summary read through the same
  // table, and reveals the clear affordance.
  const textInput = inspector.getByPlaceholder("z. B. deploy");
  await expect(textInput).toBeVisible();
  await textInput.fill("deploy");
  await expect(textRow).toContainText("enthält deploy");
  await expect(
    inspector.getByRole("button", { name: "Filter entfernen" }),
  ).toBeVisible();

  // The author field is a picker, not an input. Its own copy is this tranche's
  // as well.
  await authorRow.click();
  await waitForAnimations(page);
  await expect(
    inspector.getByRole("combobox", {
      name: "Autoren suchen oder öffentlichen Schlüssel einfügen",
    }),
  ).toBeVisible();
  await expect(
    inspector.getByTestId("workflow-author-picker-results"),
  ).toHaveAccessibleName("Autoren");
});

test("the channel combobox labels its own search field", async ({ page }) => {
  await openWorkflowsIn(page, "de");
  await page.getByTestId("new-workflow-card").click();
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

  // "Kanäle suchen", not "Suche kanals". The label was built by lowercasing
  // the combobox's noun and appending an "s" — an English pluralisation rule
  // applied to a translated word.
  const search = page.getByRole("combobox", { name: "Kanäle suchen" });
  await expect(search).toBeVisible();
  await expect(search).toHaveAttribute("placeholder", "Kanäle suchen …");
  // The options list's label is a frame with the noun in a placeholder, so
  // German can put it after the word it governs.
  await expect(channelList).toHaveAccessibleName("Optionen für Kanal");

  await search.fill("zzzz-kein-kanal");
  await expect(channelList.getByText("Keine Kanäle gefunden.")).toBeVisible();
});

test("the workflows list and a card's actions menu are German", async ({
  page,
}) => {
  await openWorkflowsIn(page, "de");

  await expect(page.getByRole("heading", { name: "Workflows" })).toBeVisible();
  await expect(
    page.getByText(
      "Automatisierungen, die deine Community in Bewegung halten.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Workflows neu laden" }),
  ).toBeVisible();

  const dialog = await openCreateDialog(page);
  await openTriggerInspector(page, dialog, "de", MESSAGE_TRIGGER);
  await dialog.getByTestId("workflow-dialog-primary-action").click();
  // Created disabled, so the activation prompt appears and is dismissed.
  const confirmation = page.getByTestId("workflow-activation-confirmation");
  if (await confirmation.isVisible()) {
    await confirmation
      .getByRole("button", { name: "Ausgeschaltet lassen" })
      .click();
  }

  const card = page.getByTestId(/^workflow-card-/).first();
  await expect(card).toBeVisible();
  await expect(
    card.getByRole("switch", { name: "Workflow aktivieren" }),
  ).toBeVisible();

  await card.getByRole("button", { name: "Workflow-Aktionen" }).click();
  await waitForAnimations(page);
  // The assertion this test exists for. `Trigger` is "Auslöser" as a noun on
  // the canvas and in the template-variable popover; here it is a verb, and
  // one msgid holds one translation. Without the context this item reads
  // "Auslöser".
  await expect(
    page.getByRole("menuitem", { name: "Auslösen", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Auslöser", exact: true }),
  ).toHaveCount(0);
  for (const item of ["Bearbeiten", "Duplizieren", "Löschen"]) {
    await expect(page.getByRole("menuitem", { name: item })).toBeVisible();
  }
});

/**
 * The control. Each phrase above must be absent under `en`, or a table
 * resolved once at module load would satisfy every German assertion for the
 * wrong reason — it would read German because German was the boot locale.
 */
test("none of the German copy appears under en", async ({ page }) => {
  await openWorkflowsIn(page, "en");
  await expect(
    page.getByText("Automations that keep your community moving."),
  ).toBeVisible();

  const dialog = await openCreateDialog(page);
  const inspector = await openTriggerInspector(
    page,
    dialog,
    "en",
    MESSAGE_TRIGGER,
  );
  await expect(inspector.getByRole("tab", { name: "Basic" })).toBeVisible();
  const authorRow = inspector.getByRole("button", { name: /^Author/ });
  await expect(authorRow).toContainText("Any");
  await expect(
    inspector.getByRole("button", { name: "contains", exact: true }),
  ).toHaveCount(1);
  await inspector.getByPlaceholder("e.g. deploy").fill("deploy");
  await expect(
    inspector.getByRole("button", { name: "Clear filter" }),
  ).toBeVisible();

  for (const phrase of [
    "Einfach",
    "Erweitert",
    "Beliebig",
    "enthält",
    "Filter entfernen",
  ]) {
    await expect(inspector.getByText(phrase)).toHaveCount(0);
  }
});
