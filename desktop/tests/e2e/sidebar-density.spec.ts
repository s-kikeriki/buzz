import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";

const SHOTS = "test-results/sidebar-density";
const SIDEBAR_DENSITY_STORAGE_KEY = "buzz.appearance.sidebarDensity";

function seedSidebarDensity(page: Page, density: "compact" | "comfortable") {
  return page.addInitScript(
    ({ key, density }) => {
      window.localStorage.setItem(key, density);
    },
    { key: SIDEBAR_DENSITY_STORAGE_KEY, density },
  );
}

async function openApp(page: Page) {
  await page.goto("/");
  await page.getByTestId("channel-general").click();
  await expect(page.getByTestId("chat-title")).toHaveText("general");
}

/** Distance between the tops of the first two rows: height plus the gap. */
async function streamRowPitch(page: Page): Promise<number> {
  return page.getByTestId("stream-list").evaluate((list) => {
    const rows = list.querySelectorAll("li");
    const first = rows[0]?.getBoundingClientRect();
    const second = rows[1]?.getBoundingClientRect();
    if (!first || !second) throw new Error("Need two sidebar rows to measure");
    return second.top - first.top;
  });
}

test.describe("sidebar density", () => {
  test("01 — comfortable keeps the stock sidebar rhythm", async ({ page }) => {
    await seedSidebarDensity(page, "comfortable");
    await installMockBridge(page);
    await openApp(page);

    // 32px row + 4px gap.
    expect(await streamRowPitch(page)).toBeCloseTo(36, 0);
    await waitForAnimations(page);
    await page
      .getByTestId("app-sidebar")
      .screenshot({ path: `${SHOTS}/01-comfortable.png` });
  });

  test("02 — compact tightens rows, gaps and section headers", async ({
    page,
  }) => {
    await seedSidebarDensity(page, "compact");
    await installMockBridge(page);
    await openApp(page);

    // 28px row, no gap.
    expect(await streamRowPitch(page)).toBeCloseTo(28, 0);
    await waitForAnimations(page);
    await page
      .getByTestId("app-sidebar")
      .screenshot({ path: `${SHOTS}/02-compact.png` });
  });

  test("03 — an unknown stored density falls back to comfortable", async ({
    page,
  }) => {
    await page.addInitScript((key) => {
      window.localStorage.setItem(key, "ultra");
    }, SIDEBAR_DENSITY_STORAGE_KEY);
    await installMockBridge(page);
    await openApp(page);

    expect(await streamRowPitch(page)).toBeCloseTo(36, 0);
  });
});
