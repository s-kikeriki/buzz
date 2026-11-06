import { expect, type Locator, type Page, test } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";

/**
 * The workflow canvas and the trigger description engine, rendered in German.
 *
 * This tranche's two other gates are blind to the thing most likely to break
 * here. The coverage ratchet sees that no literal is left and the catalogue
 * gate sees that every id has a German translation — but the trigger summary
 * is assembled from a dozen separate messages whose *order* is the whole point,
 * and a frame that puts the author attribution in the wrong slot satisfies
 * both gates while reading as word salad on screen.
 *
 * The summary is also the one place where German and English genuinely diverge
 * in structure: English says "Message X is posted by Carl", German has to say
 * "Nachricht „X“ wird von Carl gepostet", with the attribution inside the
 * clause rather than after it. The assertions below are written against that
 * ordering specifically, so a regression to append-the-attribution fails here
 * and nowhere else.
 *
 * Every German assertion has an English counterpart in the last test. Without
 * it, a table resolved once at module scope would satisfy every German
 * assertion for the wrong reason — it would read German because German was the
 * boot locale, not because the renderer resolves per render.
 */

const LOCALE_STORAGE_KEY = "buzz.appearance.locale";
// Deliberately not the mock identity (`"deadbeef".repeat(8)`): that one
// resolves to "You"/"Du", and a resolved label would make the word-order
// assertions depend on a profile lookup. An unresolved author renders as its
// compact npub, which is a fixed string.
const AUTHOR_HEX = "ab".repeat(32);
const AUTHOR_NPUB = "npub14w4…6zts";

/**
 * Seeded before the bridge: `AppI18nProvider` reads the preference on mount and
 * the bridge is what triggers mount. Seeding after activates English first and
 * then swaps, which hides exactly the module-scope bug this spec is for.
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
  // The click is retried against the URL rather than awaited once:
  // `domcontentloaded` resolves before React attaches the handler, so a click
  // can land on a rendered-but-not-live button and be swallowed. Retrying the
  // click and gating on the route separates "the click was lost" from "the view
  // did not render", and a genuinely broken render still fails after the
  // retries. Without this the control run of this file failed one in three.
  await expect(async () => {
    await page.getByTestId("open-workflows-view").click();
    await expect(page).toHaveURL(/#\/workflows$/, { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByTestId("workflows-view")).toBeVisible();
  await waitForAnimations(page);
}

const YAML_TAB = { de: "YAML", en: "YAML" };
const FORM_TAB = { de: "Formular", en: "Form" };
const YAML_EDITOR = { de: "Workflow-YAML", en: "Workflow YAML" };

async function openCreateDialog(page: Page): Promise<Locator> {
  // By testid: this button's own label is still English in both locales — it
  // belongs to `WorkflowsView`, which a later tranche converts — so naming it
  // would read as a German assertion that is really an English one.
  await page.getByTestId("new-workflow-card").click();
  // Identified by its primary action's testid, not by its accessible name: the
  // dialog's name is its title, which is copy another spec asserts, and a bare
  // `getByRole("dialog")` also matches the channel combobox popover.
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

/** Write a definition through the YAML editor and switch back to the canvas. */
async function loadDefinition(
  page: Page,
  dialog: Locator,
  locale: "en" | "de",
  lines: string[],
) {
  await dialog.getByRole("tab", { name: YAML_TAB[locale] }).click();
  const yamlEditor = dialog.getByRole("textbox", {
    name: YAML_EDITOR[locale],
  });
  await expect(yamlEditor).toBeVisible();
  await yamlEditor.fill(`${lines.join("\n")}\n`);
  await dialog.getByRole("tab", { name: FORM_TAB[locale] }).click();
  await waitForAnimations(page);
}

const TEXT_AND_AUTHOR_TRIGGER = [
  "name: Deploy",
  "trigger:",
  "  on: message_posted",
  `  filter: str_contains(trigger_text, "deploy") && trigger_author == "${AUTHOR_HEX}"`,
  "steps:",
  "  - id: notify",
  "    action: send_message",
  "    text: Los geht es",
];

