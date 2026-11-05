import { expect, type Locator, type Page, test } from "@playwright/test";

import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";

/**
 * The agent session transcript, rendered in German.
 *
 * Same reasoning as `messages-german.spec.ts`, and this area is the clearest
 * case for it: `pnpm check:i18n` proves every extracted id has a German
 * translation and the ratchet proves no listed file still holds a literal,
 * but the transcript's copy is produced by pure functions — activity verbs,
 * lifecycle titles, standing-context headings — and neither gate can see a
 * function that returns a string.
 *
 * Worse, several of those strings were *read back* by the code that produced
 * them: an error class chosen by `title.includes("error")`, a permission tone
 * from `startsWith("Approved")`, a heading deduplicated against the literal
 * "Permission requested", the event section located by
 * `startsWith("buzz event")`. Every one of those passes its own unit tests in
 * English and is wrong the moment the copy is translated. A render in `de` is
 * the only thing that catches them, so each test below pairs the German
 * assertion with the structural consequence that used to break — the tone
 * attribute, the resolved event body — rather than the copy alone.
 *
 * One read-back of the same family is deliberately *not* here: the
 * `endsWith("failed")` dedup in `failureLabel`. Its string does not reach the
 * screen in today's UI — see the comment on the failed-tool test below — so it
 * is covered at the unit layer, where it can be made to fail.
 *
 * Every German test has an English counterpart. Without that control a string
 * resolved once at module load passes the German half for the wrong reason: it
 * reads German because German was the boot locale, not because the function
 * resolves per call.
 */

const LOCALE_STORAGE_KEY = "buzz.appearance.locale";

const AGENT_PUBKEY = TEST_IDENTITIES.tyler.pubkey;
const CHANNEL_ID = "94a444a4-c0a3-5966-ab05-530c6ddc2301"; // #agents
const NOW = new Date("2026-06-15T12:00:00Z").toISOString();

const MANAGED_AGENTS = [
  {
    pubkey: AGENT_PUBKEY,
    name: "Observer Agent",
    status: "running" as const,
    channelNames: ["agents"],
  },
];

type ObserverEventSeed = {
  seq: number;
  timestamp: string;
  kind: string;
  agentIndex: number | null;
  channelId: string | null;
  sessionId: string | null;
  turnId: string | null;
  payload: unknown;
};

/**
 * Seeded before the bridge: `AppI18nProvider` reads the preference on mount and
 * the bridge is what triggers mount. Seeding afterwards activates English
 * first and then swaps, which is exactly the sequence that hides a
 * resolved-once bug.
 */
async function openTranscriptIn(
  page: Page,
  locale: "en" | "de",
): Promise<Locator> {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: LOCALE_STORAGE_KEY, value: locale },
  );
  await installMockBridge(page, { managedAgents: MANAGED_AGENTS });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => typeof window.__BUZZ_E2E_SEED_OBSERVER_EVENTS__ === "function",
    null,
    { timeout: 15_000 },
  );

  // Reached through the app rather than through
  // `__BUZZ_E2E_MOUNT_AGENT_SESSION_PANEL__`: the direct mount has no router
  // or profile providers, so a user-prompt bubble throws there and takes the
  // whole panel with it. This route is also the one a person takes.
  await page.getByTestId("channel-agents").click();
  await expect(page.getByTestId("chat-title")).toHaveText("agents");
  const messageRow = page
    .getByTestId("message-row")
    .filter({ has: page.getByText("Observer Agent", { exact: false }) });
  await expect(messageRow.first()).toBeVisible({ timeout: 15_000 });
  await messageRow.first().getByRole("button").first().click();
  await expect(page.getByTestId("user-profile-panel")).toBeVisible({
    timeout: 15_000,
  });
  const activity = page.getByTestId(
    `user-profile-view-activity-${AGENT_PUBKEY}`,
  );
  await expect(activity).toBeVisible({ timeout: 10_000 });
  await activity.click();

  const panel = page.getByTestId("agent-session-thread-panel");
  await expect(panel).toBeVisible({ timeout: 15_000 });
  return panel;
}

