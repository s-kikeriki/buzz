import { expect, test } from "@playwright/test";

import { installMockBridge } from "../helpers/bridge";

/**
 * A branded screen, held open in a real window for a human to look at.
 *
 * Not a test — a viewer, and it is here rather than in `scripts/` because the
 * only way to render this app outside Tauri is the e2e mock bridge, which
 * lives in the Playwright helpers.
 *
 * It exists because the screens a flavor rebrands are the ones an installed
 * app will not show you. Onboarding is behind a fresh machine stage, and the
 * installed app has no way to pretend to be one: the data directory comes from
 * the bundle identifier, so there is no profile to point elsewhere, and the
 * single-instance lock is a machine-wide `/tmp/<identifier>_si.sock`, so a
 * second launch of the same build — from another account too — hands off to
 * the running window instead of starting fresh. Nothing here touches the
 * installed app, its data directory, its keyring item or its agents.
 *
 *     cd desktop
 *     eval "$(node scripts/flavor-config.mjs ki.keriki)"   # flavor env
 *     pnpm build:e2e
 *     BUZZ_PREVIEW=onboarding pnpm exec playwright test --project=smoke \
 *       --headed tests/e2e/flavor-preview.spec.ts
 *
 * `BUZZ_PREVIEW` takes `onboarding`, `boot`, or `all`. The window stays up
 * until you close it; closing it ends the run.
 */

const WANTED = process.env.BUZZ_PREVIEW ?? "";

test.skip(
  WANTED === "" || Boolean(process.env.CI),
  "a viewer, not a test: set BUZZ_PREVIEW=onboarding|boot|all and pass --headed",
);

/** No deadline: the run lasts as long as the person is looking at it. */
test.describe.configure({ timeout: 0 });

function wanted(name: string) {
  return WANTED === name || WANTED === "all";
}

test("onboarding landing", async ({ page }) => {
  test.skip(!wanted("onboarding"), "not selected by BUZZ_PREVIEW");
  await installMockBridge(page, undefined, {
    skipCommunitySeed: true,
    skipOnboardingSeed: true,
  });
  await page.goto("/");
  await expect(page.getByTestId("machine-onboarding-gate")).toBeVisible();
  await page.waitForEvent("close", { timeout: 0 });
});

test("loading screen", async ({ page }) => {
  test.skip(!wanted("boot"), "not selected by BUZZ_PREVIEW");
  await installMockBridge(page);
  await page.addInitScript(() => {
    const testWindow = window as Window & {
      __BUZZ_E2E__?: { bootSplashHoldMs?: number };
    };
    testWindow.__BUZZ_E2E__ = {
      ...(testWindow.__BUZZ_E2E__ ?? {}),
      // The gate is held open rather than sampled: it is on screen for about
      // a second on a real boot, which is not long enough to look at.
      bootSplashHoldMs: 24 * 60 * 60 * 1_000,
    };
  });
  await page.goto("/");
  await expect(page.getByTestId("app-loading-gate")).toBeVisible();
  await page.waitForEvent("close", { timeout: 0 });
});