/**
 * The canvas summary, the node chrome and the inspector in one journey.
 *
 * Merged deliberately rather than split per subject: the e2e preview server is
 * a single-threaded `python3 -m http.server`, and each extra app load is
 * another chance for an asset fetch to stall for minutes — which surfaces as a
 * navigation timeout that looks nothing like a copy failure.
 */
test("the trigger summary puts the German attribution inside the clause", async ({
  page,
}) => {
  await openWorkflowsIn(page, "de");
  const dialog = await openCreateDialog(page);
  await loadDefinition(page, dialog, "de", TEXT_AND_AUTHOR_TRIGGER);

  // The assertion this file exists for. English assembles
  // "Message by <author> contains “deploy”"; German has to read
  // "Nachricht von <author> enthält „deploy“" — the subject, then the
  // attribution, then the verb, then the value, with German quotation marks.
  // The author is unresolved here, so it renders as its compact npub; that is
  // a stable value and keeps the assertion about word order.
  const triggerNode = dialog.getByRole("button", { name: /^Auslöser: / });
  await expect(triggerNode).toHaveAccessibleName(
    `Auslöser: Nachricht von ${AUTHOR_NPUB} enthält „deploy“`,
  );

  // The step node's own label and title, and the add-step affordance whose
  // label used to be chosen by comparing this title to the literal "Trigger".
  await expect(
    dialog.getByRole("button", { name: /^Schritt 1: / }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Schritt hinzufügen", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Nach Schritt 1 hinzufügen" }),
  ).toBeVisible();

  // The inspector chrome and both of its type menus.
  await triggerNode.click();
  const inspector = dialog.getByTestId("workflow-node-inspector");
  await expect(inspector).toBeVisible();
  await waitForAnimations(page);
  // "Auslöser", not "Trigger": the catalogue already had a German term for it
  // from an earlier tranche, and the canvas now uses the same one.
  await expect(inspector.getByText("Auslöser", { exact: true })).toBeVisible();
  await expect(
    inspector.getByRole("button", { name: "Auslöser-Ereignis" }),
  ).toHaveText("Nachricht gepostet");
  await expect(
    inspector.getByRole("button", { name: "Inspektor schließen" }),
  ).toBeVisible();
});

