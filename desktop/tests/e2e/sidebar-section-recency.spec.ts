import { expect, test, type Page } from "@playwright/test";

import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";

const SIDEBAR_ORDER_STORAGE_KEY = "buzz.appearance.sidebarChannelOrder";

/** Device-level Sidebar order; Recent also floats the sections themselves. */
function seedSidebarOrder(page: Page, order: "alpha" | "recent") {
  return page.addInitScript(
    ({ key, order }) => {
      window.localStorage.setItem(key, order);
    },
    { key: SIDEBAR_ORDER_STORAGE_KEY, order },
  );
}

async function sectionId(page: Page, name: string): Promise<string> {
  const title = page
    .locator('[data-testid^="section-title-"]')
    .filter({ hasText: name })
    .first();
  await expect(title).toBeVisible();
  const testId = await title.getAttribute("data-testid");
  return (testId ?? "").replace("section-title-", "");
}

/** Custom section headers, top to bottom. */
function sectionNames(page: Page) {
  return page
    .locator('[data-testid^="section-title-"]')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ""));
}

async function createSectionForChannel(
  page: Page,
  channelTestId: string,
  name: string,
) {
  await page.getByTestId(channelTestId).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move to section" }).hover();
  await page.getByRole("menuitem", { name: "New section..." }).click();
  await page.getByPlaceholder("Section name").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(
    page.locator('[data-testid^="section-title-"]').filter({ hasText: name }),
  ).toHaveCount(1);
}

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

test.describe("sections follow the sidebar order", () => {
  // engineering last spoke 42m ago and general 5m ago, so recency and
  // creation order disagree on purpose.
  async function seedTwoSections(page: Page) {
    await createSectionForChannel(page, "channel-engineering", "Quiet");
    await createSectionForChannel(page, "channel-general", "Loud");
  }

  test("Recent floats the newest section to the top", async ({ page }) => {
    await seedSidebarOrder(page, "recent");
    await installMockBridge(page);
    await page.goto("/");
    await seedTwoSections(page);

    await expect.poll(() => sectionNames(page)).toEqual(["Loud", "Quiet"]);
  });

  test("A–Z hands the dragged order back", async ({ page }) => {
    await seedSidebarOrder(page, "alpha");
    await installMockBridge(page);
    await page.goto("/");
    await seedTwoSections(page);

    // Creation order, not recency and not the alphabet: a section's own
    // position stays the one the user set.
    await expect.poll(() => sectionNames(page)).toEqual(["Quiet", "Loud"]);
  });

  test("Move up/down is withdrawn while Recent orders the sections", async ({
    page,
  }) => {
    // Recent is the shipped default, so no seed here: an addInitScript seed
    // would be rewritten on the reload below.
    await installMockBridge(page);
    await page.goto("/");
    await createSectionForChannel(page, "channel-engineering", "Quiet");
    const quietId = await sectionId(page, "Quiet");

    await page.getByTestId(`section-actions-${quietId}`).click();
    await expect(
      page.getByRole("menuitem", { name: "Rename section" }),
    ).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Move up" })).toHaveCount(
      0,
    );
    await expect(page.getByRole("menuitem", { name: "Move down" })).toHaveCount(
      0,
    );
    await page.keyboard.press("Escape");

    // The same menu under A–Z still offers them, so the assertion above is
    // about the preference and not about the menu never having the items.
    await page.evaluate((key) => {
      window.localStorage.setItem(key, "alpha");
    }, SIDEBAR_ORDER_STORAGE_KEY);
    await page.reload();
    const quietIdAfter = await sectionId(page, "Quiet");
    await page.getByTestId(`section-actions-${quietIdAfter}`).click();
    await expect(page.getByRole("menuitem", { name: "Move up" })).toBeVisible();
  });

  test("the section header counts unread threads, not messages", async ({
    page,
  }) => {
    await installMockBridge(page);
    await page.goto("/");
    await createSectionForChannel(page, "channel-engineering", "Work");
    const workId = await sectionId(page, "Work");
    const badge = page.getByTestId(`section-unread-threads-${workId}`);

    // No unread yet: the badge is absent rather than showing a zero.
    await page.getByTestId("channel-engineering").click();
    await expect(page.getByTestId("chat-title")).toHaveText("engineering");
    await waitForMockLiveSubscription(page, "engineering");
    await expect(badge).toHaveCount(0);

    // Read somewhere else, then take three messages in two threads.
    await page.getByTestId("channel-general").click();
    await expect(page.getByTestId("chat-title")).toHaveText("general");
    await waitForMockLiveSubscription(page, "engineering");

    const rootId = "a1".repeat(32);
    await page.evaluate(
      ({ rootId, pubkey }) => {
        const emit = window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__;
        if (!emit) throw new Error("Mock message emitter is not installed");
        emit({
          channelName: "engineering",
          content: "first thread",
          id: rootId,
          pubkey,
        });
        emit({
          channelName: "engineering",
          content: "reply in the first thread",
          parentEventId: rootId,
          pubkey,
        });
        emit({
          channelName: "engineering",
          content: "second thread",
          pubkey,
        });
      },
      { rootId, pubkey: TEST_IDENTITIES.alice.pubkey },
    );

    // Bold proves the channel itself reads as unread, so a missing badge below
    // would be the rollup and not the fixture.
    await expect(page.getByTestId("channel-engineering")).toHaveCSS(
      "font-weight",
      "700",
    );
    await expect(badge).toHaveText(/^2/);
  });
});
