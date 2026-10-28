import { expect, test } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";

/**
 * The rest of the first-run flow, on a per-organisation build.
 *
 * #21 branded the landing screen. Pages 2-7 kept the Buzz mark in the
 * top-left corner and the Buzz chartreuse-to-light-blue gradient behind the
 * card, so a new install walked from one branded screen onto six that were
 * not — which is where Katja and Verena spend most of their first run.
 *
 * What this binds is mostly absence, and one presence that is easy to lose:
 * the content card must stay a white card with near-black text. The shell's
 * ink block inverts `--foreground`, and the card hardcodes `bg-white` and
 * paints its heading with `text-foreground`, so repainting the shell without
 * pinning the card back renders white text on a white card. The landing has
 * no card, so nothing before this could have caught it.
 *
 * Gated on the runner declaring the flavor, never on what the screen renders:
 * deleting the brand lookups puts the bee back, so a "skip when it looks like
 * Buzz" gate would turn the exact regression into a skip, and a skip reads
 * green.
 *
 *     BUZZ_E2E_FLAVOR=ki.keriki pnpm exec playwright test --project=smoke \
 *       tests/e2e/first-run-brand.spec.ts
 */

const SHOTS = "test-results/first-run-brand";
/** The brand's own black, the value its logo ident is cut on. */
const INK = "rgb(8, 9, 10)";
const CITRON = "#d4f247";
const NEAR_BLACK_TEXT = "rgb(23, 23, 23)";
const WHITE = "rgb(255, 255, 255)";

test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

const FLAVORED = process.env.BUZZ_E2E_FLAVOR === "ki.keriki";

/** Land on the first page that uses `OnboardingCard` rather than the landing. */
async function openFirstCardStep(page: import("@playwright/test").Page) {
  await installMockBridge(page, undefined, {
    skipCommunitySeed: true,
    skipOnboardingSeed: true,
  });
  await page.goto("/");
  await expect(page.getByTestId("machine-onboarding-gate")).toBeVisible();
  await page.getByRole("button", { name: "Create a new identity key" }).click();
  // `OnboardingCard` reuses the gate's testid, so the card's own presence is
  // what says we are past the landing rather than still on it.
  await expect(page.getByTestId("onboarding-content-card")).toBeVisible();
  await waitForAnimations(page);
  return page.getByTestId("machine-onboarding-gate");
}

