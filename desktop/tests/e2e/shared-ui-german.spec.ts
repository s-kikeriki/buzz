import { expect, type Page, test } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";

/**
 * `src/shared/ui`, rendered in German.
 *
 * This area earns the third gate more than any other so far, for two reasons.
 *
 * Almost all of its copy is an `aria-label`, a `title` or an `sr-only` span on
 * an icon-only control — the one shape both other gates read as clean whichever
 * language it is in. And the renderer it lives in is memoized: `Markdown` is
 * wrapped in `React.memo`, so a label resolved through the *global* `t` macro
 * rather than `useLingui()` keeps the previous locale after a switch while the
 * rest of the screen changes. Only a render can tell those apart.
 *
 * Every German test has an English counterpart at the bottom asserting the same
 * phrases are absent under `en`. Without it a string resolved once at module
 * load passes the German half for the wrong reason: because German was the boot
 * locale, not because the component resolves per render.
 */

const LOCALE_STORAGE_KEY = "buzz.appearance.locale";
const IMAGE_SHA = "a".repeat(64);
const IMAGE_URL = "https://example.com/e2e/shared-ui-german.png";

/**
 * Seeded before the bridge: `AppI18nProvider` reads the preference on mount and
 * the bridge is what triggers mount. Seeding afterwards activates English first
 * and then swaps, which hides a module-scope resolution bug.
 */
async function openChannelIn(page: Page, locale: "en" | "de") {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: LOCALE_STORAGE_KEY, value: locale },
  );
  await page.route(IMAGE_URL, (route) => {
    route.fulfill({
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160" viewBox="0 0 240 160"><rect width="100%" height="100%" fill="#4aa3df"/></svg>',
      contentType: "image/svg+xml",
    });
  });
  await installMockBridge(page);
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("channel-general").click();
  await expect(page.getByTestId("chat-title")).toHaveText("general");
  await expect
    .poll(() =>
      page.evaluate(
        () => typeof window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__ === "function",
      ),
    )
    .toBe(true);
  await waitForAnimations(page);
}

async function emitMessage(
  page: Page,
  content: string,
  id: string,
  extraTags?: string[][],
) {
  const eventId = await page.evaluate(
    ({ content, id, tags }) => {
      const emit = window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__;
      if (!emit) throw new Error("Mock message emitter is unavailable.");
      return emit({ channelName: "general", content, id, extraTags: tags })?.id;
    },
    { content, id, tags: extraTags },
  );
  if (!eventId) throw new Error("Expected a mock message event id");
  return eventId;
}

function imageImetaTag() {
  return [
    "imeta",
    `url ${IMAGE_URL}`,
    "m image/png",
    `x ${IMAGE_SHA}`,
    "size 1234",
    "dim 240x160",
    "filename shared-ui-german.png",
  ];
}

/** The markdown body that exercises the chrome this tranche converted. */
const MARKDOWN_BODY = [
  "```ts",
  "const x = 1;",
  "```",
  "",
  "- [x] fertig",
  "- [ ] offen",
  "",
  "||geheim||",
  "",
  "siehe #general",
].join("\n");

/**
 * Accessible names, paired German/English.
 *
 * Paired on one line rather than kept in two independent lists: these are
 * matched as substrings, and keeping each pair together is what makes the
 * absence half of the assertion meaningful.
 */
const LABELS = {
  markdown: [
    ["Codeblock kopieren", "Copy code block"],
    ["Spoiler anzeigen", "Reveal spoiler"],
    ["Erledigte Aufgabe", "Completed task"],
    ["Offene Aufgabe", "Incomplete task"],
    ["Kanal general öffnen", "Open channel general"],
  ],
  lightbox: [
    ["Bild herunterladen", "Download image"],
    ["Verkleinern", "Zoom out"],
    ["Vergrößern", "Zoom in"],
    ["Bildzoom", "Image zoom"],
  ],
} as const;

/**
 * Asserts the locale's own name is reachable in `scope` and the other is not.
 *
 * The absent half is anchored because the two languages share prefixes — an
 * unanchored "Zoom out" would also match nothing here, but an unanchored
 * "Zoom image" happily matches "Zoom image: …" and the pair stops being a
 * control. Anchoring keeps the negative honest.
 */
async function expectNames(
  scope: Page | ReturnType<Page["getByTestId"]>,
  pairs: ReadonlyArray<readonly [string, string]>,
  locale: "de" | "en",
) {
  for (const [german, english] of pairs) {
    const present = locale === "de" ? german : english;
    const absent = locale === "de" ? english : german;
    await expect(
      scope.getByLabel(new RegExp(`^${present}$`)).first(),
    ).toBeAttached();
    await expect(scope.getByLabel(new RegExp(`^${absent}$`))).toHaveCount(0);
  }
}

