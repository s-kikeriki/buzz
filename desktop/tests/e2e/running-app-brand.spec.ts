import { expect, test } from "@playwright/test";

import { PRODUCT_NAME } from "../helpers/brand";
import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";
import { openSettings } from "../helpers/settings";

/**
 * The marks behind the sign-in, on a per-organisation build.
 *
 * #23 swept the first-run flow and the native shell and stopped there, so
 * every bee inside the signed-in app survived — which is where everyone who
 * is already set up spends all of their time. Ian found the loudest one
 * himself: three bees pulsing at the foot of the Activity panel for the whole
 * of every agent turn.
 *
 * Gated on `BUZZ_E2E_FLAVOR`, which the runner declares, never on what the
 * screen renders. Deleting the brand lookups puts the bee back, so a "skip
 * when it still looks like Buzz" gate would turn the exact regression into a
 * skip — and a skip reads green.
 *
 * The stock half is bound in `src/shared/ui/runningAppBrandMarks.jsdom-test.mjs`:
 * a build that declares no mark must still fly the bee, and that is the half
 * a flavored bundle cannot show.
 *
 *     BUZZ_E2E_FLAVOR=ki.keriki pnpm exec playwright test --project=smoke \
 *       tests/e2e/running-app-brand.spec.ts
 */

const FLAVORED = process.env.BUZZ_E2E_FLAVOR === "ki.keriki";

const OBSERVER_AGENT_PUBKEY = TEST_IDENTITIES.tyler.pubkey;
const AGENTS_CHANNEL_ID = "94a444a4-c0a3-5966-ab05-530c6ddc2301";
const NOW = new Date("2025-06-15T12:00:00Z").toISOString();

const MANAGED_AGENTS = [
  {
    pubkey: OBSERVER_AGENT_PUBKEY,
    name: "Observer Agent",
    status: "running" as const,
    channelNames: ["agents"],
  },
];

type Page = import("@playwright/test").Page;
type Locator = import("@playwright/test").Locator;

/** Every bee this bundle could still be drawing, by the class they all share. */
function bees(scope: Page | Locator) {
  return scope.locator(".buzz-logo");
}

function brandMarks(scope: Page | Locator) {
  return scope.getByTestId("brand-mark");
}

async function openActivityPanel(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => typeof window.__BUZZ_E2E_SEED_OBSERVER_EVENTS__ === "function",
    null,
    { timeout: 10_000 },
  );

  await page.getByTestId("channel-agents").click();
  await expect(page.getByTestId("chat-title")).toHaveText("agents");

  const messageRow = page
    .getByTestId("message-row")
    .filter({ has: page.getByText("Observer Agent", { exact: false }) });
  await expect(messageRow.first()).toBeVisible({ timeout: 8_000 });
  await messageRow.first().getByRole("button").first().click();

  await expect(page.getByTestId("user-profile-panel")).toBeVisible({
    timeout: 10_000,
  });
  await page
    .getByTestId(`user-profile-view-activity-${OBSERVER_AGENT_PUBKEY}`)
    .click();

  const panel = page.getByTestId("agent-session-thread-panel");
  await expect(panel).toBeVisible({ timeout: 10_000 });
  return panel;
}

/** Put a turn in flight for this agent in this channel. */
async function startTurn(page: Page) {
  await page.evaluate(
    ({ pubkey, channelId }) => {
      window.__BUZZ_E2E_SEED_ACTIVE_TURNS__?.({
        agentPubkey: pubkey,
        channelId,
        turnId: "turn-brand-001",
      });
    },
    { pubkey: OBSERVER_AGENT_PUBKEY, channelId: AGENTS_CHANNEL_ID },
  );
  await page.waitForTimeout(300);
}

async function seedTranscript(page: Page) {
  await page.evaluate(
    ({ pubkey, channelId, now }) => {
      window.__BUZZ_E2E_SEED_OBSERVER_EVENTS__?.({
        agentPubkey: pubkey,
        events: [
          {
            seq: 1,
            timestamp: now,
            kind: "acp_write",
            agentIndex: 0,
            channelId,
            sessionId: "session-brand",
            turnId: "turn-brand-001",
            payload: {
              jsonrpc: "2.0",
              id: 1,
              method: "session/prompt",
              params: { prompt: [{ type: "text", text: "Content: hello" }] },
            },
          },
        ],
      });
    },
    { pubkey: OBSERVER_AGENT_PUBKEY, channelId: AGENTS_CHANNEL_ID, now: NOW },
  );
  await page.waitForTimeout(300);
}

test.describe("brand marks in the signed-in app", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test.skip(
    !FLAVORED,
    "stock bundle: build the e2e bundle with the ki.keriki flavor env and " +
      "re-run with BUZZ_E2E_FLAVOR=ki.keriki",
  );

  test("the turn-liveness row flies three brand marks, not three bees", async ({
    page,
  }) => {
    await installMockBridge(page, { managedAgents: MANAGED_AGENTS });
    const panel = await openActivityPanel(page);
    await seedTranscript(page);
    await startTurn(page);

    const indicator = panel.getByTestId("turn-liveness-indicator");
    await expect(indicator).toBeVisible({ timeout: 10_000 });

    // Three, not "at least one". The staggered row is the branch a normal
    // install sees, and a change that collapsed it to the still mark would
    // pass a presence-only assertion while visibly changing the app.
    await expect(brandMarks(indicator)).toHaveCount(3);
    await expect(bees(indicator)).toHaveCount(0);

    // Both cuts are rendered on an `auto` surface and CSS picks one, so the
    // count above is of elements, not of visible marks. This is the part that
    // says the surface was declared `auto` rather than pinned to ink — a pin
    // here would render one cut and go invisible in light mode.
    await expect(brandMarks(indicator).first()).toHaveAttribute(
      "data-brand-mark-surface",
      "auto",
    );
  });

  test("the waiting-for-activity gate flies a brand mark", async ({ page }) => {
    await installMockBridge(page, { managedAgents: MANAGED_AGENTS });
    const panel = await openActivityPanel(page);
    await startTurn(page);

    // A live turn with nothing renderable yet: the empty state, not the row.
    await expect(brandMarks(panel).first()).toBeVisible({ timeout: 10_000 });
    await expect(bees(panel)).toHaveCount(0);
  });

  test("the built-in runtime wears the product's name, mark and sentence", async ({
    page,
  }) => {
    await installMockBridge(page);
    await openSettings(page, "agents");
    await page.getByTestId("harness-add-button").click();
    await expect(page.getByTestId("harness-catalog-dialog")).toBeVisible();

    const row = page.getByTestId("harness-catalog-list-item-buzz-agent");
    await expect(row).toBeVisible({ timeout: 10_000 });

    // The runtime that ships with the app is named after the app. Listed as
    // "Buzz" beside Claude and Codex it reads as a fourth vendor.
    await expect(row).toContainText(PRODUCT_NAME);
    await expect(brandMarks(row)).toHaveCount(1);
    await expect(bees(row)).toHaveCount(0);

    // Its one-line description is ours and follows the name; every other
    // entry's is the vendor's and must not.
    await row.click();
    const dialog = page.getByTestId("harness-catalog-dialog");
    await expect(dialog).toContainText(
      `${PRODUCT_NAME}'s built-in agent runtime, bundled with the app.`,
    );
  });
});
