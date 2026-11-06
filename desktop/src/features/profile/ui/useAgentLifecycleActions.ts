import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import * as React from "react";
import { toast } from "sonner";

import {
  isManagedAgentActive,
  respawnManagedAgentWithRules,
  startManagedAgentWithRules,
  stopManagedAgentWithRules,
} from "@/features/agents/lib/managedAgentControlActions";
import { agentPresenceStartBlockReason } from "@/features/agents/lib/useAgentAvailability";
import { clearActiveTurnsForAgentOnStop } from "@/features/agents/managedAgentRuntimeHooks";
import { isRelayRemovedError } from "@/features/agents/managedAgentRelayCleanup";
import { useCommunities } from "@/features/communities/useCommunities";
import type {
  Channel,
  ManagedAgent,
  RelayAgent,
  PresenceStatus,
} from "@/shared/api/types";

export function useAgentLifecycleActions({
  availability,
  channels,
  managedAgent,
  relayAgents,
  startManagedAgent,
  stopManagedAgent,
}: {
  availability: PresenceStatus | undefined;
  channels: readonly Channel[] | undefined;
  managedAgent: ManagedAgent | undefined;
  relayAgents: readonly RelayAgent[] | undefined;
  startManagedAgent: (pubkey: string) => Promise<unknown>;
  stopManagedAgent: (pubkey: string) => Promise<unknown>;
}) {
  const relayUrl = useCommunities().activeCommunity?.relayUrl;
  const handleAgentPrimaryAction = React.useCallback(async () => {
    if (!managedAgent) return;

    try {
      if (isManagedAgentActive(managedAgent)) {
        const result = await stopManagedAgentWithRules({
          agent: managedAgent,
          channels: channels ?? [],
          relayAgents: relayAgents ?? [],
          stopManagedAgent,
        });
        if (managedAgent.backend.type === "local") {
          clearActiveTurnsForAgentOnStop(managedAgent.pubkey);
        }
        const stoppedName = managedAgent.name;
        toast.success(
          result.noticeMessage ?? i18n._(msg`Stopped ${stoppedName}.`),
        );
        return;
      }

      const blockReason = agentPresenceStartBlockReason(false, availability);
      if (blockReason) throw new Error(blockReason);
      await startManagedAgentWithRules({
        agent: managedAgent,
        startManagedAgent,
      });
      const agentName = managedAgent.name;
      toast.success(
        managedAgent.backend.type === "provider"
          ? i18n._(msg`Deploying ${agentName}.`)
          : i18n._(msg`Started ${agentName}.`),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : i18n._(msg`Agent action failed.`),
      );
    }
  }, [
    availability,
    channels,
    managedAgent,
    relayAgents,
    startManagedAgent,
    stopManagedAgent,
  ]);

  const handleAgentRestart = React.useCallback(async () => {
    if (!managedAgent) return;

    try {
      const blockReason = agentPresenceStartBlockReason(
        isManagedAgentActive(managedAgent),
        availability,
      );
      if (blockReason) throw new Error(blockReason);
      await respawnManagedAgentWithRules({
        agent: managedAgent,
        relayUrl,
        startManagedAgent,
        stopManagedAgent,
        onStopped: () => clearActiveTurnsForAgentOnStop(managedAgent.pubkey),
      });
      const restartedName = managedAgent.name;
      toast.success(i18n._(msg`Restarted ${restartedName}.`));
    } catch (error) {
      if (isRelayRemovedError(error)) return;
      toast.error(
        error instanceof Error
          ? error.message
          : i18n._(msg`Agent restart failed.`),
      );
    }
  }, [
    availability,
    managedAgent,
    relayUrl,
    startManagedAgent,
    stopManagedAgent,
  ]);

  return { handleAgentPrimaryAction, handleAgentRestart };
}
