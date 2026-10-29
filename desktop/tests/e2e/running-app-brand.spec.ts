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

/**
 * One mark = two elements on an `auto` surface.
 *
 * `BrandMarkImage` renders both cuts and lets Tailwind's `dark:` variant hide
 * one, so a raw `getByTestId("brand-mark")` count is double what is on screen.
 * Counting one cut is what makes "three marks" mean three marks — and the
 * light cut's presence is itself the evidence the surface was declared `auto`
 * rather than pinned, which is the mistake that makes a mark vanish in light
 * mode.
 */
function markCut(scope: Page | Locator, cut: "dark" | "light") {
  return scope.locator(
    `[data-testid="brand-mark"][data-brand-mark-cut="${cut}"]`,
  );
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

/**
 * One renderable row, so the transcript takes its content branch.
 *
 * A bare `session/prompt` is held back for the prompt-context dialog and
 * renders nothing, which puts the list in its empty state — the other branch,
 * and the reason the first version of this spec timed out waiting for an
 * indicator that was never going to mount. `current_mode_update` is the
 * smallest frame that paints a row.
 */
async function seedTranscript(page: Page) {
  await page.evaluate(
    ({ pubkey, channelId, now }) => {
      window.__BUZZ_E2E_SEED_OBSERVER_EVENTS__?.({
        agentPubkey: pubkey,
        events: [
          {
            seq: 1,
            timestamp: now,
            kind: "acp_read",
            agentIndex: 0,
            channelId,
            sessionId: "session-brand",
            turnId: "turn-brand-001",
            payload: {
              method: "session/update",
              params: {
                sessionId: "session-brand",
                update: {
                  sessionUpdate: "current_mode_update",
                  currentModeId: "plan",
                },
              },
            },
          },
        ],
      });
    },
    { pubkey: OBSERVER_AGENT_PUBKEY, channelId: AGENTS_CHANNEL_ID, now: NOW },
  );
  await page.waitForTimeout(300);
}

/**
 * Two runtimes: the one that ships with the app, and a vendor's.
 *
 * The default mock bridge serves no catalogue, so the dialog is empty without
 * this. Claude is here as the control — the point of the change is that one of
 * these two names is the app's own and the other never is.
 */
const CATALOG = [
  {
    id: "buzz-agent",
    label: "Buzz Agent",
    avatar_url: "",
    availability: "available",
    command: "buzz-agent",
    binary_path: "/usr/local/bin/buzz-agent",
    default_args: [],
    mcp_command: "buzz-dev-mcp",
    install_hint: "",
    install_instructions_url: "https://github.com/block/buzz",
    can_auto_install: false,
    underlying_cli_path: null,
    node_required: false,
    auth_status: { status: "not_applicable" },
  },
  {
    id: "claude",
    label: "Claude Code",
    avatar_url: "",
    availability: "available",
    command: "claude-agent-acp",
    binary_path: "/usr/local/bin/claude-agent-acp",
    default_args: [],
    mcp_command: null,
    install_hint: "",
    install_instructions_url:
      "https://github.com/agentclientprotocol/claude-agent-acp",
    can_auto_install: true,
    underlying_cli_path: "/usr/local/bin/claude",
    node_required: false,
    auth_status: { status: "logged_in" },
  },
];

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
    await expect(panel.getByText("Mode")).toBeVisible({ timeout: 10_000 });
    await startTurn(page);

    const indicator = panel.getByTestId("turn-liveness-indicator");
    await expect(indicator).toBeVisible({ timeout: 10_000 });

    // Three, not "at least one". The staggered row is the branch a normal
    // install sees, and a change that collapsed it to the still mark would
    // pass a presence-only assertion while visibly changing the app.
    await expect(markCut(indicator, "dark")).toHaveCount(3);
    await expect(bees(indicator)).toHaveCount(0);

    // The light cut is there too, hidden by CSS rather than absent. That is
    // what says the surface was declared `auto`: a mark pinned to ink renders
    // the dark cut alone and goes invisible the moment the app is in light
    // mode, which no dark-mode screenshot would ever show.
    await expect(markCut(indicator, "light")).toHaveCount(3);
    await expect(brandMarks(indicator).first()).toHaveAttribute(
      "data-brand-mark-surface",
      "auto",
    );
  });

  test("the waiting-for-activity gate flies a brand mark", async ({ page }) => {
    await installMockBridge(page, { managedAgents: MANAGED_AGENTS });
    const panel = await openActivityPanel(page);
    await startTurn(page);

    // A live turn with nothing renderable yet. Assert which branch rendered,
    // not just that a mark is somewhere in the panel: the liveness row also
    // draws marks, so "a mark is visible" would pass here even if the empty
    // state had been left flying a bee.
    await expect(panel.getByTestId("turn-liveness-indicator")).toHaveCount(0);
    await expect(markCut(panel, "dark")).toHaveCount(1);
    await expect(bees(panel)).toHaveCount(0);
  });

  test("the built-in runtime wears the product's name, mark and sentence", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await installMockBridge(page, { acpRuntimesCatalog: CATALOG });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await openSettings(page, "agents");
    await expect(page.getByTestId("settings-harnesses")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByTestId("harness-add-button").click();
    await expect(page.getByTestId("harness-catalog-dialog")).toBeVisible();
    // Ready entries sit in the "Installed" accordion, collapsed by default.
    await page.getByTestId("harness-catalog-section-installed").click();

    const row = page.getByTestId("harness-catalog-list-item-buzz-agent");
    await expect(row).toBeVisible({ timeout: 10_000 });

    // The runtime that ships with the app is named after the app. Listed as
    // "Buzz" beside Claude it reads as a third vendor rather than as the one
    // that came with this install — which is why the fixture has both.
    await expect(row).toContainText(PRODUCT_NAME);
    await expect(markCut(row, "dark")).toHaveCount(1);
    await expect(markCut(row, "light")).toHaveCount(1);
    await expect(bees(row)).toHaveCount(0);
    // The neighbour is a vendor's name and must be untouched by any of this.
    await expect(
      page.getByTestId("harness-catalog-list-item-claude"),
    ).toContainText("Claude Code");

    // Its one-line description is ours and follows the name; every other
    // entry's is the vendor's and must not.
    await row.click();
    const dialog = page.getByTestId("harness-catalog-dialog");
    await expect(dialog).toContainText(
      `${PRODUCT_NAME}'s built-in agent runtime, bundled with the app.`,
    );
  });
});
