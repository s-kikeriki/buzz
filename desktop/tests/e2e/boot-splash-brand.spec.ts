import { expect, type Page, test } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";

/**
 * The loading screen, on a per-organisation build.
 *
 * The window the app paints before anything else exists. Every other surface
 * of the ki.keriki build is ki.keriki and this one booted on Buzz's blue and
 * green with a bee flapping over it, because the gate's grainient derives from
 * the active theme's chart colours and its mark was the bee itself.
 *
 * What these bind is the absence as much as the presence: a surviving bee, or
 * a canvas that still follows the theme, is the defect — and both are
 * invisible to every unit test, because they live in one component's JSX and
 * four CSS custom properties rather than in a value.
 *
 * Gated on the runner declaring the flavor, never on what the screen renders:
 * deleting the brand lookups puts the bee back, so a "skip when it looks like
 * Buzz" gate would turn the exact regression into a skip, and a skip reads
 * green.
 *
 *     BUZZ_E2E_FLAVOR=ki.keriki pnpm exec playwright test --project=smoke \
 *       tests/e2e/boot-splash-brand.spec.ts
 */

const SHOTS = "test-results/boot-splash-brand";
const THEME_STORAGE_KEY = "buzz-theme";
const FOLLOW_SYSTEM_KEY = "buzz-follow-system";
const GATE = '[data-testid="app-loading-gate"]';
const MARK = '[data-testid="brand-boot-mark"]';
/** The brand's own black: `220 11% 4%`, the value #21 cut the landing on. */
const INK = "rgb(9, 10, 11)";
const CITRON = "#d4f247";

test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

test.skip(
  process.env.BUZZ_E2E_FLAVOR !== "ki.keriki",
  "stock bundle: build the e2e bundle with the ki.keriki flavor env and " +
    "re-run with BUZZ_E2E_FLAVOR=ki.keriki",
);

/**
 * Hold the cold-boot overlay open.
 *
 * E2E runs set the hold to zero (it would slow every spec and block pointer
 * actionability), so the gate this file is about never renders by default —
 * `boot-splash.spec.ts` opts back in the same way for the stock bee. Long
 * enough that a screenshot is taken while it is up, rather than racing a fade.
 */
async function holdBootSplash(page: Page, theme: string) {
  await page.addInitScript(
    ({ themeKey, themeValue, followKey }) => {
      window.localStorage.setItem(themeKey, themeValue);
      window.localStorage.setItem(followKey, "false");
      const testWindow = window as Window & {
        __BUZZ_E2E__?: { bootSplashHoldMs?: number };
      };
      testWindow.__BUZZ_E2E__ = {
        ...(testWindow.__BUZZ_E2E__ ?? {}),
        bootSplashHoldMs: 30_000,
      };
    },
    {
      themeKey: THEME_STORAGE_KEY,
      themeValue: theme,
      followKey: FOLLOW_SYSTEM_KEY,
    },
  );
}

async function openBootGate(page: Page, theme: string) {
  await installMockBridge(page);
  // After installMockBridge, so this init script runs after the bridge's and
  // can extend the config it assigns.
  await holdBootSplash(page, theme);
  await page.goto("/");
  await expect(page.locator(GATE).first()).toBeVisible();
  await waitForAnimations(page);
}

/**
 * Every gate on the page, read in one pass in the browser.
 *
 * During boot the gate is on screen twice — once in its own right while the
 * community resolves, and once as the overlay above the app mounting beneath
 * it — and React unmounts the first one partway through. A Playwright locator
 * re-queried across two `evaluate` calls can therefore hand back an element
 * that detached in between, and a detached element reports an empty computed
 * style and no animations: the exact shape of "the brand is missing", from a
 * build that has it. (That cost a false failure here before this helper
 * existed.) Reading them all inside a single evaluate removes the window and
 * asserts more: every instance has to be right, not whichever one resolved
 * first.
 */
