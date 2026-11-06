import { expect, test, type Page } from "@playwright/test";

import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";

const LOCALE_STORAGE_KEY = "buzz.appearance.locale";
const HUDDLE_CHANNEL_ID = "11111111-1111-4111-8111-111111111111";
const HUDDLE_PARENT_ID = "9a1657ac-f7aa-5db0-b632-d8bbeb6dfb50";

const DEFAULT_MEMBERS = [
  { pubkey: TEST_IDENTITIES.tyler.pubkey, role: "member" as const },
  { pubkey: TEST_IDENTITIES.alice.pubkey, role: "bot" as const },
];

/**
 * Proves the huddle drawer renders German.
 *
 * The coverage gate guarantees these files hold no hardcoded copy and the
 * catalogue gate guarantees every extracted string has a German translation.
 * Neither can tell you the strings reach the screen, and this area is unusually
 * exposed to that: nearly all of its copy lives in `aria-label`s and tooltips
 * on icon-only buttons, which is the shape both gates read as clean either way.
 *
 * Asserted phrases exist only in the German catalogue, and the `en` control at
 * the bottom is what makes them falsifiable.
 */
/**
 * Ten members, because the roster's "show all" trigger only appears once the
 * strip overflows `MAX_VISIBLE_PARTICIPANTS` (9). With two, the popover this
 * spec asserts on cannot be reached at all.
 */
const CROWDED_MEMBERS = [
  { pubkey: TEST_IDENTITIES.tyler.pubkey, role: "member" as const },
  { pubkey: TEST_IDENTITIES.alice.pubkey, role: "bot" as const },
  ...Array.from({ length: 8 }, (_, index) => ({
    pubkey: `${index + 1}`.repeat(64).slice(0, 64),
    role: "member" as const,
  })),
];

async function openHuddleIn(
  page: Page,
  locale: "de" | "en",
  members = DEFAULT_MEMBERS,
) {
  // Must run before installMockBridge: React reads the preference on mount
  // and the bridge is what triggers that mount.
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: LOCALE_STORAGE_KEY, value: locale },
  );
  await installMockBridge(page, {
    huddle: {
      ephemeralChannelId: HUDDLE_CHANNEL_ID,
      members,
      parentChannelId: HUDDLE_PARENT_ID,
      transcriptionEnabled: true,
    },
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
}

/** Icon-only controls in the bar, by their German accessible name. */
const BAR_CONTROLS_GERMAN = [
  "Transkript stoppen",
  "Emoji-Reaktionen",
  "Agent zum Huddle hinzufügen",
  "Huddle verlassen",
];

test("the huddle bar's controls read German", async ({ page }) => {
  await openHuddleIn(page, "de");

  for (const name of BAR_CONTROLS_GERMAN) {
    await expect(page.getByRole("button", { name })).toBeVisible();
  }
  // The one agent in the roster: a `t` label interpolating a display name.
  await expect(
    page.getByRole("button", { name: "Stimmeinstellungen für alice" }),
  ).toBeVisible();
});

test("the microphone popover reads German, including its device list", async ({
  page,
}) => {
  await openHuddleIn(page, "de");

  await page.getByRole("button", { name: "Audioeinstellungen" }).click();

  // Scoped to the popover: "Mikrofon" also appears in the bar's screen-reader
  // status line, and an unscoped exact match resolves to two elements.
  const settings = page.getByTestId("huddle-mic-settings");
  await expect(settings).toBeVisible();
  // `Input Mode`, `Push to Talk` and `Input Volume` are plain JSX text; the
  // device list's heading and its "System default" row come from a shared
  // component that takes its label as a prop, resolved by the caller.
  for (const phrase of [
    "Eingabemodus",
    "Push-to-Talk",
    "Eingangslautstärke",
    "Systemstandard",
  ]) {
    await expect(settings.getByText(phrase, { exact: true })).toBeVisible();
  }
  // Bound to the heading by test id, not by text position. An earlier version
  // asserted `.first()` of an exact "Mikrofon" match, and that could not fail:
  // the mock bridge seeds a device with no label and no id, whose fallback name
  // renders as "Mikrofon {0}" with the id empty, so hardcoding the heading back
  // to English still left a match for `.first()` to find.
  await expect(settings.getByTestId("device-list-label")).toHaveText(
    "Mikrofon",
  );
});

test("the participant roster reads German, with a real plural form", async ({
  page,
}) => {
  await openHuddleIn(page, "de", CROWDED_MEMBERS);

  await page
    .getByRole("button", { name: /Alle Huddle-Teilnehmer anzeigen/ })
    .click();

  await expect(
    page.getByRole("heading", { name: "Teilnehmer", exact: true }),
  ).toBeVisible();
  // The count came from a hand-built English plural (`participant` + "s").
  // This is the ICU form doing the same job.
  await expect(page.getByText("10 Teilnehmer", { exact: true })).toBeVisible();
});

/**
 * The control: the same surfaces under `en` must NOT show the German phrases.
 *
 * Without it, a label resolved once at module scope while `de` happened to be
 * active would pass every test above. The huddle area is full of module-level
 * tables, so this half is doing real work.
 */
test("the same controls read English under en", async ({ page }) => {
  await openHuddleIn(page, "en");

  for (const name of BAR_CONTROLS_GERMAN) {
    await expect(page.getByRole("button", { name })).toHaveCount(0);
  }
  await expect(
    page.getByRole("button", { name: "Stop transcript" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Audio settings" }),
  ).toBeVisible();
});
