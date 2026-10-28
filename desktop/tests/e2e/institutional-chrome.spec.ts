import { expect, type Page, test } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";

/**
 * The ink chrome: a dark navigation rail in both document modes.
 *
 * Only a build whose flavor sets `chromeSurface: "ink"` has one, and the e2e
 * bundle only carries that when it is built with such a flavor's env, so every
 * test here skips rather than fails on a stock build. Asserting the stock
 * build has an ink rail would fail it for behaving correctly.
 *
 * What these bind is the part that is not a colour choice: the chrome and the
 * document used to be one switch, and three separate things keyed off it —
 * the rail tokens, the brand logo's two cuts, and the accent darkening. Light
 * mode is where they come apart, and each failure is silent in its own way.
 */

const SHOTS = "test-results/institutional-chrome";
const THEME_STORAGE_KEY = "buzz-theme";

/** The flat near-black the ink rail is painted in. */
const INK = "#07090c";

test.use({ deviceScaleFactor: 2 });

async function seedTheme(page: Page, theme: string) {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: THEME_STORAGE_KEY, value: theme },
  );
}

async function openChannel(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("channel-general").click();
  await expect(page.getByTestId("app-sidebar")).toBeVisible();
}

function rootVar(page: Page, name: string) {
  return page.evaluate(
    (varName) =>
      getComputedStyle(document.documentElement)
        .getPropertyValue(varName)
        .trim(),
    name,
  );
}

/** `H S% L%` → `#rrggbb`, so a token can be compared against a brand hex. */
function hslTripletToHex(value: string): string | null {
  const m = /^(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/.exec(value);
  if (!m) return null;
  const h = Number(m[1]) / 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (offset: number) => {
    const t = (((h + offset) % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return `#${[channel(1 / 3), channel(0), channel(-1 / 3)]
    .map((c) =>
      Math.round(c * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function luminance(hex: string): number {
  const m = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return 0;
  const [r, g, b] = [m[1], m[2], m[3]].map((part) => {
    const value = Number.parseInt(part, 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

for (const [mode, theme] of [
  ["light", "buzz"],
  ["dark", "buzz-dark"],
] as const) {
  test(`the rail is ink in ${mode} mode`, async ({ page }) => {
    await seedTheme(page, theme);
    await installMockBridge(page);
    await openChannel(page);

    const chrome = await page.evaluate(() =>
      document.documentElement.getAttribute("data-buzz-chrome"),
    );
    if (chrome !== "ink") {
      test.skip(true, `this build's chrome is "${chrome}", not ink`);
      return;
    }

    // The document still follows the theme. If this ever reads `dark` in light
    // mode the rest of the file passes for the wrong reason: everything below
    // would be asserting ordinary dark mode.
    const documentIsDark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    expect(documentIsDark).toBe(mode === "dark");

    // The canvas itself, both painted layers, since which one is visible is a
    // WKWebView workaround rather than a design decision.
    expect(await rootVar(page, "--buzz-gradient-light-top")).toBe(INK);
    expect(await rootVar(page, "--buzz-gradient-light-bottom")).toBe(INK);
    expect(await rootVar(page, "--buzz-gradient-dark-top")).toBe(INK);
    expect(await rootVar(page, "--buzz-gradient-dark-bottom")).toBe(INK);

    // Rail text. `--sidebar-foreground` follows the document unless the chrome
    // block takes it over, and on ink the document's light value is near-black
    // on near-black.
    const railForeground = hslTripletToHex(
      await rootVar(page, "--sidebar-foreground"),
    );
    expect(railForeground).not.toBeNull();
    expect(contrast(railForeground as string, INK)).toBeGreaterThan(4.5);

    // The accent on the rail. `--primary` darkens to stay readable as text on
    // the *content* background; the rail is ink, so it must not inherit that.
    const railAccent = hslTripletToHex(
      await rootVar(page, "--sidebar-primary"),
    );
    expect(railAccent).not.toBeNull();
    expect(contrast(railAccent as string, INK)).toBeGreaterThan(10);

    if (mode === "light") {
      // And the split is real, not a coincidence of both being readable: in
      // light mode the content accent *is* darkened, so the two differ. Without
      // this the test passes just as well when the rail silently reuses
      // `--primary`.
      const contentAccent = hslTripletToHex(await rootVar(page, "--primary"));
      expect(contentAccent).not.toBe(railAccent);
    }

    // Exactly one cut of the brand mark is displayed, and it is the one drawn
    // for a dark surface. The `dark:` classes would pick the light cut here in
    // light mode, which is the dark-ink wordmark on near-black: present in the
    // DOM, invisible on screen, and passing any "is the logo rendered" check.
    const visibleCuts = await page.evaluate(() =>
      [...document.querySelectorAll("[data-brand-logo-cut]")]
        .filter((el) => getComputedStyle(el).display !== "none")
        .map((el) => el.getAttribute("data-brand-logo-cut")),
    );
    expect(visibleCuts).toEqual(["dark"]);

    await waitForAnimations(page);
    await page.screenshot({ path: `${SHOTS}/${mode}.png` });
    await page
      .getByTestId("app-sidebar")
      .screenshot({ path: `${SHOTS}/${mode}-sidebar.png` });
  });
}
