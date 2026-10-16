import { deleteManagedAgent, listManagedAgents } from "@/shared/api/tauri";
import type { ManagedAgent } from "@/shared/api/types";

/**
 * kikeriki fork: persona ids of the bee starter agents the upstream app seeds.
 * The Rust store no longer offers them and onboarding no longer provisions
 * them, so any instance still carrying one of these ids was created by an
 * earlier build and has to go.
 */
const RETIRED_STARTER_PERSONA_IDS = new Set([
  "builtin:fizz",
  "builtin:honey",
  "builtin:bumble",
]);

function normalizeRelayUrl(relayUrl: string | null | undefined) {
  return relayUrl?.trim().replace(/\/+$/, "") ?? null;
}

export function pickRetiredStarterAgents(
  agents: readonly ManagedAgent[],
  relayUrl: string | null | undefined,
): ManagedAgent[] {
  const relay = normalizeRelayUrl(relayUrl);
  return agents.filter(
    (agent) =>
      agent.pubkey.length > 0 &&
      agent.personaId !== null &&
      RETIRED_STARTER_PERSONA_IDS.has(agent.personaId) &&
      (relay === null || normalizeRelayUrl(agent.relayUrl) === relay),
  );
}

/**
 * Delete every leftover starter-agent instance on `relayUrl` through the
 * normal deletion command, so each one is stopped, its key removed, and its
 * identity tombstoned and archived on the relay rather than left behind as a
 * silent member. Scoped to the applied community because the tombstone is
 * published to the relay the app is currently connected to.
 *
 * Idempotent: once the instances are gone, nothing matches.
 */
export async function purgeRetiredStarterAgents(
  relayUrl: string | null | undefined,
  deps: {
    list: typeof listManagedAgents;
    remove: typeof deleteManagedAgent;
  } = { list: listManagedAgents, remove: deleteManagedAgent },
): Promise<number> {
  let agents: ManagedAgent[];
  try {
    agents = await deps.list();
  } catch (error) {
    console.warn(
      "[agents] could not list agents to purge retired ones:",
      error,
    );
    return 0;
  }
  if (!Array.isArray(agents)) return 0;

  const retired = pickRetiredStarterAgents(agents, relayUrl);
  let removed = 0;
  for (const agent of retired) {
    try {
      await deps.remove(agent.pubkey);
      removed += 1;
    } catch (error) {
      console.warn(
        `[agents] could not remove retired starter agent ${agent.name}:`,
        error,
      );
    }
  }
  return removed;
}