function readGates(page: Page) {
  return page.evaluate(
    ({ gateSelector, markSelector }) => {
      const probe = document.createElement("div");
      document.body.append(probe);
      /**
       * Normalise a colour the way the engine sees it. The CSS minifier is
       * free to rewrite `rgb(255 255 255 / 0.05)` as `#ffffff0d`, so an
       * assertion on the declared spelling binds the minifier, not the design.
       */
      const resolve = (value: string) => {
        probe.style.backgroundColor = "transparent";
        probe.style.backgroundColor = value;
        return getComputedStyle(probe).backgroundColor;
      };
      const gates = [...document.querySelectorAll(gateSelector)].map((gate) => {
        const styles = getComputedStyle(gate);
        const blobs = [0, 1, 2, 3].map((i) =>
          styles.getPropertyValue(`--buzz-grainient-color-${i}`).trim(),
        );
        const wash = gate.querySelector(".buzz-setup-grainient__wash");
        return {
          background: styles.backgroundColor,
          accent: styles.getPropertyValue("--buzz-brand-accent").trim(),
          brandBoot: gate.getAttribute("data-brand-boot"),
          blobs,
          resolvedBlobs: blobs.map(resolve),
          washMotion: wash
            ? {
                name: getComputedStyle(wash).animationName,
                state: wash.getAnimations()[0]?.playState,
              }
            : null,
          bees: gate.querySelectorAll(".bee-sprite").length,
          // The brand's mark arrives as an image, so any inline SVG left on
          // this screen can only be a Buzz one.
          svgs: gate.querySelectorAll("svg").length,
        };
      });
      const marks = [...document.querySelectorAll(markSelector)].map((mark) => {
        const [, payload = ""] = (mark.getAttribute("src") ?? "").split(",");
        return {
          svg: atob(payload),
          motion: {
            name: getComputedStyle(mark).animationName,
            state: mark.getAnimations()[0]?.playState,
          },
        };
      });
      probe.remove();
      return { gates, marks };
    },
    { gateSelector: GATE, markSelector: MARK },
  );
}

test.describe("branded loading screen", () => {
  test("the mark is the brand's, and there is no bee left", async ({
    page,
  }) => {
    await openBootGate(page, "buzz-dark");
    const { gates, marks } = await readGates(page);

    expect(gates.length).toBeGreaterThan(0);
    expect(marks.length).toBe(gates.length);

    for (const mark of marks) {
      // The asset itself, not merely "an image rendered": a src pointing at
      // the wrong asset, or at a placeholder, passes a presence check.
      expect(mark.svg).toContain("<title>kikeriki</title>");
      expect(mark.svg.toLowerCase()).toContain(CITRON);
    }
    for (const gate of gates) {
      expect(gate.bees).toBe(0);
      expect(gate.svgs).toBe(0);
    }
  });

  test("the canvas is the brand's ink in both modes, not the theme's", async ({
    page,
  }) => {
    await openBootGate(page, "buzz-dark");
    const dark = await readGates(page);

    for (const gate of dark.gates) {
      expect(gate.background).toBe(INK);
      expect(gate.brandBoot).toBe("ink");
      // The accent arrives from the flavor config, not from the stylesheet.
      expect(gate.accent).toBe(CITRON);

      // "Citron, sparingly" is checkable: exactly one of the four blobs
      // carries the accent and the other three are faint neutral lifts off
      // the ink. A build that accents all four is as wrong as one that
      // accents none.
      const accented = gate.blobs.filter((blob) => blob.includes(CITRON));
      expect(accented).toHaveLength(1);
      const neutral = gate.blobs
        .map((blob, i) => [blob, gate.resolvedBlobs[i]] as const)
        .filter(([blob]) => !blob.includes(CITRON))
        .map(([, resolved]) => resolved);
      expect(neutral).toHaveLength(3);
      for (const resolved of neutral) {
        expect(resolved).toMatch(/^rgba\(255, 255, 255, 0\.0\d+\)$/);
      }
    }
    await page.screenshot({ path: `${SHOTS}/01-dark.png` });

    // The light theme, on the same bundle. `chromeSurface: ink` means the
    // chrome stays on ink in both document modes, and the boot gate is
    // chrome — so this is the assertion that the ink canvas is a brand fact
    // and not a dark-mode coincidence.
    await page.evaluate(
      (key) => window.localStorage.setItem(key, "buzz"),
      THEME_STORAGE_KEY,
    );
    await page.reload();
    await expect(page.locator(GATE).first()).toBeVisible();
    await waitForAnimations(page);
    const light = await readGates(page);
    expect(light.gates.length).toBeGreaterThan(0);
    for (const gate of light.gates) {
      expect(gate.background).toBe(INK);
      expect(gate.accent).toBe(CITRON);
    }
    await page.screenshot({ path: `${SHOTS}/02-light.png` });
  });

  test("the screen is still moving: the mark breathes, the wash orbits", async ({
    page,
  }) => {
    await openBootGate(page, "buzz-dark");
    const { gates, marks } = await readGates(page);

    // The bee flapped. A brand mark has no wings, so the gesture changed —
    // but a boot gate that stopped moving is a frozen screenshot of itself,
    // and nothing else in this file would notice.
    expect(marks.length).toBeGreaterThan(0);
    for (const mark of marks) {
      expect(mark.motion).toEqual({
        name: "buzz-boot-mark-breathe",
        state: "running",
      });
    }

    // And the background keeps the product's own motion, untouched by the
    // repaint: the same four blobs on the same orbit.
    expect(gates.length).toBeGreaterThan(0);
    for (const gate of gates) {
      expect(gate.washMotion).toEqual({
        name: "buzz-grainient-orbit",
        state: "running",
      });
    }
  });
});
