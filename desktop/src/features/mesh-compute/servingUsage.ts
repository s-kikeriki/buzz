import type { I18n } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";

import type { MeshServingUsage } from "@/shared/api/tauriMesh";

/**
 * Pure projection of host-side serving usage into a small, politely-worded
 * indicator model for the Share compute card.
 *
 * Single source of truth for "who is using the compute I'm sharing" copy, so
 * the component and its tests agree. Kept pure/total (accepts null = not yet
 * fetched) and defensive (all fields optional-safe via the Rust extractor).
 *
 * `i18n` is a required first parameter rather than a module import, following
 * `adminConsoleLabels`: this is called from a render path, and a default would
 * let a caller resolve the copy once and freeze it in the boot locale.
 *
 * Every count is bound to a local identifier before it reaches a message:
 * lingui names a placeholder after the expression it interpolates, and a dot
 * inside the ICU braces drops the whole message from every compiled catalogue.
 *
 * Distinctions that matter:
 * - `localAttempts` = this machine's OWN agents using the local model. Not a
 *   "someone else is here" signal — surfaced softly as activity, not as a peer.
 * - `remoteAttempts` / `endpointAttempts` = another member consuming this
 *   machine's compute. THIS is the "someone connected to what I'm sharing"
 *   signal.
 */
export type MeshServingIndicator = {
  /** Whether to show anything at all (only while actively sharing). */
  show: boolean;
  /** Someone is being served right now. */
  active: boolean;
  /** A non-local member is (or has been) consuming this machine's compute. */
  hasRemoteConsumers: boolean;
  /** One-line status suitable for the card. */
  label: string;
  /** Longer detail for a tooltip / secondary line. */
  detail: string | null;
};

/**
 * @param i18n  active catalogue — pass `useLingui().i18n` from the render path
 * @param usage  latest snapshot from `meshServingUsage`, or null if not fetched
 * @param isSharing  whether this machine is currently in serve mode (card owns
 *                   this from the toggle model). Usage is only meaningful while
 *                   sharing.
 */
export function deriveServingIndicator(
  i18n: I18n,
  usage: MeshServingUsage | null,
  isSharing: boolean,
): MeshServingIndicator {
  const hidden: MeshServingIndicator = {
    show: false,
    active: false,
    hasRemoteConsumers: false,
    label: "",
    detail: null,
  };
  if (!isSharing || !usage) {
    return hidden;
  }

  const hasRemoteConsumers =
    usage.remoteAttempts > 0 || usage.endpointAttempts > 0;
  const active = usage.inflight > 0;
  const inflight = usage.inflight;
  const tokensPerSecond = Math.round(usage.tokensPerSecond);

  // Remote consumer present (or seen) — the headline case the user asked for.
  if (hasRemoteConsumers) {
    const remote = usage.remoteAttempts + usage.endpointAttempts;
    const peers = usage.peers;
    const label = active
      ? i18n._(msg`In use now by another member · ${inflight} live`)
      : i18n._(
          plural(remote, {
            one: "Used by another member · # request",
            other: "Used by another member · # requests",
          }),
        );
    const detail =
      peers > 0
        ? i18n._(
            plural(peers, {
              one: `# peer on the mesh · ${tokensPerSecond} tok/s`,
              other: `# peers on the mesh · ${tokensPerSecond} tok/s`,
            }),
          )
        : i18n._(msg`${tokensPerSecond} tok/s`);
    return { show: true, active, hasRemoteConsumers: true, label, detail };
  }

  // Only local (this machine's own agents) — show softly as activity.
  if (active) {
    return {
      show: true,
      active: true,
      hasRemoteConsumers: false,
      label: i18n._(msg`Serving your agent · ${inflight} live`),
      detail: i18n._(msg`${tokensPerSecond} tok/s`),
    };
  }
  if (usage.requestsServed > 0) {
    const served = usage.requestsServed;
    return {
      show: true,
      active: false,
      hasRemoteConsumers: false,
      label: i18n._(msg`Idle · no one using it right now`),
      detail: i18n._(
        plural(served, {
          one: "# request served this session",
          other: "# requests served this session",
        }),
      ),
    };
  }

  // Sharing but nothing served yet.
  return {
    show: true,
    active: false,
    hasRemoteConsumers: false,
    label: i18n._(msg`Idle · no one using it yet`),
    detail: null,
  };
}