test("the markdown renderer's icon-only chrome reads German", async ({
  page,
}) => {
  await openChannelIn(page, "de");
  await emitMessage(page, MARKDOWN_BODY, "b".repeat(64));

  const row = page
    .locator('[data-testid="message-row"]')
    .filter({ hasText: "geheim" })
    .first();
  await expect(row).toBeVisible();

  // Every one of these is an `aria-label` on a control with no visible text, in
  // a component inside the memoized `Markdown` subtree. The channel deep-link
  // chip is in the list on purpose: its label is the one that moved from the
  // module-level `t` macro to `useLingui()` in this change.
  await expectNames(row, LABELS.markdown, "de");

  // The code block's tooltip is a separate string from its button's label, and
  // only one of the two is visible text.
  await row.getByLabel(/^Codeblock kopieren$/).hover();
  await expect(page.getByRole("tooltip")).toContainText("Code kopieren");
});

test("the image lightbox and its controls read German", async ({ page }) => {
  await openChannelIn(page, "de");
  await emitMessage(page, `![](${IMAGE_URL})`, "c".repeat(64), [
    imageImetaTag(),
  ]);

  const trigger = page.getByTestId("message-image-lightbox-trigger").first();
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-label", "Bild zoomen");

  await trigger.click();
  const overlay = page.locator("[data-image-lightbox-frame]");
  await expect(overlay).toBeVisible();
  await waitForAnimations(page);

  // The overlay's own description is an `sr-only` paragraph — reachable by a
  // screen reader and by nothing else, including a screenshot. Its id is a
  // `useId()`, so it is located through the dialog's `aria-describedby` rather
  // than by a literal id.
  const describedBy = await page
    .getByRole("dialog")
    .last()
    .getAttribute("aria-describedby");
  expect(describedBy).toBeTruthy();
  await expect(page.locator(`#${describedBy}`)).toHaveText(
    /Bild in voller Größe\./,
  );
  await expectNames(page, LABELS.lightbox, "de");
  await expect(page.getByLabel(/^Bildsteuerung$/)).toBeVisible();
});

test("the modal close button reads German", async ({ page }) => {
  await openChannelIn(page, "de");

  // `dialog.tsx` owns this button for every modal in the app, which is why a
  // German Settings panel still had an English "Close" on it until this
  // change. Asserting it on one dialog asserts it on all of them.
  await page.getByTestId("channel-management-trigger").click();
  await expect(page.getByTestId("channel-management-sheet")).toBeVisible();
  await page.getByTestId("channel-management-edit").click();
  const dialog = page.getByRole("dialog").last();
  await expect(dialog).toBeVisible();
  await waitForAnimations(page);

  await expect(
    dialog.getByRole("button", { name: /^Schließen$/ }),
  ).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: /^Close$/ })).toHaveCount(0);
});

test("the sidebar resize rail reads German", async ({ page }) => {
  await openChannelIn(page, "de");

  // `sidebar.tsx` is a vendored primitive, so its two strings had never been
  // touched by a sweep. Both are on the same element and neither is visible
  // text: one is the accessible name, the other the hover title.
  const rail = page.locator('[data-sidebar="rail"]');
  await expect(rail).toHaveAttribute(
    "aria-label",
    "Breite der Seitenleiste ändern",
  );
  await expect(rail).toHaveAttribute(
    "title",
    "Ziehen, um die Breite der Seitenleiste zu ändern",
  );
});

test("the same surfaces still read English under en", async ({ page }) => {
  await openChannelIn(page, "en");
  await emitMessage(page, MARKDOWN_BODY, "d".repeat(64));

  const row = page
    .locator('[data-testid="message-row"]')
    .filter({ hasText: "geheim" })
    .first();
  await expect(row).toBeVisible();
  await expectNames(row, LABELS.markdown, "en");

  const rail = page.locator('[data-sidebar="rail"]');
  await expect(rail).toHaveAttribute("aria-label", "Resize sidebar");

  await page.getByTestId("channel-management-trigger").click();
  await page.getByTestId("channel-management-edit").click();
  const dialog = page.getByRole("dialog").last();
  await expect(dialog).toBeVisible();
  await waitForAnimations(page);
  await expect(dialog.getByRole("button", { name: /^Close$/ })).toHaveCount(1);
  await expect(
    dialog.getByRole("button", { name: /^Schließen$/ }),
  ).toHaveCount(0);
});
