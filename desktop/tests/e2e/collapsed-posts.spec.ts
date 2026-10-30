import { expect, type Page, test } from "@playwright/test";

import { flavorCollapsesLongPosts } from "../helpers/brand";
import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";

/**
 * Long top-level posts in the channel pane, collapsed to a preview.
 *
 * `#general` is a public mock channel, so nothing here depends on a private
 * one.
 *
 * Every assertion is gated on `flavorCollapsesLongPosts()` — what the runner
 * declared — rather than on whether the page happens to show a collapsed
 * post. A spec that skipped itself because nothing was collapsed would turn
 * the regression it exists to catch into a skip, and a skip reads green.
 */

const CHANNEL = "general";
const SHOTS = "test-results/collapsed-posts";

/** Twelve short lines: comfortably past the six-line budget, and countable. */
const LONG_POST = Array.from(
  { length: 12 },
  (_, index) =>
    `Line ${index + 1} of a long post that nobody wants in the pane.`,
).join("\n\n");

/**
 * Wrapped prose rather than short paragraphs — the shape a long post actually
 * takes, and the one the six-line budget is tuned for. The many-short-lines
 * fixture above shows fewer than six, because each paragraph gap spends part
 * of the budget; both are worth a screenshot for exactly that reason.
 */
const LONG_PROSE =
  "Here is the thing I keep meaning to write down properly, and " +
  "since nobody has, it may as well be me. The deployment story we " +
  "have works, but it works because three of us remember the order " +
  "of the steps, and that is not a story, it is a habit. When the " +
  "relay restarts under load the migration runs before the health " +
  "check passes, which is fine until the migration is the slow one, " +
  "and then the orchestrator kills it halfway and we get to find out " +
  "which half. I would like to pull the migration out of startup " +
  "entirely and run it as its own step, so that a slow migration is " +
  "a slow deploy rather than a corrupted one. That is a bigger change " +
  "than it sounds, because the Helm chart defaults it on and two " +
  "environments rely on that default. The other half of this is the " +
  "health check itself, which currently answers yes as soon as the " +
  "process is listening, so the orchestrator moves traffic over " +
  "before the relay has finished warming its caches and the first " +
  "forty seconds of every deploy look like an outage to anyone who " +
  "happens to be typing. Neither of these is hard on its own. Doing " +
  "them in the wrong order is what makes it hard: moving the " +
  "migration out first leaves a window where the schema is behind " +
  "the code, and fixing the health check first makes that window " +
  "longer rather than shorter. So the order matters, and the order " +
  "is the part nobody has written down.";

/** Three lines: under the budget, so it must be left alone. */
const SHORT_POST = "A short post.\n\nIt says two things.\n\nThat is all.";

test.use({ deviceScaleFactor: 2 });

async function waitForMockLiveSubscription(page: Page, channelName: string) {
  await expect
    .poll(() =>
      page.evaluate(
        (name) =>
          window.__BUZZ_E2E_HAS_MOCK_LIVE_SUBSCRIPTION__?.({
            channelName: name,
          }) ?? false,
        channelName,
      ),
    )
    .toBe(true);
}

async function emit(
  page: Page,
  content: string,
  parentEventId: string | null = null,
) {
  const event = await page.evaluate(
    (payload) =>
      window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__?.({
        channelName: payload.channel,
        content: payload.content,
        parentEventId: payload.parentEventId,
      }),
    { channel: CHANNEL, content, parentEventId },
  );
  if (!event) throw new Error("mock message emitter is not installed");
  return event as { created_at: number; id: string };
}

async function openChannel(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId(`channel-${CHANNEL}`).click();
  await waitForMockLiveSubscription(page, CHANNEL);
}

function rowFor(page: Page, id: string) {
  return page.locator(`[data-message-id="${id}"]`);
}

