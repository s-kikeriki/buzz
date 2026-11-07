import { expect, type Page, test } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";

/**
 * The forum surface — post list, thread panel, composer chrome and the delete
 * confirmation — rendered in German.
 *
 * Three gates already pass on this code and none of them can see what this one
 * does: `check:i18n` proves every extracted id has a German translation, the
 * coverage ratchet proves no listed file holds a literal, and the unit suite
 * asserts English because the test loader activates `en`.
 *
 * The delete confirmation is the reason this spec exists. It used to take the
 * noun as a `label: string` and interpolate it ("Delete {label}", "This will
 * permanently delete this {label}..."). That reads fine in English and cannot
 * be translated into German, where the article inflects with the noun's
 * gender. The fix replaced the hole with a `kind` discriminator — so the only
 * thing that can prove the fix is asserting both branches render their own
 * sentence. A spec that checked the post branch alone would pass against a
 * component hardcoded to "Beitrag".
 *
 * Every German assertion is paired with a negative on the English source. A
 * module-scope resolution passes the German half for the wrong reason — it
 * reads German because German booted, not because the component resolves per
 * render — and only the English control separates those two.
 */

const LOCALE_STORAGE_KEY = "buzz.appearance.locale";
const FORUM_CHANNEL = "watercooler";

type EmitInput = {
  channelName: string;
  content: string;
  kind?: number;
  id?: string;
  parentEventId?: string | null;
  extraTags?: string[][];
};

declare global {
  interface Window {
    __BUZZ_E2E_HAS_MOCK_LIVE_SUBSCRIPTION__?: (input: {
      channelName: string;
    }) => boolean;
  }
}

async function waitForMockLiveSubscription(page: Page, channelName: string) {
  await expect
    .poll(() =>
      page.evaluate(
        ({ ch }) =>
          window.__BUZZ_E2E_HAS_MOCK_LIVE_SUBSCRIPTION__?.({
            channelName: ch,
          }) ?? false,
        { ch: channelName },
      ),
    )
    .toBe(true);
}

/**
 * Seeded before the bridge: `AppI18nProvider` reads the preference on mount
 * and the bridge is what triggers mount. Seeding afterwards activates English
 * first and then swaps, which is exactly what hides a module-scope resolution.
 */
async function openForumIn(page: Page, locale: "en" | "de") {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: LOCALE_STORAGE_KEY, value: locale },
  );
  await installMockBridge(page);
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId(`channel-${FORUM_CHANNEL}`).click();
  await expect(page.getByTestId("chat-title")).toHaveText(FORUM_CHANNEL);
  await waitForMockLiveSubscription(page, FORUM_CHANNEL);
  await waitForAnimations(page);
}

/**
 * Emits a forum event authored by the active identity.
 *
 * The author is left to default on purpose: `canDelete` compares the post's
 * pubkey against the viewer's, so a post signed by anyone else renders no
 * delete menu at all and every assertion below would pass against nothing.
 */
async function emit(page: Page, input: EmitInput) {
  return page.evaluate((args) => {
    const send = window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__;
    if (!send) throw new Error("Mock message emitter is unavailable.");
    return send(args).id;
  }, input);
}

/** A 64-hex id, required for these to be valid thread targets. */
const POST_ID = "c".repeat(64);
const REPLY_ID = "d".repeat(64);

async function seedPost(page: Page, content: string) {
  return emit(page, {
    channelName: FORUM_CHANNEL,
    content,
    kind: 45001,
    id: POST_ID,
  });
}

async function seedReply(page: Page, postId: string, content: string) {
  return emit(page, {
    channelName: FORUM_CHANNEL,
    content,
    kind: 45003,
    id: REPLY_ID,
    parentEventId: postId,
    extraTags: [["e", postId, "", "root"]],
  });
}

/** Opens the hover delete menu on a row and returns the open menu. */
async function openDeleteMenu(page: Page, content: string) {
  const row = page.locator("div.group").filter({ hasText: content }).last();
  await expect(row).toBeVisible();
  await row.hover();
  await row.getByRole("button").last().click({ force: true });
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await waitForAnimations(page);
  return menu;
}

test("the forum post list and its empty state read German", async ({
  page,
}) => {
  await openForumIn(page, "de");

  const composerTrigger = page.getByRole("button", {
    name: "Neuen Beitrag schreiben...",
  });
  await expect(composerTrigger).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start a new post..." }),
  ).toHaveCount(0);

  // The composer's own chrome: both buttons were English literals.
  await composerTrigger.click();
  await waitForAnimations(page);
  const composer = page
    .locator("form")
    .filter({ has: page.locator(".tiptap") });
  await expect(composer).toContainText("Abbrechen");
  await expect(composer).not.toContainText("Cancel");
});