async function seed(page: Page, events: ObserverEventSeed[]): Promise<void> {
  await page.evaluate(
    ({ agentPubkey, evts }) => {
      window.__BUZZ_E2E_SEED_OBSERVER_EVENTS__?.({
        agentPubkey,
        events: evts,
      });
    },
    { agentPubkey: AGENT_PUBKEY, evts: events },
  );
}

/** One `session/update` observer frame. */
function sessionUpdate(seq: number, update: Record<string, unknown>) {
  return {
    seq,
    timestamp: NOW,
    kind: "acp_read",
    agentIndex: 0,
    channelId: CHANNEL_ID,
    sessionId: "session-001",
    turnId: "turn-001",
    payload: {
      jsonrpc: "2.0",
      method: "session/update",
      params: { update },
    },
  } satisfies ObserverEventSeed;
}

function readFileToolCall(seq: number) {
  return sessionUpdate(seq, {
    sessionUpdate: "tool_call",
    toolCallId: "tool-1",
    title: "read_file",
    rawInput: { path: "src/app.tsx" },
    status: "completed",
  });
}

/**
 * A failed read, carrying the error text the row shows when expanded.
 *
 * `tool_call_update` is the frame that reports an outcome, and `upsertTool`
 * turns `status: "failed"` into `isError`, which is what picks the detail
 * block's heading.
 */
function readFileToolFailure(seq: number) {
  return sessionUpdate(seq, {
    sessionUpdate: "tool_call_update",
    toolCallId: "tool-1",
    title: "read_file",
    rawInput: { path: "src/app.tsx" },
    status: "failed",
    content: [
      {
        type: "content",
        content: { type: "text", text: "ENOENT: no such file" },
      },
    ],
  });
}