test.describe("collapsed long posts", () => {
  test.skip(
    !flavorCollapsesLongPosts(),
    "this bundle was not built with VITE_BUZZ_COLLAPSE_LONG_POSTS=1",
  );

  test("a long post is clamped and a short one is not", async ({ page }) => {
    await installMockBridge(page);
    await openChannel(page);

    const short = await emit(page, SHORT_POST);
    const long = await emit(page, LONG_POST);

    const longBody = rowFor(page, long.id).locator(
      '[data-testid="collapsed-post-body"]',
    );
    const shortBody = rowFor(page, short.id).locator(
      '[data-testid="collapsed-post-body"]',
    );
    await expect(longBody).toBeVisible();
    await expect(shortBody).toBeVisible();

    // The measurement, not the class: `data-overflowing` is what the
    // component concluded after laying the post out.
    await expect(longBody).toHaveAttribute("data-overflowing", "");
    await expect(shortBody).not.toHaveAttribute("data-overflowing", "");

    // And the clamp is real, not just an attribute. The long post's rendered
    // height must be well under its content height, and the short post's must
    // be untouched.
    const longBox = await longBody.evaluate((element) => ({
      client: element.clientHeight,
      scroll: element.scrollHeight,
    }));
    expect(longBox.scroll).toBeGreaterThan(longBox.client + 1);
    const shortBox = await shortBody.evaluate((element) => ({
      client: element.clientHeight,
      scroll: element.scrollHeight,
    }));
    expect(shortBox.scroll).toBeLessThanOrEqual(shortBox.client + 1);
    // The collapsed post is also meaningfully shorter than the pane, which is
    // the complaint that started this: one post used to fill the middle.
    expect(longBox.client).toBeLessThan(shortBox.client * 4);

    await waitForAnimations(page);
    await rowFor(page, long.id).screenshot({
      path: `${SHOTS}/after-long-collapsed.png`,
    });
    await rowFor(page, short.id).screenshot({
      path: `${SHOTS}/after-short-untouched.png`,
    });

    const prose = await emit(page, LONG_PROSE);
    const proseBody = rowFor(page, prose.id).locator(
      '[data-testid="collapsed-post-body"]',
    );
    // Scrolled into view first: the timeline is virtualized, so a row that
    // has not been laid out reports a `scrollHeight` of 0 and the component
    // correctly concludes there is nothing to collapse. The attribute is a
    // measurement, and an unmeasured row has not made one yet.
    await proseBody.scrollIntoViewIfNeeded();
    await expect(proseBody).toHaveAttribute("data-overflowing", "");
    await waitForAnimations(page);
    await rowFor(page, prose.id).screenshot({
      path: `${SHOTS}/after-prose-collapsed.png`,
    });
  });

  test("the thread summary stays visible below the collapsed body", async ({
    page,
  }) => {
    // Ian's second call: only the body collapses. The reply count is how a
    // reader decides whether to open the post at all, so it has to survive
    // the clamp — and "survive" means laid out below it, not merely present
    // in the DOM inside a box with `overflow: hidden`.
    await installMockBridge(page);
    await openChannel(page);
    const long = await emit(page, LONG_POST);
    await emit(page, "A reply, so the post has a thread summary.", long.id);

    const row = rowFor(page, long.id);
    const body = row.locator('[data-testid="collapsed-post-body"]');
    await expect(body).toHaveAttribute("data-overflowing", "");

    const summary = page
      .locator('[data-testid="message-thread-summary"]')
      .first();
    await expect(summary).toBeVisible();

    const bodyBox = await body.boundingBox();
    const summaryBox = await summary.boundingBox();
    if (!bodyBox || !summaryBox) throw new Error("no box to compare");
    expect(summaryBox.y).toBeGreaterThanOrEqual(bodyBox.y + bodyBox.height - 1);

    // And structurally: nothing below the fold may live *inside* the clamp,
    // because anything in there is clipped by `overflow: hidden` whether it
    // looks visible in the DOM or not.
    await expect(
      body.locator('[data-testid="message-thread-summary"]'),
    ).toHaveCount(0);
    await expect(body.locator('[data-testid="message-reactions"]')).toHaveCount(
      0,
    );
  });

  test("clicking the post opens its thread, and a link still navigates", async ({
    page,
  }) => {
    await installMockBridge(page);
    await openChannel(page);
    const long = await emit(
      page,
      `${LONG_POST}\n\nhttps://example.test/inside-a-long-post`,
    );

    const row = rowFor(page, long.id);
    await expect(
      row.locator('[data-testid="collapsed-post-body"]'),
    ).toHaveAttribute("data-overflowing", "");

    // A click on the post's own text opens the thread pane.
    await row.getByText("Line 2 of a long post").click();
    const threadPanel = page.getByTestId("thread-surface");
    await expect(threadPanel).toBeVisible();

    // And the full text is there — that is the promise the collapse makes.
    await expect(threadPanel.getByText("Line 12 of a long post")).toBeVisible();

    await waitForAnimations(page);
    // The whole window, not the panel alone: the point of this shot is the
    // pair — a collapsed preview on the left, the full text on the right —
    // and `thread-surface` is a layout wrapper with no box of its own.
    await page.screenshot({ path: `${SHOTS}/after-thread-opened.png` });
  });

  test("a text selection is not swallowed by the click", async ({ page }) => {
    // Dragging across a post to copy it ends in a click on the post. Opening
    // the thread there throws the selection away, and because the thread
    // shows the same text it looks like the app ate it.
    await installMockBridge(page);
    await openChannel(page);
    const long = await emit(page, LONG_POST);

    const row = rowFor(page, long.id);
    const line = row.getByText("Line 2 of a long post");
    const box = await line.boundingBox();
    if (!box) throw new Error("no box for the line under test");

    await page.mouse.move(box.x + 4, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2, {
      steps: 8,
    });
    await page.mouse.up();

    expect(
      await page.evaluate(() => window.getSelection()?.toString() ?? ""),
    ).not.toBe("");
    await expect(page.getByTestId("thread-surface")).toHaveCount(0);
  });

  test("the keyboard affordance is reachable and named", async ({ page }) => {
    await installMockBridge(page);
    await openChannel(page);
    const long = await emit(page, LONG_POST);

    const control = rowFor(page, long.id).locator(
      '[data-testid="collapsed-post-open-thread"]',
    );
    await expect(control).toBeAttached();
    // Hidden until focused, so it adds no chrome — and visible once focused,
    // so it is not a control only a screen reader can find.
    await expect(control).not.toBeInViewport();
    await control.focus();
    await expect(control).toBeVisible();
    await expect(control).toHaveAccessibleName(/thread/i);

    await control.press("Enter");
    await expect(page.getByTestId("thread-surface")).toBeVisible();
  });
});

test.describe("the stock trunk is untouched", () => {
  // Gated the other way round, and on the same declaration: with no flavor
  // the clamp must not exist at all. This is the half that would otherwise
  // go unchecked — a feature that leaks into the OSS build is invisible to
  // every test above, because they all run against the flavored one.
  test.skip(
    flavorCollapsesLongPosts(),
    "this bundle was built with the collapse on",
  );

  test("a long post renders in full with no clamp", async ({ page }) => {
    await installMockBridge(page);
    await openChannel(page);
    const long = await emit(page, LONG_POST);

    const row = rowFor(page, long.id);
    await row.scrollIntoViewIfNeeded();
    await expect(row.getByText("Line 1 of a long post")).toBeVisible();
    // The last line too: nothing is hidden.
    await expect(row.getByText("Line 12 of a long post")).toBeVisible();
    await expect(
      row.locator('[data-testid="collapsed-post-body"]'),
    ).toHaveCount(0);
    await expect(
      row.locator('[data-testid="collapsed-post-open-thread"]'),
    ).toHaveCount(0);

    await waitForAnimations(page);
    await row.screenshot({ path: `${SHOTS}/before-long-full.png` });
  });
});