test("the thread panel reads German with no replies yet", async ({ page }) => {
  await openForumIn(page, "de");
  await seedPost(page, "Ein deutscher Beitrag");

  await page.getByText("Ein deutscher Beitrag").click();
  await waitForAnimations(page);

  await expect(
    page.getByRole("button", { name: "Zurück zu den Beiträgen" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to posts" })).toHaveCount(
    0,
  );

  // Zero replies: the empty state, and the plural's `other` arm at n=0.
  await expect(
    page.getByText("Noch keine Antworten. Schreib die erste."),
  ).toBeVisible();
  await expect(
    page.getByText("No replies yet. Be the first to respond."),
  ).toHaveCount(0);
  await expect(page.getByText("0 Antworten")).toBeVisible();

  // The reply composer's placeholder is a `t` call, not a <Trans>. It is
  // painted by CSS from `data-placeholder` (`composer.css`:
  // `content: attr(data-placeholder)`), so it is an attribute, not text.
  await expect(
    page.locator('[data-placeholder="Auf diesen Beitrag antworten..."]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-placeholder="Reply to this post..."]'),
  ).toHaveCount(0);
});

/**
 * The plural's `one` arm. Seeded before the thread is opened on purpose: a
 * reply emitted into an already-resolved thread lands in the mock store but
 * does not invalidate `useForumThreadQuery`, so the panel keeps rendering the
 * count it first loaded and the assertion would be testing the fixture.
 *
 * This is the msgid the chat timeline already ships a German translation for,
 * so a pass also proves the forum's call sites extract to that shared entry
 * rather than minting a new untranslated one.
 */
test("the reply count plural reads German", async ({ page }) => {
  await openForumIn(page, "de");
  const postId = await seedPost(page, "Beitrag mit Antwort");
  await seedReply(page, postId, "Eine deutsche Antwort");

  await page.getByText("Beitrag mit Antwort").click();
  await waitForAnimations(page);

  await expect(page.getByText("1 Antwort", { exact: true })).toBeVisible();
  await expect(page.getByText("1 reply")).toHaveCount(0);
});

test("the delete confirmation names the post and the reply differently", async ({
  page,
}) => {
  await openForumIn(page, "de");
  const postId = await seedPost(page, "Zu löschender Beitrag");
  await seedReply(page, postId, "Zu löschende Antwort");
  await page.getByText("Zu löschender Beitrag").click();
  await waitForAnimations(page);
  await expect(page.getByText("Zu löschende Antwort")).toBeVisible();

  // The reply branch. Asserted first and with a negative on the post noun:
  // a component that ignored `kind` and hardcoded the post sentence would
  // pass the post half of this spec and fail only here.
  const replyMenu = await openDeleteMenu(page, "Zu löschende Antwort");
  await expect(replyMenu).toContainText("Antwort löschen");
  await expect(replyMenu).not.toContainText("Delete reply");
  await replyMenu.getByText("Antwort löschen").click();
  const replyDialog = page.getByRole("alertdialog");
  await expect(replyDialog).toBeVisible();
  await waitForAnimations(page);
  await expect(replyDialog).toContainText(
    "Diese Antwort wird dauerhaft gelöscht und kann nicht wiederhergestellt werden.",
  );
  await expect(replyDialog).not.toContainText("Dieser Beitrag");
  await expect(replyDialog).not.toContainText("cannot be undone");
  await expect(replyDialog).toContainText("Abbrechen");
  await replyDialog.getByRole("button", { name: "Abbrechen" }).click();
  await expect(replyDialog).toHaveCount(0);

  // The post branch, with the mirrored negative.
  const postMenu = await openDeleteMenu(page, "Zu löschender Beitrag");
  await expect(postMenu).toContainText("Beitrag löschen");
  await expect(postMenu).not.toContainText("Delete post");
  await postMenu.getByText("Beitrag löschen").click();
  const postDialog = page.getByRole("alertdialog");
  await expect(postDialog).toBeVisible();
  await waitForAnimations(page);
  await expect(postDialog).toContainText(
    "Dieser Beitrag wird dauerhaft gelöscht und kann nicht wiederhergestellt werden.",
  );
  await expect(postDialog).not.toContainText("Diese Antwort");
});

test("the forum surface still reads English when the locale is en", async ({
  page,
}) => {
  await openForumIn(page, "en");
  const postId = await seedPost(page, "An English post");
  await seedReply(page, postId, "An English reply");

  await expect(
    page.getByRole("button", { name: "Start a new post..." }),
  ).toBeVisible();

  await page.getByText("An English post").click();
  await waitForAnimations(page);
  await expect(
    page.getByRole("button", { name: "Back to posts" }),
  ).toBeVisible();
  await expect(page.getByText("1 reply", { exact: true })).toBeVisible();

  const replyMenu = await openDeleteMenu(page, "An English reply");
  await expect(replyMenu).toContainText("Delete reply");
  await expect(replyMenu).not.toContainText("Delete post");
});