test("the schedule form and the cron editor are German", async ({ page }) => {
  await openWorkflowsIn(page, "de");
  const dialog = await openCreateDialog(page);
  await loadDefinition(page, dialog, "de", [
    "name: Zeitplan",
    "trigger:",
    "  on: schedule",
    "  cron: 0 9 1 * *",
    "steps:",
    "  - id: notify",
    "    action: send_message",
    "    text: Hallo",
  ]);

  await dialog.getByRole("button", { name: /^Auslöser: / }).click();
  const inspector = dialog.getByTestId("workflow-node-inspector");
  await expect(inspector).toBeVisible();
  await waitForAnimations(page);

  // The frequency radio labels come from a `Record<T, MessageDescriptor>` whose
  // every value is a single word or two — the shape the coverage detector
  // reports as zero findings, so reading the screen is the only check there is.
  for (const label of [
    "Alle 15 Minuten",
    "Alle 30 Minuten",
    "Jede Stunde",
    "Täglich",
    "Wöchentlich",
    "Monatlich",
    "Eigener Cron",
  ]) {
    await expect(inspector.getByText(label, { exact: true })).toBeVisible();
  }

  // A cron of `0 9 1 * *` parses as monthly on day 1, so the day select and
  // the run-time field are both present.
  await expect(inspector.getByText("Tag des Monats")).toBeVisible();
  await expect(inspector.getByText("Laufzeit (UTC)")).toBeVisible();
  // Day 29 does not exist in every month. The warning is produced by a helper,
  // not by a JSX node, which is why it needs this assertion and not the
  // detector's.
  await inspector.getByLabel("Tag des Monats").selectOption("29");
  await expect(
    inspector.getByText("Dieser Zeitplan läuft in manchen Monaten nicht."),
  ).toBeVisible();

  await inspector.getByText("Wöchentlich", { exact: true }).click();
  await waitForAnimations(page);
  await expect(inspector.getByText("Wiederholen am")).toBeVisible();
  // Two of English's seven initials are ambiguous — "S" is Sunday and
  // Saturday, "T" is Tuesday and Thursday. German needs four distinct forms
  // there, which only works because each initial carries its own msgctxt.
  // Asserting all seven is what catches a context being dropped: without one,
  // two pairs collapse onto a single translation.
  for (const [name, initial] of [
    ["Sonntag", "So"],
    ["Montag", "Mo"],
    ["Dienstag", "Di"],
    ["Mittwoch", "Mi"],
    ["Donnerstag", "Do"],
    ["Freitag", "Fr"],
    ["Samstag", "Sa"],
  ]) {
    await expect(inspector.getByLabel(name)).toHaveCount(1);
    await expect(inspector.getByText(initial, { exact: true })).toHaveCount(1);
  }

  await inspector.getByText("Eigener Cron", { exact: true }).click();
  await waitForAnimations(page);
  await expect(inspector.getByText("Cron-Ausdruck")).toBeVisible();
  for (const field of ["Minute", "Stunde", "Tag", "Monat", "Wochentag"]) {
    await expect(inspector.getByLabel(field, { exact: true })).toHaveCount(1);
  }
  await expect(
    inspector.getByText(
      "UTC · Füge alle 5 Felder ein oder nutze Platzhalter, Listen, Bereiche und Schrittweiten.",
    ),
  ).toBeVisible();

  // The field name is interpolated into the error rather than prefixed to it,
  // so this also proves the placeholder survived translation.
  await inspector.getByLabel("Wochentag", { exact: true }).fill("9");
  await expect(
    inspector.getByText("Wochentag muss zwischen 0 und 7 liegen."),
  ).toBeVisible();
});

test("a Form-mode parse error is German", async ({ page }) => {
  await openWorkflowsIn(page, "de");
  const dialog = await openCreateDialog(page);

  // These errors are `error:` properties of returned object literals, the
  // shape the coverage detector reports three of out of twenty-four.
  await loadDefinition(page, dialog, "de", [
    "name: Kaputt",
    "trigger:",
    "  on: message_posted",
    "steps: []",
    "unbekannt: 1",
  ]);
  await expect(dialog.getByRole("alert")).toHaveText(
    "Wechsel zur Formularansicht nicht möglich: Nicht unterstütztes Workflow-Feld „unbekannt“ – nutze den YAML-Editor",
  );
});

/**
 * The control. Every German phrase asserted above must be absent under `en`,
 * and the English word order has to be the English one — the summary is the
 * place where the two orders differ, so asserting only absence would miss a
 * frame that translated correctly and then also reordered English.
 */
test("the English summary keeps its own word order and none of the German copy appears", async ({
  page,
}) => {
  await openWorkflowsIn(page, "en");
  const dialog = await openCreateDialog(page);
  await loadDefinition(page, dialog, "en", TEXT_AND_AUTHOR_TRIGGER);

  const triggerNode = dialog.getByRole("button", { name: /^Trigger: / });
  await expect(triggerNode).toHaveAccessibleName(
    `Trigger: Message by ${AUTHOR_NPUB} contains “deploy”`,
  );
  await expect(
    dialog.getByRole("button", { name: "Add step", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Add after Step 1" }),
  ).toBeVisible();

  for (const phrase of [
    "Nachricht von",
    "enthält",
    "Schritt hinzufügen",
    "Auslöser-Ereignis",
  ]) {
    await expect(dialog.getByText(phrase)).toHaveCount(0);
  }

  await triggerNode.click();
  const inspector = dialog.getByTestId("workflow-node-inspector");
  await expect(inspector).toBeVisible();
  await waitForAnimations(page);
  await expect(
    inspector.getByRole("button", { name: "Trigger event" }),
  ).toHaveText("Message Posted");
});
