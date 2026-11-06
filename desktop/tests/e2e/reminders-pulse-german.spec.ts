import { expect, type Page, test } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";
import { FEATURE_OVERRIDES_STORAGE_KEY } from "../helpers/features";

/**
 * Reminders and Pulse under the German catalogue.
 *
 * Assertions are on German text rather than on `data-testid`, for the same
 * reason as the sidebar and inbox specs: a testid is still there when the
 * translation is missing, and the point is what a person reads. Each group is
 * paired with a negative on the English original, because a half-applied
 * catalogue renders both and every positive assertion would still pass.
 *
 * What this spec can reach is narrower than what the tranche converted.
 * `RemindersPanel`'s grouped `card` presentation — the Overdue / Today /
 * Upcoming / Completed headings and the per-row Complete/Snooze/Cancel
 * controls — has no caller in the app today: the inbox mounts it as
 * `presentation="inbox-list"`, which flattens the groups away. Those headings
 * are covered by `reminderFilters.test.mjs` instead, which pins them through
 * `i18n`. Everything asserted below is a surface a person can actually open.
 */

const LOCALE_STORAGE_KEY = "buzz.appearance.locale";
const MOCK_PUBKEY = "deadbeef".repeat(8);
const GENERAL_CHANNEL_ID = "9a1657ac-f7aa-5db0-b632-d8bbeb6dfb50";

/**
 * Seeded before the bridge: `AppI18nProvider` reads the preference on mount
 * and the bridge is what triggers mount, so seeding after it activates English
 * first and swaps.
 */
async function seedGerman(page: Page) {
  await page.addInitScript((key) => {
    window.localStorage.setItem(key, "de");
  }, LOCALE_STORAGE_KEY);
}

/**
 * Pulse is a gated preview feature, so its nav row does not render by default.
 * Seeded as an override rather than skipped on: a spec that skips when Pulse
 * is absent turns "the tab bar is still English" into a skip, and a skip reads
 * green. `openPulse` asserts the row is there instead.
 */
async function seedPulseEnabled(page: Page) {
  await page.addInitScript(
    ({ key }) => {
      window.localStorage.setItem(key, JSON.stringify({ pulse: true }));
    },
    { key: FEATURE_OVERRIDES_STORAGE_KEY },
  );
}

/**
 * Pulse is reached by clicking its sidebar row, not by `page.goto("/pulse")`:
 * the preview server is a plain static file server with no SPA fallback, so a
 * deep route 404s and the assertions below would fail against an error page
 * rather than against the app.
 */
async function openPulse(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const pulseNav = page.getByTestId("open-pulse-view");
  await expect(pulseNav).toBeVisible();
  await pulseNav.click();
}

async function gotoInboxHome(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("home-inbox")).toBeVisible();
}

/** Open the inbox's Reminders filter. Under German it reads "Erinnerungen". */
async function openRemindersFilter(page: Page) {
  await page.getByTestId("inbox-filter-trigger").click();
  // Not `exact`: once a reminder is seeded the option carries a due-count
  // badge, so its accessible name becomes "Erinnerungen 1".
  await page.getByRole("menuitemradio", { name: "Erinnerungen" }).click();
  await expect(page.getByTestId("home-inbox-reminders")).toBeVisible();
}

/**
 * The reminders query mounts (for the badge) before this seeds events, so a
 * bare seed lands behind its cached empty result. Invalidate after seeding.
 */
async function seedReminder(
  page: Page,
  opts: { dTag: string; notBefore: number; note: string },
) {
  await page.evaluate(
    ({ dTag, notBefore, note, pubkey, channelId }) => {
      const event = {
        id: `de-${dTag}`,
        pubkey,
        created_at: Math.floor(Date.now() / 1000) - 300,
        kind: 30300,
        tags: [
          ["d", dTag],
          ["not_before", String(notBefore)],
        ],
        content: JSON.stringify({
          target: {
            eventId: "mock-general-welcome",
            channelId,
            preview: "Welcome to #general",
            authorPubkey: pubkey,
          },
          note,
          status: "pending",
        }),
        sig: "mocksig".repeat(20).slice(0, 128),
      };
      window.__BUZZ_E2E_SEED_MOCK_REMINDERS__?.([
        event,
      ] as unknown as Parameters<
        NonNullable<typeof window.__BUZZ_E2E_SEED_MOCK_REMINDERS__>
      >[0]);
      window.__BUZZ_E2E_QUERY_CLIENT__?.invalidateQueries({
        queryKey: ["reminders"],
      });
    },
    {
      dTag: opts.dTag,
      notBefore: opts.notBefore,
      note: opts.note,
      pubkey: MOCK_PUBKEY,
      channelId: GENERAL_CHANNEL_ID,
    },
  );
}

