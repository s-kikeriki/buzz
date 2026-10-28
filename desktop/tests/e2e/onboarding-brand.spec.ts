import { expect, test } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";

/**
 * The first screen a new install shows, on a per-organisation build.
 *
 * Every other surface of a flavored build is branded; this one was not, and
 * it is the one Katja and Verena see first. What these bind is the absence as
 * much as the presence — a Buzz bee or the Buzz wordmark surviving here is
 * the defect, and it is invisible to every unit test because it lives in two
 * components' JSX rather than in a value.
 *
 * Gated on the runner declaring the flavor, never on what the screen renders:
 * deleting the brand lookups puts the bees back, so a "skip when it looks like
 * Buzz" gate would turn the exact regression into a skip, and a skip reads
 * green.
 *
 *     BUZZ_E2E_FLAVOR=ki.keriki pnpm exec playwright test --project=smoke \
 *       tests/e2e/onboarding-brand.spec.ts
 */

const SHOTS = "test-results/onboarding-brand";
/** The brand's own black, the value its logo ident and mail avatar are cut on. */
const INK = "rgb(8, 9, 10)";
const CITRON = "#d4f247";

test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

test.skip(
  process.env.BUZZ_E2E_FLAVOR !== "ki.keriki",
  "stock bundle: build the e2e bundle with the ki.keriki flavor env and " +
    "re-run with BUZZ_E2E_FLAVOR=ki.keriki",
);

test.describe("branded onboarding landing", () => {
  test.beforeEach(async ({ page }) => {
    await installMockBridge(page, undefined, {
      skipCommunitySeed: true,
      skipOnboardingSeed: true,
    });
    await page.goto("/");
    await expect(page.getByTestId("machine-onboarding-gate")).toBeVisible();
    await waitForAnimations(page);
  });

  test("the canvas is the brand's ink, not Buzz chartreuse", async ({
    page,
  }) => {
    const gate = page.getByTestId("machine-onboarding-gate");
    await expect(gate).toHaveAttribute("data-brand-onboarding", "ink");

    const paint = await gate.evaluate((node) => {
      const styles = getComputedStyle(node);
      return {
        background: styles.backgroundColor,
        chartreuse: styles.getPropertyValue("--buzz-welcome-chartreuse").trim(),
        ctaLabel: styles
          .getPropertyValue("--buzz-onboarding-landing-cta-label")
          .trim(),
        accent: styles.getPropertyValue("--buzz-brand-accent").trim(),
      };
    });
    expect(paint.background).toBe(INK);
    expect(paint.chartreuse).toBe("#08090a");
    // The accent arrives from the flavor config, not from the stylesheet.
    expect(paint.accent).toBe(CITRON);
    // The CTA label is the canvas colour, which is the same relationship the
    // chartreuse landing CTA has on stock — the pill inverts to the foreground
    // on ink, and citron on a white pill is roughly 1.2:1.
    expect(paint.ctaLabel).toBe("#08090a");
    const cta = page.getByRole("button", {
      name: "Create a new identity key",
    });
    const pill = await cta.evaluate((node) => {
      const styles = getComputedStyle(node);
      return { color: styles.color, background: styles.backgroundColor };
    });
    expect(pill.color).toBe(INK);
    expect(pill.background).toBe("rgb(245, 245, 245)");
  });

  test("the wordmark is the flavor's, and the Buzz one is not loaded", async ({
    page,
  }) => {
    const wordmark = page
      .getByTestId("machine-onboarding-gate")
      .locator("img[alt='ki.keriki']");
    await expect(wordmark).toBeVisible();
    await expect(wordmark).toHaveAttribute(
      "src",
      /^data:image\/svg\+xml;base64,/,
    );

    const buzzAssets = await page.evaluate(() =>
      [...document.querySelectorAll("img")]
        .map((img) => img.getAttribute("src") ?? "")
        .filter((src) => src.includes("buzz-wordmark")),
    );
    expect(buzzAssets).toEqual([]);
  });

  test("the drifting field is the brand mark, and no bee survives", async ({
    page,
  }) => {
    // `FlappingBee` and `BuzzMark` are inline SVGs, so absence is asserted on
    // the rendered DOM rather than on a request that was never made.
    const bees = await page.evaluate(() => {
      const titles = [...document.querySelectorAll("svg title")].map(
        (t) => t.textContent ?? "",
      );
      return {
        titles: titles.filter((t) => /bee|buzz/i.test(t)),
        svgCount: document.querySelectorAll(
          "[data-testid='machine-onboarding-gate'] svg",
        ).length,
        markCount: document.querySelectorAll(
          "[data-testid='machine-onboarding-gate'] img[src^='data:image/svg+xml;base64,']",
        ).length,
      };
    });
    expect(bees.titles).toEqual([]);
    // One wordmark, one corner mark, plus the scattered field.
    expect(bees.markCount).toBeGreaterThan(30);

    // The motion is the product's and is kept: the field still wanders.
    const first = await page.evaluate(
      () =>
        document
          .querySelector(
            "[data-testid='machine-onboarding-gate'] span.will-change-transform",
          )
          ?.getAttribute("style") ?? "",
    );
    await page.waitForTimeout(900);
    const second = await page.evaluate(
      () =>
        document
          .querySelector(
            "[data-testid='machine-onboarding-gate'] span.will-change-transform",
          )
          ?.getAttribute("style") ?? "",
    );
    expect(second).not.toBe(first);
  });

  test("landing screenshot", async ({ page }) => {
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS}/landing.png` });
    await page
      .getByTestId("machine-onboarding-gate")
      .locator("img[alt='ki.keriki']")
      .screenshot({ path: `${SHOTS}/wordmark.png` });
  });
});
