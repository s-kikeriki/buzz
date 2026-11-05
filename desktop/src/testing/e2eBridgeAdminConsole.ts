/**
 * Admin-console fixtures for the e2e bridge.
 *
 * Before this module the mock bridge answered none of the `admin_*` commands,
 * so Settings → Admin rendered a probe error and nothing else: the tab bar,
 * the report and feedback queues, the community pages and the operator roster
 * were unreachable from any browser-driven spec. A rendered-locale assertion
 * over that screen could only have covered the section header.
 *
 * Extracted as a separate module so the fixtures can be read and changed
 * without scrolling e2eBridge.ts, mirroring `e2eBridgeCustomHarnesses.ts`.
 *
 * Reads only. Mutations (`admin_resolve_report`, `admin_put_operator`,
 * `admin_direct_action`, …) are deliberately not handled here: the jsdom
 * suites already drive every mutation path against their own IPC mock, with
 * the idempotency and fencing assertions that matter. Adding half-working
 * mutations here would invite specs to assert against them.
 */

const HOST = "alpha.example.com";
const COMMUNITY_ID = "11111111-1111-4111-8111-111111111111";
const REPORT_ID = "22222222-2222-4222-8222-222222222222";
const FEEDBACK_ID = "33333333-3333-4333-8333-333333333333";
const OPERATOR_PUBKEY = "aa".repeat(32);
const MODERATOR_PUBKEY = "bb".repeat(32);
const RESTRICTED_PUBKEY = "cc".repeat(32);
const AUTHOR_PUBKEY = "dd".repeat(32);

/** The host every admin fixture belongs to. */
export const MOCK_ADMIN_COMMUNITY_HOST = HOST;

/** The origin `get_admin_origin` reports as already saved. */
export const MOCK_ADMIN_ORIGIN = "https://admin.alpha.example.com";

const REPORT_SUMMARY = {
  id: REPORT_ID,
  communityId: COMMUNITY_ID,
  communityHost: HOST,
  reportEventId: "ee".repeat(32),
  reporterPubkey: MODERATOR_PUBKEY,
  targetKind: "event",
  target: "ff".repeat(32),
  targetAuthorPubkey: AUTHOR_PUBKEY,
  // Non-null on purpose: the resolve form suppresses Kick for a report with
  // no channel, so a null here would silently drop one of the six action
  // labels from everything that reads this screen.
  channelId: "44444444-4444-4444-8444-444444444444",
  reportType: "spam",
  note: null,
  // `open` is what makes the resolve form render, which is where the six
  // action labels and the reason-audience copy live.
  status: "open",
  resolvedBy: null,
  resolvedAt: null,
  actionId: null,
  activeAction: null,
  createdAt: "2026-02-01T10:00:00Z",
};

const FEEDBACK_SUMMARY = {
  id: FEEDBACK_ID,
  communityId: COMMUNITY_ID,
  communityHost: HOST,
  bodySummary: "The sidebar scrolls to the top when a thread arrives.",
  // Not `new`: the list only renders a status badge for a triaged entry.
  status: "reviewed",
  receivedAt: "2026-02-01T09:00:00Z",
};

/**
 * Answer an `admin_*` / `*_admin_origin` command, or return `undefined` when
 * the command is not one of this module's.
 *
 * `undefined` rather than a thrown error so the caller's switch keeps its
 * "unknown command" behaviour for everything else.
 */
export function handleMockAdminConsoleCommand(
  command: string,
  payload: unknown,
): unknown {
  switch (command) {
    case "get_admin_origin":
      return MOCK_ADMIN_ORIGIN;
    case "set_admin_origin": {
      const { origin } = (payload ?? {}) as { origin?: string | null };
      // Mirrors `AdminOrigin::parse` returning the canonical form, and `null`
      // for a cleared value.
      return origin ? origin.replace(/\/+$/, "") : null;
    }
    case "admin_discover_origin":
      // Nothing advertised: `get_admin_origin` already returns a saved value,
      // so discovery is never consulted on the happy path.
      return null;
    case "admin_probe":
      return {
        state: "nip98Authorized",
        role: "operator",
        source: "db",
      };
    case "admin_connected_community_host":
      return HOST;
    case "admin_list_reports":
      return [REPORT_SUMMARY];
    case "admin_get_report":
      return {
        ...REPORT_SUMMARY,
        message: {
          authorPubkey: AUTHOR_PUBKEY,
          content: "Buy cheap followers at example.invalid",
          createdAt: "2026-02-01T09:55:00Z",
          deletedAt: null,
        },
      };
    case "admin_list_feedback":
      return [FEEDBACK_SUMMARY];
    case "admin_get_feedback":
      return {
        id: FEEDBACK_ID,
        communityId: COMMUNITY_ID,
        communityHost: HOST,
        eventId: "12".repeat(32),
        submitterPubkey: MODERATOR_PUBKEY,
        body: FEEDBACK_SUMMARY.bodySummary,
        category: "bug",
        status: FEEDBACK_SUMMARY.status,
        tags: [],
        eventCreatedAt: "2026-02-01T08:59:00Z",
        receivedAt: FEEDBACK_SUMMARY.receivedAt,
      };
    case "admin_list_operators":
      return [
        // Config-backed: renders the role as a badge and disables removal,
        // which is where the provenance labels show.
        {
          pubkey: OPERATOR_PUBKEY,
          effectiveRole: "operator",
          sources: ["config"],
        },
        {
          pubkey: MODERATOR_PUBKEY,
          effectiveRole: "moderator",
          sources: ["db"],
        },
      ];
    case "admin_list_communities":
      return {
        items: [{ id: COMMUNITY_ID, host: HOST, icon: null }],
        nextCursor: null,
      };
    case "admin_list_restrictions":
      return {
        items: [
          {
            pubkey: RESTRICTED_PUBKEY,
            banned: true,
            banExpiresAt: null,
            mutedUntil: "2099-01-01T00:00:00Z",
          },
        ],
        nextCursor: null,
      };
    default:
      return undefined;
  }
}

/**
 * The commands this module answers, listed explicitly.
 *
 * Deliberately not `command.startsWith("admin_")`: that would also capture
 * `admin_resolve_report` and the rest of the mutations and answer them with
 * `undefined`, which the console would read as a successful write. An
 * unlisted command falls through to the bridge's unknown-command error, which
 * is the honest answer — the mock has no write path.
 */
export const MOCK_ADMIN_CONSOLE_COMMANDS: ReadonlySet<string> = new Set([
  "get_admin_origin",
  "set_admin_origin",
  "admin_discover_origin",
  "admin_probe",
  "admin_connected_community_host",
  "admin_list_reports",
  "admin_get_report",
  "admin_list_feedback",
  "admin_get_feedback",
  "admin_list_operators",
  "admin_list_communities",
  "admin_list_restrictions",
]);