test.describe("reminders under the German catalogue", () => {
  test("the Remind me later dialog reads German", async ({ page }) => {
    await seedGerman(page);
    await installMockBridge(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByTestId("channel-general").click();
    await expect(page.getByTestId("chat-title")).toHaveText("general");

    const messageRow = page.getByTestId("message-row").first();
    await messageRow.hover();
    // "More actions" is already translated — the message action bar was an
    // earlier tranche, so this is the German label even before this change.
    await messageRow.getByRole("button", { name: "Weitere Aktionen" }).click();
    const remindItem = page.getByRole("menuitem", { name: "Später erinnern" });
    await expect(remindItem).toBeVisible();
    await waitForAnimations(page);
    await remindItem.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText("Wähle, wann du an diese Nachricht erinnert werden"),
    ).toBeVisible();
    // The five presets come from a module-level table that used to hold
    // resolved English strings. If it froze at boot, these read English.
    await expect(dialog.getByText("In 30 Minuten")).toBeVisible();
    await expect(dialog.getByText("In 1 Stunde")).toBeVisible();
    await expect(dialog.getByText("Nächsten Montag um 9 Uhr")).toBeVisible();
    await expect(dialog.getByText("Eigenes Datum & Uhrzeit")).toBeVisible();
    await expect(dialog.getByText("Notiz (optional)")).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Erinnerung setzen" }),
    ).toBeVisible();
    // Negatives: a half-applied catalogue would render both.
    await expect(dialog.getByText("In 30 minutes")).toHaveCount(0);
    await expect(dialog.getByText("Custom date & time")).toHaveCount(0);
    await expect(dialog.getByText("Note (optional)")).toHaveCount(0);
  });

  test("the empty reminders list reads German", async ({ page }) => {
    await seedGerman(page);
    await installMockBridge(page);
    await gotoInboxHome(page);
    await openRemindersFilter(page);

    await expect(page.getByText("Keine Erinnerungen")).toBeVisible();
    await expect(page.getByText("No reminders")).toHaveCount(0);
  });

  test("a reminder row reads German, countdown included", async ({ page }) => {
    await seedGerman(page);
    await installMockBridge(page);
    await gotoInboxHome(page);
    // 2.5 hours out, not exactly 2: the ladder floors the remaining seconds,
    // so a fixture sitting on the boundary drops a rung by the time the page
    // renders and reads "in 1 Std.". Half an hour of slack keeps it on 2.
    await seedReminder(page, {
      dTag: "de-upcoming",
      notBefore: Math.floor(Date.now() / 1000) + 2 * 3600 + 1800,
      note: "Follow up on this message",
    });
    await openRemindersFilter(page);

    const row = page.getByTestId("home-reminder-item-de-upcoming");
    await expect(row).toBeVisible();
    // The countdown now comes from the shared Intl ladder rather than from a
    // private English-suffix concatenation, so German gets the short unit.
    await expect(row.getByText("in 2 Std.")).toBeVisible();
    await expect(row.getByText("in 2h")).toHaveCount(0);
  });

  test("an overdue reminder reads German", async ({ page }) => {
    await seedGerman(page);
    await installMockBridge(page);
    await gotoInboxHome(page);
    // The overdue rungs are the half that is NOT the shared Intl ladder:
    // three hand-written plural messages. Without this case the forward
    // assertion above passes while all three could be missing — which is
    // exactly what a break test on the hour rung's msgstr proved.
    await seedReminder(page, {
      dTag: "de-overdue",
      notBefore: Math.floor(Date.now() / 1000) - (3 * 3600 + 1800),
      note: "This one is late",
    });
    await openRemindersFilter(page);

    const row = page.getByTestId("home-reminder-item-de-overdue");
    await expect(row).toBeVisible();
    await expect(row.getByText("3 Std. überfällig")).toBeVisible();
    await expect(row.getByText("3h overdue")).toHaveCount(0);
  });

  test("the reminder detail pane reads German", async ({ page }) => {
    await seedGerman(page);
    await installMockBridge(page);
    await gotoInboxHome(page);
    await seedReminder(page, {
      dTag: "de-detail",
      notBefore: Math.floor(Date.now() / 1000) + 2 * 3600,
      note: "Follow up on this message",
    });
    await openRemindersFilter(page);
    await page.getByTestId("home-reminder-item-de-detail").click();

    const detail = page.getByTestId("home-reminder-detail");
    await expect(detail).toBeVisible();
    await expect(detail.getByText("Notiz", { exact: true })).toBeVisible();
    await expect(
      detail.getByRole("button", { name: "Nachricht öffnen" }),
    ).toBeVisible();
    await expect(
      detail.getByRole("button", { name: "Erledigen" }),
    ).toBeVisible();
    await expect(detail.getByText("Open message")).toHaveCount(0);

    // The snooze dropdown is only reachable from here, and its presets come
    // from the same module-level table as the dialog's.
    await detail.getByRole("button", { name: "Verschieben" }).click();
    await waitForAnimations(page);
    const menu = page.getByRole("menu");
    await expect(menu.getByText("In 30 Minuten")).toBeVisible();
    await expect(menu.getByText("Eigene Zeit…")).toBeVisible();
    await expect(menu.getByText("Custom…")).toHaveCount(0);
  });
});