test.describe("branded onboarding steps", () => {
  test.skip(
    !FLAVORED,
    "stock bundle: build the e2e bundle with the ki.keriki flavor env and " +
      "re-run with BUZZ_E2E_FLAVOR=ki.keriki",
  );

  test("the shell behind the card is ink, not Buzz chartreuse", async ({
    page,
  }) => {
    const shell = await openFirstCardStep(page);
    await expect(shell).toHaveAttribute("data-brand-onboarding", "ink");

    const paint = await shell.evaluate((node) => {
      const styles = getComputedStyle(node);
      return {
        background: styles.backgroundColor,
        chartreuse: styles.getPropertyValue("--buzz-welcome-chartreuse").trim(),
        accent: styles.getPropertyValue("--buzz-brand-accent").trim(),
      };
    });
    expect(paint.background).toBe(INK);
    expect(paint.chartreuse).toBe("#08090a");
    expect(paint.accent).toBe(CITRON);
  });

  test("the content card stays white with readable text", async ({ page }) => {
    await openFirstCardStep(page);
    const card = page.getByTestId("onboarding-content-card");
    await expect(card).toBeVisible();

    const paint = await card.evaluate((node) => {
      const heading = node.querySelector("h1");
      return {
        background: getComputedStyle(node).backgroundColor,
        headingColor: heading ? getComputedStyle(heading).color : null,
      };
    });
    expect(paint.background).toBe(WHITE);
    // The whole point: inverting the shell must not invert this.
    expect(paint.headingColor).toBe(NEAR_BLACK_TEXT);
  });

  test("the corner mark is the brand's, and no bee survives the step", async ({
    page,
  }) => {
    const shell = await openFirstCardStep(page);

    const marks = await shell.evaluate((node) => {
      const titles = [...node.querySelectorAll("svg title")].map(
        (t) => t.textContent ?? "",
      );
      const logo = node.querySelector("[data-testid='onboarding-logo'] img");
      return {
        beeTitles: titles.filter((t) => /bee|buzz/i.test(t)),
        // `BuzzMark` is an inline SVG with this class; the brand mark is an
        // `<img>`. Asserting the class is gone is what makes the swap
        // falsifiable — an added mark alongside a surviving bee would pass a
        // presence-only check.
        buzzMarkCount: node.querySelectorAll("svg.buzz-mark").length,
        markSrc: logo?.getAttribute("src") ?? null,
        markCut: logo?.getAttribute("data-brand-mark-cut") ?? null,
        markSurface: logo?.getAttribute("data-brand-mark-surface") ?? null,
      };
    });
    expect(marks.beeTitles).toEqual([]);
    expect(marks.buzzMarkCount).toBe(0);
    expect(marks.markSrc).toMatch(/^data:image\/svg\+xml;base64,/);
    // Ink shell, so the negative cut — chosen in JS, because a `dark:`
    // variant would be answering a question about the document instead.
    expect(marks.markCut).toBe("dark");
    expect(marks.markSurface).toBe("ink");
  });

  test("the step mark is the flavor's own asset, not the wordmark", async ({
    page,
  }) => {
    // Both are base64 SVG data URLs, so "it is a data URL" proves nothing.
    // The corner slot is glyph-sized: the 669x268 wordmark in it is a smudge.
    const shell = await openFirstCardStep(page);
    const viewBox = await shell.evaluate(async (node) => {
      const img = node.querySelector<HTMLImageElement>(
        "[data-testid='onboarding-logo'] img",
      );
      if (!img) return null;
      const svg = atob(img.src.split("base64,")[1] ?? "");
      return /viewBox="([^"]+)"/.exec(svg)?.[1] ?? null;
    });
    expect(viewBox).not.toBeNull();
    const [, , width, height] = (viewBox as string).split(/\s+/).map(Number);
    // Square-ish: the mark. The wordmark is 2.5:1.
    expect(width / height).toBeLessThan(1.4);
  });

  test("the keyring screen drops the OS pin that would outrank the ink", async ({
    page,
  }) => {
    // `useSystemColorScheme` always returns a value, so this attribute is
    // always present on the screens that read it — unlike the step shell,
    // which is handed the prop and never gets one. That is why the guard is
    // bound here: `.buzz-onboarding-neutral-theme[data-system-color-scheme=
    // "light"]` is a two-class selector declared *after* the ink block and
    // sets the same tokens on the same element, so on a machine reporting a
    // light OS scheme it wins and the screen comes out white under an ink
    // dot grid. This runner reports dark, which is exactly why asserting the
    // rendered colour here would prove nothing.
    await installMockBridge(page, { identityLocked: true });
    await page.goto("/");
    const gate = page.getByTestId("keyring-locked");
    await expect(gate).toBeVisible();
    await expect(gate).toHaveAttribute("data-brand-onboarding", "ink");
    await expect(gate).not.toHaveAttribute("data-system-color-scheme", /.*/);
    // And the copy on it: this is the screen behind the keychain prompt on
    // every replacement build, so it is the normal update path.
    await expect(
      page.getByRole("button", { name: "Relaunch ki.keriki" }),
    ).toBeVisible();
  });

  test("onboarding step screenshot", async ({ page }) => {
    await openFirstCardStep(page);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/step-2.png` });
  });
});

test.describe("the stock trunk is unchanged", () => {
  // The other direction, and the one a flavor must never break. Asserted
  // rather than assumed: every change in this sweep is a conditional, and a
  // conditional that is wrong in the other branch rebrands the OSS build.
  test.skip(
    FLAVORED,
    "flavored bundle: re-run against a bundle built with no flavor env",
  );

  test("the step keeps the Buzz mark on the Buzz canvas", async ({ page }) => {
    const shell = await openFirstCardStep(page);
    await expect(shell).not.toHaveAttribute("data-brand-onboarding", /.*/);

    const stock = await shell.evaluate((node) => ({
      chartreuse: getComputedStyle(node)
        .getPropertyValue("--buzz-welcome-chartreuse")
        .trim(),
      buzzMarkCount: node.querySelectorAll("svg.buzz-mark").length,
      brandMarkCount: node.querySelectorAll("[data-brand-mark-cut]").length,
    }));
    expect(stock.chartreuse).toBe("#d7d72e");
    expect(stock.buzzMarkCount).toBeGreaterThan(0);
    expect(stock.brandMarkCount).toBe(0);

    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/step-2-stock.png` });
  });

  test("the keyring screen keeps the OS pin and the Buzz name", async ({
    page,
  }) => {
    // The other direction of the suppression: the OS pin is the trunk's own
    // mechanism, and dropping it unconditionally would stop the stock
    // first-run screens following the system scheme at all.
    await installMockBridge(page, { identityLocked: true });
    await page.goto("/");
    const gate = page.getByTestId("keyring-locked");
    await expect(gate).toBeVisible();
    await expect(gate).not.toHaveAttribute("data-brand-onboarding", /.*/);
    await expect(gate).toHaveAttribute(
      "data-system-color-scheme",
      /^(dark|light)$/,
    );
    await expect(
      page.getByRole("button", { name: "Relaunch Buzz" }),
    ).toBeVisible();
  });
});