test.describe("agent transcript — German", () => {
  test("a tool row renders its verb and object in German", async ({ page }) => {
    const panel = await openTranscriptIn(page, "de");
    await seed(page, [readFileToolCall(1)]);

    // The collapsed row renders the action verb, never the descriptor label:
    // "Read" → "Gelesen", which lived in a plain object literal that the
    // detector never saw and the catalogue gate could not miss.
    await expect(panel.getByText("Gelesen")).toBeVisible({ timeout: 15_000 });
    // Scoped `exact`: the expanded Parameters block repeats the path inside
    // its JSON, so an unscoped match resolves to two elements.
    await expect(panel.getByText("src/app.tsx", { exact: true })).toBeVisible();
  });

  /**
   * The failure *heading*, not the failure label.
   *
   * `failureLabel` — the `{label} failed` suffix whose dedup used to be
   * `label.endsWith("failed")` — turns out not to reach the screen at all in
   * today's UI, so there is nothing here to assert: every descriptor carries
   * an `action`, and `CompactToolSummaryRow` prefers the action verb over the
   * label; failed tools are excluded from `isGroupingEligible`, so the
   * `${label} ×${count}` run summary never shows it either; and a failed
   * message tool is reclassified to `renderClass: "error"`, which drops the
   * "message" presentation that owns the only other render of that label.
   * The suffix is covered at the unit layer instead
   * (`agentSessionToolSummary.test.mjs`).
   *
   * What a person does see on a failed tool is the detail block's heading,
   * which is `isError ? t`Error` : t`Result``.
   */
  test("a failed tool's detail block is headed in German", async ({ page }) => {
    const panel = await openTranscriptIn(page, "de");
    await seed(page, [readFileToolCall(1), readFileToolFailure(2)]);

    const row = panel.getByTestId("transcript-tool-item").first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.locator("summary").click();
    await expect(row).toContainText("ENOENT: no such file");
    await expect(row).toContainText("Fehler");
    await expect(row).not.toContainText("Error");
  });

  test("an error lifecycle row is still classified as an error", async ({
    page,
  }) => {
    const panel = await openTranscriptIn(page, "de");
    await seed(page, [
      {
        seq: 1,
        timestamp: NOW,
        kind: "turn_error",
        agentIndex: 0,
        channelId: CHANNEL_ID,
        sessionId: "session-001",
        turnId: "turn-001",
        payload: { outcome: "error", error: "connection reset" },
      },
    ]);

    // The regression is structural, not textual: the error render class was
    // chosen by `title.toLowerCase().includes("error")`, and German
    // "Turn-Fehler" contains no "error", so the row silently fell through to
    // the ordinary status branch and lost its error styling. The title being
    // German is necessary but not sufficient — assert the branch.
    const row = panel.getByTestId("transcript-lifecycle-item").first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toHaveAttribute("data-lifecycle-tone", "error");
    await expect(row).toContainText("Turn-Fehler");
  });

  test("an approved permission keeps the approve tone", async ({ page }) => {
    const panel = await openTranscriptIn(page, "de");
    await seed(page, [
      {
        seq: 1,
        timestamp: NOW,
        kind: "acp_read",
        agentIndex: 0,
        channelId: CHANNEL_ID,
        sessionId: "session-001",
        turnId: "turn-001",
        payload: {
          jsonrpc: "2.0",
          id: 7,
          method: "session/request_permission",
          params: {
            title: "Run a shell command",
            toolCallId: "tool-9",
            options: [
              { optionId: "opt-allow", kind: "allow_once" },
              { optionId: "opt-reject", kind: "reject_once" },
            ],
          },
        },
      },
      {
        seq: 2,
        timestamp: NOW,
        kind: "acp_write",
        agentIndex: 0,
        channelId: CHANNEL_ID,
        sessionId: "session-001",
        turnId: "turn-001",
        payload: {
          jsonrpc: "2.0",
          id: 7,
          result: { outcome: { outcome: "selected", optionId: "opt-allow" } },
        },
      },
    ]);

    // The regression: the row's icon and colour came from
    // `outcome.startsWith("Approved")`, so every approval in a translated
    // build rendered with the cancelled tone and the cancelled icon.
    const outcome = panel.getByTestId("transcript-permission-outcome");
    await expect(outcome).toBeVisible({ timeout: 10_000 });
    await expect(outcome).toHaveAttribute("data-permission-tone", "approve");
    await expect(outcome).toContainText("Genehmigt");
    // `allow_once` is an ACP identifier and stays verbatim.
    await expect(outcome).toContainText("allow_once");
  });

  test("an untitled permission request does not repeat its heading", async ({
    page,
  }) => {
    const panel = await openTranscriptIn(page, "de");
    await seed(page, [
      {
        seq: 1,
        timestamp: NOW,
        kind: "acp_read",
        agentIndex: 0,
        channelId: CHANNEL_ID,
        sessionId: "session-001",
        turnId: "turn-001",
        payload: {
          jsonrpc: "2.0",
          id: 8,
          method: "session/request_permission",
          params: { toolCallId: "tool-10" },
        },
      },
    ]);

    // The regression: `title !== "Permission requested"` decided whether the
    // heading was repeated in the body, and against a translated fallback it
    // never matched — so the heading appeared twice in every German row.
    const item = panel.getByTestId("transcript-permission-item").first();
    await expect(item).toBeVisible({ timeout: 10_000 });
    const heading = "Berechtigung angefordert";
    await expect(item).toContainText(heading);
    const occurrences = await item.evaluate(
      (el, needle) => (el.textContent ?? "").split(needle).length - 1,
      heading,
    );
    expect(occurrences).toBe(1);
  });

  test("lifecycle and standing-context headings are German", async ({
    page,
  }) => {
    const panel = await openTranscriptIn(page, "de");
    await seed(page, [
      {
        seq: 1,
        timestamp: NOW,
        kind: "acp_write",
        agentIndex: 0,
        channelId: CHANNEL_ID,
        sessionId: "session-001",
        turnId: null,
        payload: {
          jsonrpc: "2.0",
          id: 1,
          method: "session/new",
          params: {
            systemPrompt:
              "<workspace>\nshared team context\n</workspace>\n\n<agent-instructions>\nyou are helpful\n</agent-instructions>\n\n<core-memory>\nremember this\n</core-memory>",
          },
        },
      },
    ]);

    // These eight headings were two duplicated `Record<string, string>` tables
    // of raw English, in a file the ratchet already listed as converted.
    await expect(panel.getByText("System-Prompt")).toBeVisible({
      timeout: 10_000,
    });
    const rail = panel.getByTestId("transcript-lifecycle-item");
    await expect(rail).toHaveCount(0);
    await panel.getByText("System-Prompt").click();
    await expect(page.getByText("Arbeitsbereich")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText("Agent-Anweisungen")).toBeVisible();
    await expect(page.getByText("Kern-Gedächtnis")).toBeVisible();
  });

  test("the event section is found by tag, so the bubble keeps its body", async ({
    page,
  }) => {
    const panel = await openTranscriptIn(page, "de");
    await seed(page, [
      {
        seq: 1,
        timestamp: NOW,
        kind: "acp_write",
        agentIndex: 0,
        channelId: CHANNEL_ID,
        sessionId: "session-001",
        turnId: "turn-001",
        payload: {
          jsonrpc: "2.0",
          id: 2,
          method: "session/prompt",
          params: {
            prompt: [
              {
                type: "text",
                text: '<buzz-event type="@mention">\nEvent ID: abc\nFrom: Alice\nContent: ship it\n</buzz-event>',
              },
            ],
          },
        },
      },
    ]);

    // The regression is the sharpest one here: the lookup that supplies a user
    // bubble's text, author and channel link matched the section's *heading*
    // against "buzz event". That heading is translated AND brand-dependent, so
    // this failed in German — and in English too under any product name but
    // "Buzz", which is every build this fork ships. When it fails the bubble
    // loses its body, so asserting the body is the assertion.
    await expect(panel.getByText("ship it")).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("agent transcript — English control", () => {
  test("the same rows read English under en", async ({ page }) => {
    const panel = await openTranscriptIn(page, "en");
    await seed(page, [readFileToolCall(1), readFileToolFailure(2)]);

    const row = panel.getByTestId("transcript-tool-item").first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText("Read");
    await row.locator("summary").click();
    await expect(row).toContainText("Error");
    await expect(row).not.toContainText("Fehler");
    await expect(row).not.toContainText("Gelesen");
  });

  test("the error row is classified the same way under en", async ({
    page,
  }) => {
    const panel = await openTranscriptIn(page, "en");
    await seed(page, [
      {
        seq: 1,
        timestamp: NOW,
        kind: "turn_error",
        agentIndex: 0,
        channelId: CHANNEL_ID,
        sessionId: "session-001",
        turnId: "turn-001",
        payload: { outcome: "error", error: "connection reset" },
      },
    ]);

    const row = panel.getByTestId("transcript-lifecycle-item").first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toHaveAttribute("data-lifecycle-tone", "error");
    await expect(row).toContainText("Turn error");
    await expect(row).not.toContainText("Turn-Fehler");
  });

  test("standing-context headings read English under en", async ({ page }) => {
    const panel = await openTranscriptIn(page, "en");
    await seed(page, [
      {
        seq: 1,
        timestamp: NOW,
        kind: "acp_write",
        agentIndex: 0,
        channelId: CHANNEL_ID,
        sessionId: "session-001",
        turnId: null,
        payload: {
          jsonrpc: "2.0",
          id: 1,
          method: "session/new",
          params: {
            systemPrompt:
              "<workspace>\nshared team context\n</workspace>\n\n<core-memory>\nremember this\n</core-memory>",
          },
        },
      },
    ]);

    await expect(panel.getByText("System prompt")).toBeVisible({
      timeout: 10_000,
    });
    await panel.getByText("System prompt").click();
    await expect(page.getByText("Workspace")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Core Memory")).toBeVisible();
    await expect(page.getByText("Arbeitsbereich")).toHaveCount(0);
  });
});
