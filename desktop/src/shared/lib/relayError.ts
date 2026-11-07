import { msg } from "@lingui/core/macro";

/**
 * Utilities for classifying relay connectivity errors.
 *
 * The Rust backend (`desktop/src-tauri/src/relay.rs`) prefixes every
 * "relay unreachable" error message with this literal string so that the
 * frontend can distinguish a transient connectivity failure (e.g. corporate VPN
 * needs reauth, Cloudflare Access 403) from an application-level error.
 *
 * Contract: the Rust layer MUST emit errors starting with exactly this prefix
 * for any condition where the relay host is unreachable at the network or
 * auth layer. Do not change this string without updating relay.rs in lockstep.
 */
const RELAY_UNREACHABLE_PREFIX = "relay unreachable:";

/**
 * The two sentences shown when the relay is unreachable.
 *
 * Descriptors rather than strings: these are module constants, so a resolved
 * string would freeze in whatever locale was active when this module was first
 * imported — and it is imported from the home screen, i.e. on the boot path.
 * Resolve them at the display site with `i18n._()`.
 *
 * Note what is *not* translated: the `message` the relay itself sends. The
 * `new Error(message || "Relay rejected the event.")` fallbacks in
 * `shared/api` stay English on purpose — the relay's own wire text wins
 * whenever it has any, and it is never translatable, so translating only the
 * silent branch buys one German sentence and leaves the common path English.
 * Those four files are deliberately not on the coverage ratchet; translating
 * that surface needs its own pass at the display boundary. These two constants
 * are different: they are the app's own sentences about a network condition,
 * chosen by the frontend, never a relay payload.
 */
export const RELAY_UNREACHABLE_SHORT = msg`Can't reach the relay.`;
export const RELAY_UNREACHABLE_MESSAGE = msg`Can't reach the relay — check your VPN or network connection.`;

/**
 * Returns true when `error` carries the stable Rust-layer prefix indicating
 * the relay is unreachable (network failure, VPN reauth needed, etc.).
 *
 * Accepts both `Error` instances and raw strings so callers can pass whatever
 * the Tauri IPC or WebSocket layer hands them without pre-normalizing.
 */
export function isRelayUnreachableError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.startsWith(RELAY_UNREACHABLE_PREFIX);
  }
  if (typeof error === "string") {
    return error.startsWith(RELAY_UNREACHABLE_PREFIX);
  }
  return false;
}

/**
 * Returns true only for the relay's own statement-deadline answer: HTTP 503
 * `query timed out` or WS CLOSED `error: query timed out`. Retrying re-runs
 * the same expensive query, so callers should not. Client-side timeouts
 * (`request timed out`) are network stalls and stay retryable.
 */
export function isQueryDeadlineError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("query timed out");
}