test.describe("Pulse under the German catalogue", () => {
  test("the Pulse tab bar and composer read German", async ({ page }) => {
    await seedGerman(page);
    await seedPulseEnabled(page);
    await installMockBridge(page);
    await openPulse(page);

    const tablist = page.getByRole("tablist", { name: "Pulse-Bereiche" });
    await expect(tablist).toBeVisible();
    for (const label of ["Alle", "Folge ich", "Gelikt", "Agenten", "Meine"]) {
      await expect(tablist.getByRole("tab", { name: label })).toBeVisible();
    }
    for (const label of ["Everyone", "Following", "Liked", "Mine"]) {
      await expect(tablist.getByRole("tab", { name: label })).toHaveCount(0);
    }

    // The composer placeholder is painted by CSS from `data-placeholder`
    // (`composer.css`: `content: attr(data-placeholder)`), so it reaches the
    // a11y tree but has no DOM text node — `getByText` cannot see it. Assert
    // the attribute the stylesheet reads.
    await expect(
      page.locator('[data-placeholder="Was beschäftigt dich?"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-placeholder="What\'s on your mind?"]'),
    ).toHaveCount(0);

    // The note card's own controls, on a seeded mock note.
    const note = page.getByRole("article").first();
    await expect(
      note.getByRole("button", { name: "Gefällt mir" }),
    ).toBeVisible();
    await expect(note.getByRole("button", { name: "Antworten" })).toBeVisible();
    await expect(note.getByRole("button", { name: "Teilen" })).toBeVisible();
    await expect(note.getByRole("button", { name: "Like" })).toHaveCount(0);
  });

  test("the Pulse empty states and search read German", async ({ page }) => {
    await seedGerman(page);
    await seedPulseEnabled(page);
    await installMockBridge(page);
    await openPulse(page);

    const tablist = page.getByRole("tablist", { name: "Pulse-Bereiche" });

    // The empty-state table is built in render. A module-level table here
    // would have frozen every one of these in the boot locale.
    await tablist.getByRole("tab", { name: "Folge ich" }).click();
    await expect(
      page.getByText("Noch keine Notizen. Folge Leuten"),
    ).toBeVisible();
    await expect(page.getByText("No notes yet.")).toHaveCount(0);

    await tablist.getByRole("tab", { name: "Gelikt" }).click();
    await expect(page.getByText("Noch nichts gelikt")).toBeVisible();

    // No assertion on the Mine tab's empty state: the mock bridge seeds notes
    // for this identity, so that branch never renders here. It is covered by
    // the Following and Liked states above, which share the same table.

    await tablist.getByRole("tab", { name: "Pulse durchsuchen" }).click();
    await expect(page.getByText("Wonach suchst du?")).toBeVisible();
    await expect(page.getByText("What are you looking for?")).toHaveCount(0);
    await expect(
      page.getByPlaceholder("Was möchtest du wissen?"),
    ).toBeVisible();
    await expect(
      page.getByPlaceholder("What would you like to know?"),
    ).toHaveCount(0);
  });
});
