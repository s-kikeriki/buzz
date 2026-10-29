import { expect, test } from "@playwright/test";

import { PRODUCT_NAME } from "../helpers/brand";
import { installMockBridge } from "../helpers/bridge";
import { openSettings } from "../helpers/settings";

/**
 * The product name in Settings copy, on a per-organisation build.
 *
 * #21 branded the first-run landing, #23 the rest of first run and the native
 * shell, #24 the marks inside the signed-in app. None of them touched the
 * ~150 sentences in Settings, Agents and Projects that name the product — so
 * a fully de-branded ki.keriki build still said "Keep Buzz up to date",
 * "across Buzz" and "Choose whether Buzz reads new agent responses aloud" to
 * anyone who opened Settings.
 *
 * Gated on `BUZZ_E2E_FLAVOR`, which the runner declares, never on what the
 * screen renders. A "skip when it still says Buzz" gate would turn the exact
 * regression into a skip, and a skip reads green.
 *
 * Asserted in **both** directions per panel, which is the part that matters.
 * Only checking that the flavor name is present passes on a panel that shows
 * both names — and that is the realistic half-converted state, because these
 * sentences were converted one at a time.
 *
 *     BUZZ_E2E_FLAVOR=ki.keriki pnpm exec playwright test --project=smoke \
 *       tests/e2e/settings-brand.spec.ts
 */

const FLAVORED = process.env.BUZZ_E2E_FLAVOR === "ki.keriki";

/**
 * Sentences that are allowed to keep the stock name, with the reason.
 *
 * One entry: a hosted-community address really is a Buzz address. That page
 * is only for relay hosting provided by Block and names Block in the same
 * paragraph, so renaming it would claim the flavor hosts a namespace it does
 * not. `scripts/check-product-name.mjs` carries the same exception against
 * the same line of source.
 */
const PERMITTED_STOCK_PHRASES = [/That Buzz address is already taken\./];

/** Every "Buzz" on screen that is not one of the permitted phrases. */
async function strayStockNames(
  panel: import("@playwright/test").Locator,
): Promise<string[]> {
  const text = (await panel.innerText()) ?? "";
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /(?<![A-Za-z0-9_])Buzz(?![A-Za-z0-9_])/.test(line))
    .filter(
      (line) => !PERMITTED_STOCK_PHRASES.some((allowed) => allowed.test(line)),
    );
}

test.describe("settings copy follows the flavor", () => {
  test.skip(!FLAVORED, "needs a bundle built with a flavor");

  // `installMockBridge` only installs the mock IPC — the app still has to be
  // navigated to before anything mounts, and `open-settings` does not exist
  // until it has. My first run of this spec timed out on all six tests
  // waiting for that button, which reads exactly like Settings being broken.
  test.beforeEach(async ({ page }) => {
    test.setTimeout(60_000);
    await installMockBridge(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
  });

  test("the panel a rebrand is judged on names the flavor, not Buzz", async ({
    page,
  }) => {
    // Profile is the first thing Settings opens on and its one sentence names
    // the product: "Update how your name, avatar, and bio appear across X."
    await openSettings(page, "profile");
    const panel = page.getByTestId("settings-view");
    await expect(panel).toContainText(PRODUCT_NAME);
    expect(await strayStockNames(panel)).toEqual([]);
  });

  for (const section of ["voice", "updates", "agents"] as const) {
    test(`the ${section} panel names the flavor, not Buzz`, async ({
      page,
    }) => {
      await openSettings(page, section);
      const panel = page.getByTestId("settings-view");
      await expect(panel).toContainText(PRODUCT_NAME);
      expect(await strayStockNames(panel)).toEqual([]);
    });
  }

  test("the hosted-communities page keeps only its documented exception", async ({
    page,
  }) => {
    // The one page with a legitimate "Buzz": the hosted namespace is Block's.
    // Asserted rather than skipped, so the exception stays one line and does
    // not quietly become a licence for the whole page.
    await openSettings(page, "hosted-communities");
    const panel = page.getByTestId("settings-view");
    await expect(panel).toContainText(PRODUCT_NAME);
    expect(await strayStockNames(panel)).toEqual([]);
  });

  test("the sign-out confirmation names the flavor", async ({ page }) => {
    // Its own test because the copy is inside an AlertDialog, so it is not in
    // the panel text any of the assertions above read.
    await openSettings(page, "profile");
    await page.getByTestId("signout-open-dialog").click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(PRODUCT_NAME);
    expect(await strayStockNames(dialog)).toEqual([]);
  });
});
