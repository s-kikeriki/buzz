import { expect, test } from "@playwright/test";

import { installMockBridge } from "../helpers/bridge";

const MOCK_PUBKEY = "deadbeef".repeat(8);
const ENGINEERING_CHANNEL_ID = "1c7e1c02-87bb-5e88-b2da-5a7a9432d0c9";
const PIN_STORAGE_KEY = `buzz-channel-stars.v1:${MOCK_PUBKEY}`;

const SCROLL_CONTAINER = '[data-sidebar="content"]';

function seedPinnedChannel(
  page: import("@playwright/test").Page,
  channelId: string,
) {
  return page.addInitScript(
    ({ key, id }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          channels: { [id]: { starred: true, updatedAt: 1700000000 } },
        }),
      );
    },
    { key: PIN_STORAGE_KEY, id: channelId },
  );
}

test.describe("sidebar pinned rail", () => {
  // A short viewport guarantees the channel list below the rail overflows, so
  // "did not move" is a real assertion rather than a vacuous one.
  test.use({ viewport: { width: 1280, height: 400 } });

  test("01 — pinned destinations hold position while the list scrolls", async ({
    page,
  }) => {
    await seedPinnedChannel(page, ENGINEERING_CHANNEL_ID);
    await installMockBridge(page);
    await page.goto("/");

    const primaryMenu = page.getByTestId("sidebar-primary-menu");
    const pinnedChannel = page.getByTestId("channel-engineering");
    await expect(primaryMenu).toBeVisible();
    await expect(pinnedChannel).toBeVisible();

    const scroller = page.locator(SCROLL_CONTAINER);
    // Positive control: without real overflow the test could pass on a sidebar
    // that scrolls nothing at all.
    const overflow = await scroller.evaluate(
      (el) => el.scrollHeight - el.clientHeight,
    );
    expect(overflow).toBeGreaterThan(0);

    const menuBefore = await primaryMenu.boundingBox();
    const pinnedBefore = await pinnedChannel.boundingBox();

    await scroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect
      .poll(() => scroller.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);

    await expect(primaryMenu).toBeVisible();
    await expect(pinnedChannel).toBeVisible();
    expect(await primaryMenu.boundingBox()).toEqual(menuBefore);
    expect(await pinnedChannel.boundingBox()).toEqual(pinnedBefore);
  });

  test("02 — the rail is not inside the scrolling container", async ({
    page,
  }) => {
    await seedPinnedChannel(page, ENGINEERING_CHANNEL_ID);
    await installMockBridge(page);
    await page.goto("/");

    await expect(page.getByTestId("sidebar-pinned-rail")).toBeVisible();
    const railIsNested = await page
      .getByTestId("sidebar-pinned-rail")
      .evaluate(
        (el, selector) => Boolean(el.closest(selector)),
        SCROLL_CONTAINER,
      );
    expect(railIsNested).toBe(false);
  });

  test("03 — a pinned channel is not counted as offscreen unread", async ({
    page,
  }) => {
    await seedPinnedChannel(page, ENGINEERING_CHANNEL_ID);
    await installMockBridge(page);
    await page.goto("/");

    await expect(page.getByTestId("channel-engineering")).toBeVisible();
    // The overflow counter only reads [data-channel-id] inside the scroll
    // root, so a pinned channel must not appear there a second time.
    const insideScroller = await page
      .locator(`${SCROLL_CONTAINER} [data-channel-id]`)
      .evaluateAll(
        (nodes, id) =>
          nodes.filter((n) => n.getAttribute("data-channel-id") === id).length,
        ENGINEERING_CHANNEL_ID,
      );
    expect(insideScroller).toBe(0);
  });
});
